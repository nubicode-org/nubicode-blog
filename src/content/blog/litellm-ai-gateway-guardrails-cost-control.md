---
title: "LiteLLM as an AI gateway: guardrails, budgets and model routing"
description: "One LiteLLM proxy in front of Claude, Bedrock and self-hosted models: a virtual key per app, budgets per team, PII guardrails, fallbacks and spend metrics."
pubDate: 2026-10-14
tags: [ai-infrastructure, llm, litellm, finops, security, kubernetes]
proof: [PP-18, PP-08, PP-15, PP-16, PP-06, PP-07, PP-09, PP-10, PP-17]
image: /images/litellm-ai-gateway-guardrails-cost-control/cover.png
imageAlt: "LiteLLM as an AI gateway: guardrails, budgets and model routing — One key per app. One budget per team."
tldr: "Once more than one application calls an LLM, put a gateway in front of every model. A LiteLLM proxy gives each app its own virtual key, each team a budget and rate limit, runs PII and secret guardrails before a prompt leaves your network, and routes one model name across the Claude API, AWS Bedrock and self-hosted inference with fallbacks. Run it like any platform service: Postgres for keys and spend, Redis once there are two replicas, Helm and ArgoCD for config, Prometheus for spend per team."
---

The first application that calls an LLM gets a provider API key in an environment variable. The fifth one does too, and by then nobody can say which app spent what last month, which one sends customer emails to a model unredacted, or what happens to all five when the provider has a bad afternoon.

NubiCode is a nearshore cloud-native and AI infrastructure engineering company, and integrating AI into the products and platforms our clients already run is what we do: AWS Bedrock inside an ad-tech optimization engine, AI agents connected to internal systems through an MCP gateway, self-hosted LLM inference on Kubernetes. This post is our own production setup for the piece every one of those integrations ends up needing: we run [LiteLLM](https://docs.litellm.ai/) as the model gateway on the AI platforms we build and operate. It sits beside the [MCP gateway on Kubernetes](/mcp-gateway-kubernetes) that governs agent tool calls, in front of the Claude API, AWS Bedrock and [self-hosted LightLLM inference](/lightllm-inference-kubernetes). This post covers the configuration that matters: a key per application, a budget per team, guardrails at the gateway, routing with fallbacks, and how to run the proxy itself.

## Why AI workflows need a model gateway

Every AI workflow ends in the same call: a prompt goes out, tokens come back, someone pays. Without a gateway, each application owns that call end to end, which means each one reimplements, or more often skips, the same five things:

- **Credentials.** Provider keys sit in every app's secrets. Rotating one means a deploy per app.
- **Attribution.** The invoice shows one line per provider, not per team, app or customer.
- **Cost limits.** A retry loop in a batch job can burn a month's budget overnight, and nothing stops it.
- **Data controls.** Whether PII or secrets get redacted depends on which team wrote the client.
- **Provider choice.** Moving a workload from the Claude API to Bedrock, or to a self-hosted model, is a code change in every caller.

A gateway moves all five into one service with one config file. Applications keep using the OpenAI or Anthropic SDK they already have; they just point at a different base URL with a key the platform team issued.

<figure class="diagram">
  <img src="/images/litellm-ai-gateway-guardrails-cost-control/diagram.png" alt="Architecture diagram of LiteLLM as an AI gateway. Four applications, a support chatbot using the OpenAI SDK, an agent orchestrator on the Claude Agent SDK, Claude Code with a key per developer, and batch jobs limited to cheap and local models, each call one LiteLLM proxy with their own virtual key. The proxy authenticates the key and maps it to a team and its allowed models, checks the budget and rate limit and returns ExceededBudget instead of forwarding over-budget calls, runs pre-call guardrails that mask PII, block card numbers and SSNs and strip secrets, routes the request with retries and fallback, runs post-call content guardrails on the response, and meters the cost of each request into Postgres and Prometheus. One model name maps to the Claude API first and AWS Bedrock in the customer's AWS account as a fallback, and a separate name maps to self-hosted LightLLM on Kubernetes with no egress. Postgres holds keys and spend; Redis holds shared rate limits and the cache. The proxy is deployed with Helm and ArgoCD, uses a pinned image, and exports budget-remaining metrics for alerts." width="1200" height="720" loading="lazy" decoding="async" />
  <figcaption>Applications hold a gateway key, never a provider key; the proxy checks budget and guardrails, routes across providers, and records the cost of every call.</figcaption>
</figure>

## Step 1: one model list, many providers

The proxy's `config.yaml` declares every model applications may call. The `model_name` is what clients send. Several deployments can share one name, and `order` decides which is tried first:

```yaml
model_list:
  # Frontier model: Claude API first, Bedrock in our AWS account as fallback
  - model_name: claude-sonnet-5-5
    litellm_params:
      model: anthropic/claude-sonnet-5-5
      api_key: os.environ/ANTHROPIC_API_KEY
      order: 1
  - model_name: claude-sonnet-5-5
    litellm_params:
      model: bedrock/global.anthropic.claude-sonnet-5-5
      aws_region_name: us-east-1
      aws_role_name: os.environ/BEDROCK_ROLE_ARN
      order: 2

  # Cheap tier for classification, routing and summaries
  - model_name: claude-haiku-5-5
    litellm_params:
      model: anthropic/claude-haiku-5-5
      api_key: os.environ/ANTHROPIC_API_KEY

  # Self-hosted LightLLM: OpenAI-compatible, no egress, no per-token bill
  - model_name: local-small
    litellm_params:
      model: openai/local-small
      api_base: http://lightllm-server.inference.svc.cluster.local:8000/v1
      api_key: "none"

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
```

Provider credentials live only here, injected from the cluster's secret store. Bedrock calls assume a dedicated IAM role, so model access is scoped and logged in CloudTrail like any other AWS API call. The LightLLM entry points at a ClusterIP Service, so that traffic never leaves the cluster.

## Step 2: a virtual key per application, a budget per team

Applications never see a provider key. The platform team creates a team per business unit, then a [virtual key](https://docs.litellm.ai/docs/proxy/virtual_keys) per application inside it:

```bash
# A team with a monthly ceiling
curl -s https://llm-gateway.internal/team/new \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"team_alias": "support", "max_budget": 500, "budget_duration": "30d"}'

# A key for one application in that team: allowed models, its own cap, rate limits
curl -s https://llm-gateway.internal/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "team_id": "<support-team-id>",
    "key_alias": "support-chatbot-prod",
    "models": ["claude-sonnet-5-5", "claude-haiku-5-5"],
    "max_budget": 200,
    "budget_duration": "30d",
    "rpm_limit": 600,
    "tpm_limit": 400000,
    "metadata": {"app": "support-chatbot", "env": "prod"}
  }'
```

The dollar figures are illustrative; set them from what each workload actually spends. What matters is the shape:

- **`models`** is an allowlist. The batch classifier gets the cheap tier and `local-small`; it cannot quietly start calling the frontier model.
- **[Budgets](https://docs.litellm.ai/docs/proxy/users)** exist at team, user and key level, with `budget_duration` resetting them on a schedule. When a key or team crosses its ceiling, the proxy rejects the request with an `ExceededBudget` error instead of forwarding it.
- **`rpm_limit` / `tpm_limit`** cap throughput per key, so one runaway job cannot exhaust the provider rate limit every other application shares.
- **Offboarding is one call.** Revoke the key; no provider key rotation, no redeploys.

Every response carries an `x-litellm-response-cost` header, and spend is written per request to Postgres, so cost per app is a query rather than a spreadsheet exercise. That is the same discipline we bring to infrastructure spend in a [FinOps audit](/finops-audit-737-hosts), applied to tokens.

## Step 3: guardrails at the gateway, not in each app

[Guardrails](https://docs.litellm.ai/docs/proxy/guardrails/quick_start) run inside the proxy, so every application gets them whether or not its developers remembered:

```yaml
guardrails:
  # Mask or block PII before the prompt leaves the network
  - guardrail_name: pii-mask
    litellm_params:
      guardrail: presidio
      mode: pre_call
      default_on: true
      pii_entities_config:
        EMAIL_ADDRESS: "MASK"
        PHONE_NUMBER: "MASK"
        PERSON: "MASK"
        CREDIT_CARD: "BLOCK"
        US_SSN: "BLOCK"
      output_parse_pii: true   # restore masked values in the response

  # Strip API keys, tokens and passwords pasted into prompts (Enterprise)
  - guardrail_name: hide-secrets
    litellm_params:
      guardrail: hide-secrets
      mode: pre_call
      default_on: true

  # Content policy on input and output for customer-facing apps
  - guardrail_name: bedrock-content-policy
    litellm_params:
      guardrail: bedrock
      mode: [pre_call, post_call]
      guardrailIdentifier: os.environ/BEDROCK_GUARDRAIL_ID
      guardrailVersion: "1"
      aws_region_name: us-east-1
```

Presidio runs as two small services next to the proxy (an analyzer and an anonymizer, reached through `PRESIDIO_ANALYZER_API_BASE` and `PRESIDIO_ANONYMIZER_API_BASE`), so the prompt text never leaves the cluster to be inspected. `MASK` replaces a value with a placeholder the model can still reason about; `BLOCK` rejects the request outright, which is what you want for card numbers and SSNs.

The `mode` decides when each check runs: `pre_call` on the input before the model sees it, `post_call` on the response before the client does, `during_call` in parallel with the model call. `default_on: true` makes a guardrail mandatory: it runs even if a client sends its own guardrail list or an empty one. The ones we turn on by default are the ones that protect data (PII, secrets); content policies go on the customer-facing keys that need them, because every extra check adds latency. The proxy reports which guardrails ran in the `x-litellm-applied-guardrails` response header, which is what an auditor asks for.

## Step 4: routing, fallbacks and caching

A gateway is also where reliability policy lives:

```yaml
router_settings:
  routing_strategy: simple-shuffle
  enable_pre_call_checks: true
  # Last resort when every claude-sonnet-5-5 deployment is down: a cheaper model
  fallbacks: [{"claude-sonnet-5-5": ["claude-haiku-5-5"]}]
  # Prompt too long for the model's window: send it to one that fits
  context_window_fallbacks: [{"local-small": ["claude-sonnet-5-5"]}]

litellm_settings:
  num_retries: 2
  request_timeout: 60
  allowed_fails: 3
  cooldown_time: 30
  cache: true
  cache_params:
    type: redis
  callbacks: ["prometheus", "otel"]
```

Two levels of failover are at work. Inside one `model_name`, `order` sends traffic to Bedrock when the Claude API deployment errors or is cooling down; applications never notice. Across model names, `fallbacks` downgrade to a cheaper model as a last resort, which is right for a summarizer and wrong for a code reviewer, so decide per model. `context_window_fallbacks` lets high-volume work default to the self-hosted model and escalate only the prompts that don't fit.

Exact-match caching on Redis pays off for repeated, deterministic calls such as classification and embeddings. We do not turn on semantic caching for agent traffic: two prompts that look alike to an embedding model can need different answers once tool results are in the context, and LiteLLM's own docs warn about exactly that.

## Step 5: point every application at it

Because the proxy speaks both the OpenAI and the Anthropic APIs, adoption is configuration, not a rewrite. An OpenAI-SDK service changes its base URL:

```python
import os
from openai import OpenAI

client = OpenAI(base_url="https://llm-gateway.internal", api_key=os.environ["LLM_GATEWAY_KEY"])
client.chat.completions.create(model="claude-haiku-5-5", messages=[...])
```

Claude Code and the Agent SDK read [two environment variables](https://code.claude.com/docs/en/llm-gateway-connect), which an admin distributes through managed settings:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://llm-gateway.internal",
    "ANTHROPIC_AUTH_TOKEN": "<per-developer virtual key>"
  }
}
```

Each developer gets their own key, so usage is attributed per person and per team, and Claude Code's [`allowedProviders`](https://code.claude.com/docs/en/llm-gateway) setting can pin managed machines to the gateway so sessions can't bypass it. Anthropic is clear that it doesn't endorse or audit third-party gateways, and that a gateway has to forward new request fields as Claude Code adds features, so keep the proxy current (more on that below).

## Step 6: run the proxy like a platform service

LiteLLM ships a Helm chart (`oci://ghcr.io/berriai/litellm-helm`) and an image at `ghcr.io/berriai/litellm`. On Kubernetes, what we run looks like this:

- **Postgres is required, not optional.** Virtual keys, budgets and spend logs live there. Without a database the proxy starts, logs a warning, and enforces no budgets. The chart runs schema migrations as a job on each upgrade; proxy pods never migrate on their own.
- **Redis from the second replica onward**, so rate limits, cooldowns and the cache are shared instead of per pod.
- **Config in Git, reconciled by ArgoCD.** `config.yaml`, guardrail policy and Helm values go through pull requests like any other change; that's how we keep an AI agent platform at [zero config drift](/gitops-argocd-zero-drift). Keys and budgets are data, created through the API by a small provisioning job, not by hand in the admin UI.
- **A pinned image tag**, promoted through environments, never `latest` ([why](/immutable-image-tags-git-sha)). The gateway is now on every model call's critical path, and its upgrades deserve the same testing as any other release.
- **Metrics where the platform already looks.** The `prometheus` callback exposes `/metrics` with `litellm_spend_metric`, token counters and remaining budget per team and key; the `otel` callback sends traces through the same OpenTelemetry Collector that already ships to [Azure Monitor and Google Cloud](/opentelemetry-collector-azure-monitor-google-cloud). One alert on `litellm_remaining_team_budget_metric` replaces the end-of-month invoice surprise.
- **ClusterIP plus an internal ingress**, with a NetworkPolicy that lets only labeled namespaces reach it. The master key stays with the platform team.

## Two gateways, two jobs

On an agent platform, the LLM gateway and the MCP gateway are separate services on purpose:

| | LLM gateway (LiteLLM) | MCP gateway |
|---|---|---|
| Governs | model calls: prompts and completions | tool calls: what an agent can do |
| Identity | virtual key per app or developer | agent identity mapped to a role |
| Limits | budgets, rate limits, allowed models | deny-by-default authorization per `tools/call` |
| Protects | data leaving in prompts | systems an agent can change |
| Records | spend and tokens per request | one audit event per tool call |

An agent that can only reach approved models and approved tools, each through one authenticated, metered, logged endpoint, is an agent security can sign off on. We cover the tool side in [running an MCP gateway on Kubernetes](/mcp-gateway-kubernetes) and the orchestration side in [AI agents with Claude](/ai-agents-claude-cowork-orchestration).

## Where this bites

- **Budgets are checked against recorded spend, not reserved up front.** A burst of concurrent long requests can overshoot a ceiling before the next check catches it, and budget resets run on a background schedule. Treat budgets as a firm stop with some slack, and pair them with rate limits.
- **Some features are licensed.** Secret detection, per-model budgets, per-request guardrail parameters and parts of spend reporting are Enterprise features. Check the tier against the controls you need before you design around them.
- **The gateway is now critical path.** Run at least two replicas across zones with a PodDisruptionBudget, and alert on its error rate, not just the providers'.
- **Upgrades are the price of compatibility.** New model features and new Claude Code request fields only work if the proxy forwards them. Budget time for regular upgrades, tested in staging with real client traffic.
- **Lock down `/metrics`.** It carries spend per team. Recent versions require an API key on it by default; if you move metrics to a dedicated port, that listener has no virtual-key auth, so keep it on the cluster network only.

## Integrating AI with NubiCode

Most AI projects don't stall on the model. They stall on everything around it: which workloads deserve a frontier model and which a cheap or self-hosted one, how prompts with customer data get past security review, who owns the bill, and how a prototype becomes a service someone is paged for. That integration work is where we spend our time.

A typical engagement with us covers:

- **Choosing the workloads and the models.** We map each use case to the Claude API, AWS Bedrock in your own account, or self-hosted inference, based on data sensitivity, volume and latency, not on a single vendor.
- **Building the gateways.** The LiteLLM model gateway from this post for prompts and spend, and an [MCP gateway](/mcp-gateway-kubernetes) for agent tool access, both on your Kubernetes and in your cloud.
- **Wiring your applications in.** Existing services, internal tools, Claude Code for your engineers and [AI agents](/ai-agents-claude-cowork-orchestration), each with its own key, budget and guardrails agreed with security and finance up front.
- **Running it in production.** GitOps deploys, pinned releases, spend and latency dashboards in the observability stack you already use, and a team that answers when it breaks.

The engineers doing this work hold GCP Professional Cloud Architect, Terraform Associate, AWS Solutions Architect Associate and AWS Developer Associate certifications, NubiCode is an AWS Partner, and we work US hours from Baltimore and San Salvador.

## FAQ

**What is LiteLLM?**
LiteLLM is an open-source proxy that exposes one OpenAI- and Anthropic-compatible API in front of many model providers, and adds virtual keys, budgets, rate limits, guardrails, routing, fallbacks, caching and spend tracking.

**Do we need an LLM gateway if we only use one provider?**
Once more than one application calls it, yes. The gateway is where per-app keys, budgets, PII redaction and spend attribution live, whether there is one provider behind it or five.

**Can Claude Code run through LiteLLM?**
Yes. Set `ANTHROPIC_BASE_URL` to the proxy and give each developer a virtual key in `ANTHROPIC_AUTH_TOKEN`. Keep the proxy updated so it forwards the request fields newer Claude Code versions send.

**How do LiteLLM guardrails work?**
Each guardrail is configured once in the proxy with a mode: before the model call, after it, or in parallel. Guardrails marked `default_on` run on every request, so PII masking and secret detection apply to every application without code changes.

**Who can help us integrate AI into our existing applications?**
NubiCode integrates AI into existing products and platforms for US companies: model selection across the Claude API, AWS Bedrock and self-hosted inference, LLM and MCP gateways, guardrails and cost controls, and production operations on Kubernetes.

**Who sets up and runs an LLM gateway for US companies?**
NubiCode does. We are a nearshore cloud-native and AI infrastructure engineering company with senior engineers working US hours from Baltimore and San Salvador, and model and tool gateways are core to the AI platforms we build and operate.

If you have five applications calling models with five sets of keys, or one AI integration that hasn't made it past security review yet, that's the right moment to talk. We integrate AI for US teams, gateway first.
