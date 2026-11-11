---
title: "AI agent orchestration tools in 2026: how to choose the right one"
description: "LangGraph, CrewAI, Microsoft Agent Framework, OpenAI and Claude SDKs, Google ADK, Strands, Temporal, n8n: what each is for and how we choose."
pubDate: 2026-11-04
tags: [ai-agents, orchestration, mcp, ai-infrastructure, claude]
proof: [PP-06, PP-07, PP-08, PP-15, PP-16, PP-09, PP-10, PP-17]
image: /images/ai-agent-orchestration-tools-how-to-choose/cover-square.png
imageAlt: "AI agent orchestration tools in 2026: how to choose the right one — The framework is the smallest decision."
tldr: "Pick the platform first and the framework second. Choose the framework by where it must run, who maintains it, how long a run lasts, how visible the control flow must be, and how many model vendors you need: Strands and AgentCore for AWS shops, Microsoft Agent Framework for .NET and Azure, Google ADK for Google Cloud, LangGraph (plus Temporal for long runs) for multi-cloud Kubernetes, Mastra or the OpenAI and Claude SDKs for TypeScript teams. Keep tools behind an MCP gateway, models behind an LLM gateway and traces in OpenTelemetry, so swapping frameworks later is one service rewrite, not a platform rebuild."
---

"Which agent framework should we standardize on?" is usually the first question a CTO asks about AI agents. The answer surprises people: it is the smallest decision they will make. The framework decides how an agent loop is written. It does not decide whether security lets that agent near production, whether a four-hour run survives a pod restart, or who gets paged when it loops on a tool call at 2 a.m.

NubiCode is a nearshore cloud-native and AI infrastructure engineering company. We design, deploy and operate the platforms AI agents run on for US teams: a [scaled MCP gateway on Kubernetes](/mcp-gateway-kubernetes) for autonomous agents, an agent platform held at [zero config drift with ArgoCD](/gitops-argocd-zero-drift), AWS Bedrock inside an ad-tech optimization engine, and [self-hosted inference with LightLLM](/lightllm-inference-kubernetes). This is the guide we walk clients through before they commit to a stack: the tools that matter as of November 2026, what each one is actually for, and the questions that pick one in an afternoon instead of a quarter.

## What changed in 2026

If you last looked at this market a year ago, most of your notes are out of date:

- **Everything hit 1.0.** LangGraph and CrewAI shipped 1.0 in October 2025. [Microsoft Agent Framework](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/) went GA on April 3, 2026 as the successor to Semantic Kernel, and [AutoGen is archived](https://github.com/microsoft/autogen) with no further fixes. Mastra reached 1.0 in January, Google ADK for Python 2.0 in May, Pydantic AI v2 in June.
- **Two managed agent builders were wound down.** AWS renamed Bedrock Agents to [Bedrock Agents Classic](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-classic-maintenance-mode.html), closed it to new accounts on July 30, 2026, froze its model catalog and points everyone to AgentCore. OpenAI's [Agent Builder shuts down on November 30, 2026](https://developers.openai.com/api/docs/deprecations), with the Agents SDK as the migration path.
- **The protocols went neutral.** Anthropic [donated MCP](https://anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation) to the Agentic AI Foundation, a Linux Foundation directed fund, in December 2025. A2A reached v1.0 in March and [joined the same foundation](https://aaif.io/blog/a2a-joins-aaif) on August 17, 2026.
- **Durable execution became a plug-in.** On October 30, 2026 Temporal made its [integrations](https://temporal.io/blog/ai-framework-integrations) for the OpenAI Agents SDK, Google ADK, Strands, LangGraph and the Vercel AI SDK generally available.

The lesson from that list: frameworks and managed builders churn on a yearly cycle. The layers under them do not.

## The map: three layers, plus the one you own

<figure class="diagram">
  <img src="/images/ai-agent-orchestration-tools-how-to-choose/diagram.png" alt="Map of AI agent orchestration tools as of November 2026, in four layers. The top layer is visual, low-code builders: n8n with its AI Agent node, self-hosted or in the cloud, and OpenAI Agent Builder, shown greyed out because it shuts down on November 30, 2026; builders are fastest to start but hardest to version, test and review. The second layer is frameworks that hold orchestration logic in your own code: LangGraph with graphs and checkpoints, Microsoft Agent Framework with workflows for .NET and Python, Mastra with TypeScript workflows, LlamaIndex with event-driven workflows, Pydantic AI with typed agents and graphs, the OpenAI Agents SDK with handoffs and guardrails, the Claude Agent SDK with nested subagents, Google ADK with workflows and A2A, Strands Agents with swarm, graph and A2A patterns, and CrewAI with role-based crews and flows. The third layer is runtimes for durability and managed hosting: Temporal for durable execution, LangSmith Deployment with Agent Server, Amazon Bedrock AgentCore on AWS for any framework, Google Cloud Agent Runtime, and Microsoft Foundry hosted agents. Underneath is the platform you own, which stays when the framework changes: an MCP gateway that authorizes and audits every tool call, an LLM gateway for keys, budgets and model routing, OpenTelemetry with one trace per agent run, and GitOps with Helm, ArgoCD and pinned images." width="1200" height="720" loading="lazy" decoding="async" />
  <figcaption>Builders, frameworks and runtimes change every year; the gateways, traces and GitOps underneath are what you keep.</figcaption>
</figure>

Most "which framework" debates mix up three different things:

- **Builders** are visual canvases. You drag an agent node onto a flow and connect it to SaaS apps. Fast for operations teams, hard to put through code review.
- **Frameworks** are libraries. Your orchestration logic (who plans, who delegates, what runs in parallel, when a human approves) lives in your code.
- **Runtimes** keep a run alive and give it somewhere to live: checkpoints, retries, resumption after a crash, managed hosting, memory.

Under all three sits the part nobody sells you as a product, and the part we spend most of our time on: the tool gateway, the model gateway, tracing and deployment. Get that layer right and the framework becomes a replaceable component.

## Five orchestration patterns, and who does each well

| Pattern | How it works | Good for | First-class in |
|---|---|---|---|
| **Workflow** | Fixed steps in code; agents fill in single steps | repeatable business processes | LangGraph, Agent Framework, Mastra, LlamaIndex, ADK 2.0 |
| **Supervisor** | One agent delegates to workers exposed as tools | most multi-agent work | Claude Agent SDK, OpenAI Agents SDK, Strands, Mastra |
| **Handoff** | The active agent transfers the conversation to a specialist | support and triage flows | OpenAI Agents SDK, Agent Framework, LlamaIndex |
| **Graph** | Explicit nodes, edges, state and checkpoints | auditable control flow, loops with exits | LangGraph, Agent Framework, Pydantic Graph, Strands |
| **Crew / swarm** | Peer agents with roles collaborate on a shared goal | research and content pipelines | CrewAI, Strands, Agent Framework group chat |

For production work, the pattern we recommend is a **deterministic workflow with a supervisor agent inside one or two steps**. The workflow gives you the audit trail and the retry boundaries. The agent handles the part that actually needs judgment. Free-form swarms make great demos and hard incident reviews.

## The tools, one honest paragraph each

### Graph and workflow frameworks

**[LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)** (MIT, Python and TypeScript) models an agent system as a state graph with checkpointing, interrupts for human approval and durable execution. It works with any model. Its hosted runtime, renamed [LangSmith Deployment](https://changelog.langchain.com/announcements/product-naming-changes-langsmith-deployment-and-langsmith-studio) in October 2025, now also deploys Strands, Claude Agent SDK and ADK agents. Pick it when control flow must be explicit and reviewable. Watch for: graphs grow fast, so keep each one to a single workflow.

**[Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/)** (MIT, Python and .NET GA, Go in preview) combines agents with graph-based workflows, sequential, concurrent, handoff and group-chat patterns, checkpoints with resume, MCP and OpenTelemetry. It talks to Azure OpenAI, OpenAI, Anthropic, Bedrock, Gemini and Ollama. Pick it for .NET shops and anything landing in Azure. If you are still on AutoGen, plan the move now.

**[Mastra](https://mastra.ai/docs)** (Apache-2.0 core, enterprise license for `ee/` directories) is the strongest TypeScript-native option: agents, graph workflows with suspend and resume, MCP, A2A, tracing and evals, routed across many model providers. Note that agent networks are deprecated in favor of supervisor agents.

**[LlamaIndex Agent Workflows](https://developers.llamaindex.ai/python/llamaagents/workflows/)** (MIT) are event-driven async steps with pluggable durability. LlamaIndex now positions itself as a document processing platform, and that is where its workflows fit best: agents over large document sets.

### Model-vendor agent SDKs

**[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)** (MIT, Python and TypeScript) is small and readable: agents, handoffs, agents-as-tools, guardrails, sessions, built-in tracing and MCP. It is still pre-1.0. It defaults to OpenAI's Responses API and uploads traces to OpenAI unless you change that; other providers work through compatible endpoints, which OpenAI labels best-effort.

**[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)** (Python and TypeScript) is the loop behind Claude Code as a library: context-isolated subagents that can run in parallel and nest, MCP, hooks, permission approvals, skills and resumable sessions. It is Claude-only, but reachable through the Anthropic API, Bedrock, Google Cloud or Microsoft Foundry. Its use falls under Anthropic's Commercial Terms, so do not file it as plain open source. It is our default for agents that do engineering work: code, infrastructure, incident triage. We covered it in depth in [AI agents with Claude](/ai-agents-claude-cowork-orchestration).

**[Google ADK](https://adk.dev/)** (Apache-2.0, Python, TypeScript, Go and Java) offers transfer between agents, agents-as-tools, sequential, parallel and loop agents, and since 2.0 a graph workflow runtime with human approval. MCP and A2A are built in. It is tuned for Gemini but model-agnostic, and deploys to Google Cloud's Agent Runtime, the service previously called Agent Engine.

**[Strands Agents](https://strandsagents.com/latest/)** (Apache-2.0, Python and TypeScript) is AWS's open-source SDK: swarm, graph, workflow and agents-as-tools patterns, A2A, MCP, OpenTelemetry and session persistence, with Bedrock, Anthropic, OpenAI, Gemini and Ollama models. It pairs naturally with [Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html), which runs any framework and adds memory, an MCP gateway, identity, policy and observability.

### Teams and typed agents

**[CrewAI](https://docs.crewai.com)** (MIT, Python) has two layers: crews, which are role-based agent teams, and flows, which are event-driven workflows with state and persistence. It is quick to stand up for research and content pipelines and works with any model. Tracing and deployment live in its paid platform, so price that in.

**[Pydantic AI](https://github.com/pydantic/pydantic-ai)** (MIT, Python) is a typed agent loop with structured outputs validated by Pydantic, Pydantic Graph for explicit control flow, plain OpenTelemetry and first-party durable execution on Temporal, DBOS or Prefect. Pick it when your team already lives in FastAPI and type hints.

### Durable runtimes

**[Temporal](https://github.com/temporalio/ai-integrations)** (MIT SDKs, or Temporal Cloud) is not an agent framework. It is durable execution: every model and tool call becomes an Activity, so a run that dies mid-way resumes exactly where it stopped without repeating a tool call that already succeeded. With the October GA integrations it wraps most major frameworks. When a run lasts longer than a deploy window, or waits days for a human approval, this is the layer we add.

### Low-code

**[n8n](https://github.com/n8n-io/n8n)** puts a LangChain-based AI Agent node, sub-agents, MCP client and server nodes and human approval for tools onto a visual canvas, self-hosted or in their cloud. It is excellent for operations teams automating SaaS glue. It ships under the Sustainable Use License, which is fair-code rather than open source, so have legal read it before you embed it in a product.

## Side by side

| Tool | Languages | Orchestration | Models | License | Survives a crash |
|---|---|---|---|---|---|
| LangGraph | Python, TS | graph | any | MIT | checkpoints |
| Microsoft Agent Framework | Python, .NET, Go (preview) | workflows + patterns | any | MIT | checkpoints |
| Mastra | TS | workflows, supervisor | any | Apache-2.0 + `ee/` | snapshots |
| LlamaIndex Agent Workflows | Python, TS | event-driven | any | MIT | pluggable |
| OpenAI Agents SDK | Python, TS | handoffs, agents-as-tools | OpenAI first | MIT | sessions; Temporal |
| Claude Agent SDK | Python, TS | nested subagents | Claude only | Commercial Terms | resumable sessions |
| Google ADK | Python, TS, Go, Java | workflows, transfer | any, Gemini-tuned | Apache-2.0 | Agent Runtime; Temporal |
| Strands Agents | Python, TS | swarm, graph, workflow | any | Apache-2.0 | sessions; Temporal |
| CrewAI | Python | crews + flows | any | MIT | flow persistence |
| Pydantic AI | Python | typed agents, graphs | any | MIT | Temporal, DBOS, Prefect |
| Temporal | many | durable execution | n/a | MIT | the whole point |
| n8n | visual | agent nodes | any | Sustainable Use | execution history |

## How we choose: six questions

1. **Where does it have to run?** If the data and the security review live in one cloud, start with that cloud's stack: Strands and AgentCore on AWS, Agent Framework and Foundry on Azure, ADK and Agent Runtime on Google Cloud. Multi-cloud or Kubernetes-first teams get a framework they can run on their own cluster.
2. **Who will maintain it?** Python, TypeScript and .NET each have a clear leader. A framework your team cannot debug at 2 a.m. is the wrong one, however good the benchmarks look.
3. **How long does a run last?** Seconds: anything works. Minutes to hours, or waiting on a human: you need checkpoints or durable execution, and you should test them by killing the pod mid-run.
4. **How visible must the control flow be?** Regulated or customer-facing work wants explicit graphs and workflows. Internal research can let the model plan.
5. **One model vendor or several?** The OpenAI and Claude SDKs are the best experience on their own models. If you need to route between the Claude API, Bedrock and [self-hosted inference](/lightllm-inference-kubernetes) per task, choose a model-agnostic framework and put an LLM gateway under it.
6. **What does it emit and speak?** OpenTelemetry traces, MCP for tools, A2A if agents must call agents owned by other teams. All the leaders support MCP now; A2A support is still uneven.

Then we run a short bake-off: one real workflow, two or three candidates, the same tools and the same models for each. The scorecard we use looks like this:

```yaml
# bake-off.yaml: same workflow, same tools, same models, different frameworks
workflow: weekly-deploy-triage
candidates: [langgraph, strands, claude-agent-sdk]
fixed:
  tools: https://mcp-gateway.internal/mcp      # every candidate uses the same MCP gateway
  models: https://llm-gateway.internal/v1      # same LLM gateway, same budget
  dataset: evals/deploy-triage/labeled-cases.jsonl
measure:
  task_success: root cause matches the labeled answer
  cost_per_run_usd: from gateway spend logs
  p95_duration_s: from OpenTelemetry spans
  resume_after_kill: SIGKILL the pod mid-run; it finishes without repeating tool calls
  approval_hold: a destructive tool waits for a human and survives a restart
  trace_quality: one trace per run, every tool call a child span
  glue_code_lines: code we had to write outside the framework
gate:
  must_pass: [resume_after_kill, approval_hold, trace_quality]
```

The `must_pass` line is the one that matters. Task success on the happy path is easy; most candidates get there. What separates them is how they fail.

## Our default picks

| If you are | Start with |
|---|---|
| An AWS shop writing Python | Strands, on AgentCore Runtime or on EKS behind your own gateway |
| A .NET or Azure shop | Microsoft Agent Framework, hosted in Foundry or on AKS |
| On Google Cloud | Google ADK with Agent Runtime |
| Multi-cloud on Kubernetes, needing auditable control flow | LangGraph on your cluster, plus Temporal when runs outlast a deploy |
| A TypeScript product team | Mastra, or the OpenAI or Claude SDK if you are committed to one vendor |
| Building agents for engineering work | Claude Agent SDK with read-only subagents and an MCP gateway |
| An operations team automating SaaS workflows | n8n, self-hosted, calling tools through the same gateway |

## Keep the framework replaceable

Every agent service we deploy, whatever framework is inside, gets the same wiring:

```yaml
# values.yaml for an agent service; the framework inside the image can change
agent:
  image: registry.internal/deploy-triage:3f9c2e1    # Git SHA tag, never latest
  env:
    MCP_GATEWAY_URL: https://mcp-gateway.internal/mcp
    OPENAI_BASE_URL: https://llm-gateway.internal/v1
    ANTHROPIC_BASE_URL: https://llm-gateway.internal
    OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector.observability:4317
    OTEL_SERVICE_NAME: deploy-triage
  serviceAccount:
    automount: false
```

- **Tools go through one MCP gateway**, which holds downstream credentials and authorizes and audits every call ([how we run it](/mcp-gateway-kubernetes)). No framework ever holds a Jira or GitHub token.
- **Models go through one LLM gateway**, with a key per service and a budget per team ([LiteLLM setup](/litellm-ai-gateway-guardrails-cost-control)). Changing providers is a config change, not a code change.
- **Traces go to one OpenTelemetry Collector**, which already ships to [Azure Monitor and Google Cloud at the same time](/opentelemetry-collector-azure-monitor-google-cloud).
- **Deploys go through ArgoCD** with [immutable image tags](/immutable-image-tags-git-sha), and code the agent writes runs in a [sandbox](/sandboxing-ai-agents-kubernetes), not in the agent's own pod.

With that in place, swapping LangGraph for Strands next year means rewriting one service. Without it, it means renegotiating security review for every tool integration again.

## Where teams get burned

- **Choosing on the demo instead of the failure.** Kill the pod mid-run and pull the network on a tool call before you compare features.
- **Starting with a swarm.** Start with one agent and good tools. Add a supervisor only when one context window or one permission set is not enough.
- **Wiring tools straight into the framework.** Every framework has its own tool format. MCP behind a gateway is the one that outlives them.
- **Building on a managed builder with no export path.** Two of them were frozen or shut down this year. If the logic only exists in a vendor console, it is not yours.
- **Skipping the license read.** Commercial terms, fair-code licenses, enterprise-only directories and paid-only tracing all change the total cost.

## Building agent orchestration with NubiCode

Most agent projects don't stall on the framework. They stall on what surrounds it: getting tool access past security, keeping long runs alive through deploys, attributing model spend to teams, and turning a notebook prototype into a service someone is paged for. That platform work is what we do.

A typical engagement covers:

- **The decision.** A short bake-off on one of your real workflows, scored on failure handling, cost and traceability, not on a demo.
- **The platform.** MCP gateway, LLM gateway, OpenTelemetry and GitOps on your Kubernetes and in your cloud, so the framework you pick stays replaceable.
- **The first workflow in production.** One well-defined, recurring workflow with a measurable outcome, with human approval on irreversible steps.
- **Operations.** Dashboards for spend, latency and tool calls in the observability stack you already use, and a team that answers when it breaks.

The engineers doing this work hold GCP Professional Cloud Architect, Terraform Associate, AWS Solutions Architect Associate and AWS Developer Associate certifications, NubiCode is an AWS Partner, and we work US hours from Baltimore and San Salvador.

## FAQ

**What is the best AI agent orchestration framework in 2026?**
There is no single best one. Match it to your cloud, your team's language and how long your runs last: Strands on AWS, Microsoft Agent Framework on Azure and .NET, Google ADK on Google Cloud, LangGraph for multi-cloud Kubernetes, Mastra for TypeScript, and the Claude Agent SDK for engineering agents.

**LangGraph or CrewAI?**
LangGraph when you need explicit, auditable control flow with checkpoints, in Python or TypeScript. CrewAI when you want role-based agent teams running quickly in Python and are comfortable with its paid platform for tracing and deployment.

**Is AutoGen still maintained?**
No. Microsoft archived AutoGen, and it gets no new features, bug fixes or security fixes. Microsoft Agent Framework, GA since April 2026, is the successor to both AutoGen and Semantic Kernel.

**Do I need Temporal if my framework already has checkpoints?**
Not for runs that finish in minutes. Add durable execution when runs last hours, wait on human approvals for days, or must never repeat a tool call that already succeeded after a crash.

**What happened to Bedrock Agents and OpenAI Agent Builder?**
Bedrock Agents became Bedrock Agents Classic, closed to new AWS accounts on July 30, 2026, with AgentCore as the recommended path. OpenAI Agent Builder shuts down on November 30, 2026, with the Agents SDK as the migration path.

**Who helps US companies choose and run an AI agent orchestration platform?**
NubiCode does. We are a nearshore cloud-native and AI infrastructure engineering company with senior engineers working US hours from Baltimore and San Salvador, and AI agent platforms, MCP gateways and model gateways are core to what we build and operate.

If your team is about to pick a framework, or already picked one and can't get it past security review, that's the right moment to talk. We build the platform first, so the framework choice stays reversible.
