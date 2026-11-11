---
title: "Sandboxing AI agents on Kubernetes with Agent Sandbox and gVisor"
description: "A Pod is not a sandbox. How to run agent-generated code on Kubernetes with Agent Sandbox, gVisor, warm pools, default-deny egress and one session per pod."
pubDate: 2026-10-12
tags: [ai-agents, kubernetes, security, claude, ai-infrastructure]
proof: [PP-08, PP-06, PP-07, PP-09, PP-17]
image: /images/sandboxing-ai-agents-kubernetes/cover.png
imageAlt: "Sandboxing AI agents on Kubernetes with Agent Sandbox and gVisor — One session. One sandbox. Default deny."
tldr: "An AI agent that runs code is running code nobody reviewed, so a plain Pod is not enough: it shares the node's kernel, mounts a service account token and can reach the cloud metadata server. Kubernetes Agent Sandbox (kubernetes-sigs, v1.0.6 as of October 8, 2026) adds SandboxTemplate, SandboxWarmPool and SandboxClaim on top of a gVisor RuntimeClass. Run one session per sandbox, deny egress by default, keep credentials in the MCP gateway instead of the sandbox, and ship the whole thing through GitOps."
---

An AI agent that can run `bash` is running code that nobody reviewed, written a few seconds ago by a model. On Kubernetes, the default home for that code is an ordinary Pod, and an ordinary Pod is not a sandbox. It shares the node's kernel with every other workload, mounts a service account token unless you say otherwise, and can usually reach the cloud metadata server and the rest of the cluster network.

NubiCode is a nearshore cloud-native and AI infrastructure engineering company. We build and run AI agent platforms for US teams, including a [scaled MCP gateway on Kubernetes](/mcp-gateway-kubernetes) for autonomous agents and an agent platform held at [zero config drift with ArgoCD](/gitops-argocd-zero-drift). This post is the sandbox layer that sits underneath those agents: where their code actually executes, and what it is allowed to touch.

## Why this matters this month

Three things landed in the last few weeks that make agent sandboxing a platform-team problem rather than a research topic:

- **[Agent Sandbox](https://github.com/kubernetes-sigs/agent-sandbox)**, the Kubernetes SIG Apps subproject, shipped v1.0.6 on October 8, 2026. Its open-source controller serves the `v1beta1` API for sandboxes, templates, warm pools and claims.
- **[Claude Managed Agents self-hosted sandboxes](https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes)** (beta) keep the agent loop on Anthropic's side but move tool execution into infrastructure you control. A GKE Agent Sandbox guide is one of the listed platform guides, and the [Agent Sandbox docs](https://agent-sandbox.sigs.k8s.io/docs/use-cases/anthropic-managed-agents/) walk through the same setup on any cluster.
- **The Kubernetes blog** [noted on October 5](https://kubernetes.io/blog/2026/10/05/scaling-kubernetes-workloads-with-node-swap/) that agentic workloads make node memory pressure worse: they need a large footprint to start, then sit idle between prompts with that memory still resident.

The building blocks are now stable enough to standardize on. The rest of this post is how we put them together.

<figure class="diagram">
  <img src="/images/sandboxing-ai-agents-kubernetes/diagram.png" alt="Architecture diagram of sandboxed AI agents on Kubernetes. Claude Managed Agents runs the agent loop and exposes a work queue. A dispatcher Deployment, which runs no agent code, polls the queue, creates a SandboxClaim for each session and binds the session to the claimed pod over port 8080, while a pool scaler sets warm pool replicas from queue stats. On a tainted gVisor node pool, a SandboxTemplate defines a hardened pod spec and a managed default-deny NetworkPolicy, a SandboxWarmPool keeps pre-started sandboxes ready, and each SandboxClaim takes one sandbox for one session and deletes it afterward. The sandbox pod runs the worker as non-root with a read-only root filesystem, no service account token, all capabilities dropped and no secrets in its environment. Its only allowed egress is the MCP gateway, which holds downstream credentials, authorizes every tool call and audits each one, and an egress proxy with an FQDN allowlist for the model API. The metadata server, the Kubernetes API, other namespaces and the open internet are blocked. Everything is deployed with Helm and ArgoCD, uses Git SHA image tags and is observed with OpenTelemetry." width="1200" height="720" loading="lazy" decoding="async" />
  <figcaption>Each session gets a fresh gVisor sandbox from a warm pool; its only ways out are the MCP gateway and an allowlisted egress proxy.</figcaption>
</figure>

## What a Pod gives away by default

Before any YAML, be clear about what you are closing:

| Default Pod behavior | Why it matters for agent code | Fix |
|---|---|---|
| Shares the host kernel (runc) | A kernel exploit escapes to the node | gVisor or Kata via `runtimeClassName` |
| Mounts a service account token | `bash` can call the Kubernetes API | `automountServiceAccountToken: false` |
| Open egress | Exfiltration, metadata server, internal services | Default-deny NetworkPolicy, explicit allows |
| Long-lived and reused | One session's files leak into the next | One session per sandbox, delete on finish |
| Credentials in env vars | The model can read them back | Credentials live in the MCP gateway, not the pod |

## Step 1: a stronger runtime

[gVisor](https://gvisor.dev/docs/) intercepts system calls in a user-space kernel, so code in the container never talks to the host kernel directly. Kata Containers goes further and runs each pod in a lightweight VM. Agent Sandbox works with either; you pick one with a RuntimeClass:

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
```

On self-managed nodes you install `runsc` and register it with containerd first. On GKE, a Sandbox-enabled node pool does that for you. Taint those nodes so only sandboxes land there, and give the template a matching toleration.

## Step 2: a hardened SandboxTemplate

A `SandboxTemplate` is a reusable blueprint: the pod spec plus the network policy every sandbox from it gets. This is the shape we recommend for an agent worker:

```yaml
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxTemplate
metadata:
  name: agent-worker
  namespace: agent-sandboxes
spec:
  podTemplate:
    spec:
      runtimeClassName: gvisor
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        seccompProfile: { type: RuntimeDefault }
      tolerations:
        - { key: sandbox.gke.io/runtime, operator: Equal, value: gvisor, effect: NoSchedule }   # GKE Sandbox node taint
      containers:
        - name: worker
          image: registry.example.com/agent-worker:3f9c2ab   # Git SHA, never :latest
          ports:
            - { name: dispatch, containerPort: 8080 }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          resources:
            requests: { cpu: 500m, memory: 1Gi, ephemeral-storage: 1Gi }
            limits: { memory: 2Gi, ephemeral-storage: 2Gi }
          volumeMounts:
            - { name: workspace, mountPath: /workspace }
      volumes:
        - name: workspace
          emptyDir: { sizeLimit: 2Gi }
  networkPolicy:
    ingress:
      - from:
          - podSelector: { matchLabels: { app.kubernetes.io/name: sandbox-dispatcher } }
        ports: [{ port: 8080 }]
    egress:
      - to:   # cluster DNS
          - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: kube-system } }
            podSelector: { matchLabels: { k8s-app: kube-dns } }
        ports: [{ port: 53, protocol: UDP }, { port: 53, protocol: TCP }]
      - to:   # every tool call goes through the MCP gateway
          - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: mcp } }
            podSelector: { matchLabels: { app.kubernetes.io/name: mcp-gateway } }
      - to:   # allowlisting egress proxy for the model provider API
          - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: egress } }
            podSelector: { matchLabels: { app.kubernetes.io/name: egress-proxy } }
```

Three details matter more than they look:

- **The controller owns the NetworkPolicy.** It creates one shared policy per template and applies default deny for both directions; your `ingress` and `egress` lists are the only exceptions. If you omit `networkPolicy` entirely, the managed default still blocks private ranges and the metadata server but allows the public internet. For agent workers, don't leave that default in place.
- **NetworkPolicy can't match hostnames.** You can't write "allow `api.anthropic.com`" in plain Kubernetes. Use your CNI's FQDN policy (Cilium `toFQDNs`, GKE `FQDNNetworkPolicy`) or route through an allowlisting egress proxy, as above.
- **Claims can't inject environment variables by default.** `envVarsInjectionPolicy` defaults to `Disallowed`, which is what you want: nothing a caller sends ends up in the sandbox environment.

## Step 3: warm pools and one session per sandbox

Starting a gVisor pod, pulling the image and passing readiness takes seconds. An agent waiting on a tool call notices. A `SandboxWarmPool` keeps pre-started sandboxes ready, and a `SandboxClaim` takes one out of the pool:

```yaml
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxWarmPool
metadata:
  name: agent-worker
  namespace: agent-sandboxes
spec:
  replicas: 4
  sandboxTemplateRef:
    name: agent-worker
---
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxClaim
metadata:
  name: session-7f3a
  namespace: agent-sandboxes
spec:
  warmPoolRef:
    name: agent-worker
  lifecycle:
    shutdownTime: "2026-10-14T18:00:00Z"   # hard ceiling for this session
    shutdownPolicy: Delete
```

Once claimed, the sandbox belongs to the claim, and the pool refills itself. When the claim expires or is deleted, the sandbox goes with it. That gives you the most important property for free: **one session per sandbox, never reused.** Files, processes and anything the model left behind disappear with the session.

Two things will quietly break warm starts: setting `env` or `volumeClaimTemplates` on a claim. Both force a cold start, because a running pod can't gain new environment variables or volumes. Put everything a session needs in the template, and pass the session identity at runtime instead.

## Step 4: plugging in Claude Managed Agents

With [self-hosted sandboxes](https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes), a Managed Agents environment becomes a work queue. Claude runs on Anthropic's side and requests tool calls; your worker executes them and posts results back. The agent's files, processes and network traffic stay in your cluster, while tool inputs and outputs still flow through Anthropic's control plane so the model can see them.

The Kubernetes pattern, as documented in the [Agent Sandbox guide](https://agent-sandbox.sigs.k8s.io/docs/use-cases/anthropic-managed-agents/), has three parts:

1. **A dispatcher**, a small Deployment that long-polls the environment's queue. It runs no untrusted code. For each work item it creates a `SandboxClaim` against the warm pool and POSTs the session and work IDs to the claimed pod on port 8080.
2. **The worker** in each sandbox runs `ant beta:worker run`, which handles exactly one session and exits. When the session goes idle, the sandbox is deleted and the pool refills.
3. **A scaler** that reads queue stats and adjusts the warm pool's `replicas`, so you aren't paying for idle sandboxes overnight.

The credential split is the part to get right. The worker authenticates with an **environment key**, which can only serve that environment's queue. Your Claude API key, which can create agents and sessions, stays with the dispatcher's caller and never reaches the sandbox, because a `bash` tool call can read anything the pod can.

## Step 5: credentials stay in the gateway

The same logic applies to every other tool. If an agent needs Jira, GitHub or a database, the sandbox gets a route to the MCP gateway and nothing else. The gateway holds the downstream credentials, authorizes every `tools/call` per agent identity, and writes one audit event per call, as in [our MCP gateway on Kubernetes](/mcp-gateway-kubernetes). A sandbox that is fully compromised still holds no token worth stealing.

Managed Agents treats this as two independent choices: self-hosting controls where code executes, and [MCP tunnels](https://platform.claude.com/docs/en/agents-and-tools/mcp-tunnels/overview) control how Anthropic reaches MCP servers inside your network. Use both when execution and tool access both need to stay inside your boundary.

## Step 6: run it like any other platform service

None of this is special once it is in Git:

- **GitOps.** RuntimeClass, templates, warm pools, the dispatcher and the gateway policy are Helm charts reconciled by ArgoCD. That is how we keep an AI agent platform at zero config drift ([how](/gitops-argocd-zero-drift)), and it means a loosened egress rule shows up in a pull request, not in an incident review.
- **Immutable images.** The worker image is tagged with a Git SHA, never `:latest` ([why](/immutable-image-tags-git-sha)), so every session can be traced to the exact code it ran in.
- **Telemetry.** Claim latency, warm pool depth, sandbox lifetime and gateway decisions go out as OpenTelemetry signals. We ship the same pipeline to Azure Monitor and Google Cloud at the same time ([how](/opentelemetry-collector-azure-monitor-google-cloud)).

## Size memory for idle, not just for peak

Agent sandboxes spend most of their life waiting for the next prompt. Requests sized for peak make the scheduler pack too few sandboxes per node; limits sized for the average get pods OOM-killed in the middle of a session. Start with a memory request close to the idle footprint you measure, a limit at peak, and a dedicated, tainted node pool so a busy sandbox can't squeeze unrelated workloads. Then keep the warm pool small and let the scaler grow it from queue depth.

## Where this bites

- **gVisor has a cost.** Syscall-heavy and I/O-heavy work runs slower than on runc. Measure your real tool mix, such as package installs, test runs and large file operations, before committing every workload to it. Kata is the alternative when you need VM-grade isolation and closer-to-native I/O.
- **GKE add-on vs open-source API versions.** The open-source controller serves `v1beta1`; the GKE add-on serves `v1alpha1` at the time of writing. Pin the version your controller actually serves in your charts.
- **Sidecars and the default-deny policy.** A service mesh proxy or monitoring agent listening on its own port gets blocked like everything else. Allow those ports explicitly or the sidecar fails its health checks.
- **Outputs need a home.** A sandbox that deletes itself deletes its files. Write deliverables to object storage or a mounted volume before the session ends, not after.

## FAQ

**Is a Kubernetes Pod a secure sandbox for AI agents?**
Not by default. A standard Pod shares the host kernel, mounts a service account token and usually has open egress. Add a gVisor or Kata runtime, disable the token, deny egress by default and run one session per pod.

**What is Kubernetes Agent Sandbox?**
A Kubernetes SIG Apps subproject that adds custom resources for isolated, single-use workloads such as AI agent runtimes: Sandbox, SandboxTemplate, SandboxWarmPool and SandboxClaim. It works with gVisor or Kata Containers for isolation.

**Can Claude Managed Agents run tools inside our own Kubernetes cluster?**
Yes, with self-hosted sandboxes (currently in beta). Claude runs on Anthropic's side, and a worker in your cluster executes the tool calls, so files, processes and network traffic stay in your environment.

**gVisor or Kata Containers for AI agents?**
gVisor is lighter and starts faster, which suits short agent sessions. Kata runs each pod in a lightweight VM and fits workloads that need stronger isolation or closer-to-native I/O.

**Who builds sandboxed AI agent platforms on Kubernetes for US companies?**
NubiCode does. We are a nearshore cloud-native and AI infrastructure engineering company with senior engineers working US hours from Baltimore and San Salvador, and secure AI agent platforms are core to what we build and operate.

If your agents are already running code in your cluster and nobody has asked where, that is the conversation to have first.
