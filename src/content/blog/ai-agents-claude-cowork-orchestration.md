---
title: "AI agents with Claude: chat, Cowork, Claude Code and orchestration"
description: "When to use Claude chat, Cowork, Claude Code or the Agent SDK, and what it takes to run an AI agent orchestrator in production: gateway, permissions, audit."
pubDate: 2026-10-07
tags: [ai-agents, claude, cowork, orchestration, mcp]
proof: [PP-06, PP-08, PP-15, PP-16]
image: /images/ai-agents-claude-cowork-orchestration/cover.png
imageAlt: "AI agents with Claude: chat, Cowork, Claude Code and orchestration — Plan. Delegate. Verify. In production."
tldr: "Use chat for answers, Cowork to hand off multi-step knowledge work on your files, Claude Code for software work, and the Agent SDK when agents run inside your own systems. An orchestrator is one agent that plans, delegates to narrowly-scoped workers, and checks their output. In production it needs the same things as any platform service: one gateway for tools, least privilege per worker, versioned deploys, and an audit line per tool call."
---

Most teams we talk to already pay for Claude. Few of them can say which part of it should do which job, and fewer still have an agent running against production systems that security has signed off on.

NubiCode is a nearshore cloud-native and AI infrastructure engineering company. We design, deploy and operate AI agent platforms for US teams: an [MCP gateway on Kubernetes](/mcp-gateway-kubernetes) that scales the Model Context Protocol for autonomous agents, an agent platform kept at [zero config drift with ArgoCD](/gitops-argocd-zero-drift), AWS Bedrock inside an ad-tech optimization engine, and [self-hosted inference with LightLLM](/lightllm-inference-kubernetes). This post is the practical guide we give teams before any of that: which Claude surface to use for what, how to delegate work to an agent well, and what changes when one agent starts directing others.

## Agents and orchestrators, in one paragraph each

An **AI agent** is a model running in a loop with tools. You give it an outcome, not a script. It plans, calls tools (read a file, query a database, open a pull request), looks at the results, and keeps going until the outcome is met or it needs you.

An **orchestrator** is an agent whose main tool is other agents. It breaks the outcome into pieces, hands each piece to a worker with its own instructions, tools and context, then checks and combines what comes back. Workers stay small and focused, and none of them sees more than its piece needs. That separation, not a smarter model, is what makes multi-agent work reliable.

## Four ways to use Claude, and when each fits

| Surface | Runs where | Touches | Use it for |
|---|---|---|---|
| **Chat** | claude.ai, desktop, mobile | what you paste or upload | questions, drafts, reviewing a document |
| **Cowork** | Claude apps; local folders via the desktop app | folders and connectors you grant | multi-step knowledge work: research, reports, spreadsheets, file cleanup, recurring tasks |
| **Claude Code** | your terminal, IDE or desktop app | your repo and shell, with permission prompts | software work: features, refactors, reviews, infrastructure changes |
| **Agent SDK / API** | your own services | only the tools you define | agents inside your product or internal platform |

The first three are for people delegating work. The fourth is for engineers building agents that other people (or other systems) use. Most companies need all four, for different teams.

## Cowork: delegating knowledge work

[Cowork](https://claude.com/product/cowork) brings the agent loop behind Claude Code to non-coding work. Instead of answering a message, Claude takes a task, works through it step by step on the folders and connectors you allow, and hands back finished files. It can run tasks on a schedule, group related work into projects with their own files and instructions, and load plugins that bundle skills, connectors and sub-agents for a role or team.

What separates a good delegation from a frustrating one is the brief. Write it like you would for a capable contractor on day one:

```text
Outcome: a one-page summary of last quarter's cloud spend by team, as a .docx
Inputs: the billing exports in /finops/2026-Q3 (CSV) and owners.xlsx
Rules: group by the "owner" tag; anything untagged goes in an "Unowned" row
Done when: totals match the CSVs to the dollar, and the top 5 changes vs Q2
           each have one sentence of explanation
Ask me before: emailing anyone or touching files outside /finops
```

Outcome, inputs, rules, a checkable definition of done, and the line it must not cross. Agents fail most often on the last two: they stop early because "done" was vague, or they act where nobody expected them to.

Five habits make Cowork safe enough for company files, all straight from [Anthropic's safety guidance](https://support.claude.com/en/articles/13364135-use-claude-cowork-safely):

- **Give it a dedicated working folder**, not your home directory, and keep credentials and financial records out of it.
- **Approve manually** for anything irreversible: sending messages, purchases, deleting files. Cowork already asks before permanently deleting anything.
- **Install verified plugins and connectors only**, and read the permissions they request. A local MCP server runs with the same rights as any program on your machine.
- **Start scheduled tasks on low-risk work**, and read the first few outputs before trusting the schedule.
- **On Team and Enterprise plans, stream Cowork events to your SIEM** over OpenTelemetry, so agent activity sits next to everything else security already watches.

## Claude Code: agents for software work

For engineering, Claude Code is the same loop pointed at a repository. Three features turn it from an assistant into a team member:

- **Skills**: packaged instructions, for example "how we write Terraform modules here", that load only when relevant.
- **MCP servers** that connect it to the systems your engineers already use, such as the ticket tracker, the cloud console or the observability stack.
- **Subagents**: specialists with their own prompt, tools and model, which the main session delegates to.

A subagent is a markdown file in the repo, reviewed like code:

```markdown
---
name: infra-reviewer
description: Reviews Terraform and Helm changes for blast radius and missing guardrails. Use after any change under infra/ or charts/.
tools: Read, Grep, Glob, Bash
model: sonnet
---
You review infrastructure diffs. For each change, list what it can break,
which environments it reaches, and whether it is reversible. Flag any
IAM wildcard, public ingress, or resource without tags. Never edit files.
```

The `tools` line is the important one. The reviewer can read and run checks, but it has no write tools, so it cannot "helpfully" fix what it finds. Narrow tools per role is the same principle an orchestrator depends on.

## From one agent to an orchestrator

When a task outgrows one context window or one set of permissions, split it. The [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) exposes the Claude Code loop as a library, including subagents, MCP and permissions, so the orchestrator becomes a normal service you deploy:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const msg of query({
  prompt: "Triage this week's failed deploys and open one ticket per root cause.",
  options: {
    agents: {
      "log-analyst": {
        description: "Reads CI and cluster logs and returns root causes with evidence.",
        prompt: "Return JSON: [{cause, evidence, deploys}]. Read-only.",
        tools: ["mcp__gateway__ci_logs", "mcp__gateway__k8s_events"],
      },
      "ticket-writer": {
        description: "Opens tickets for confirmed root causes. Never closes or edits existing ones.",
        prompt: "One ticket per cause. Link the evidence.",
        tools: ["mcp__gateway__jira_create_issue"],
      },
    },
    mcpServers: { gateway: { type: "http", url: "https://mcp-gateway.internal/mcp" } },
  },
})) {
  if (msg.type === "result") console.log(msg.result);
}
```

The orchestrator plans and verifies. The analyst can only read. The writer can only create tickets. Every tool goes through one MCP endpoint, the gateway, which is where the production work actually happens.

<figure class="diagram">
  <img src="/images/ai-agents-claude-cowork-orchestration/diagram.png" alt="Architecture diagram of AI agent orchestration with Claude. Work starts in Cowork, Claude Code, or your own service built on the Claude Agent SDK, and reaches an orchestrator agent that plans the goal into tasks, delegates each task to a scoped worker, and verifies and merges the results. Workers such as a read-only log analyst, a read-only researcher, and a create-only ticket writer call tools only through one MCP gateway, which holds downstream credentials, authorizes every tool call, holds destructive calls for human approval, and writes one audit event per call. The gateway reaches ClusterIP MCP servers for tickets, code and CI, and data. The orchestrator routes each worker to a model: the Claude API, AWS Bedrock, or self-hosted LightLLM. The whole platform is versioned with Helm and ArgoCD, audited with OpenTelemetry into the SIEM, and keeps humans on irreversible steps." width="1200" height="760" loading="lazy" decoding="async" />
  <figcaption>The orchestrator plans and verifies; workers get only the tools their task needs; the gateway authorizes and records every call.</figcaption>
</figure>

## What a production orchestrator needs

The model is the easy part. These are the pieces we build on every agent platform, each from work we have shipped:

1. **One front door for tools.** Agents and workers connect to a single MCP gateway, never straight to Jira, GitHub or a database. The gateway holds downstream credentials, merges the tool catalog, and is the one place to change policy. We run it on Kubernetes with ClusterIP-only MCP servers behind a NetworkPolicy ([how](/mcp-gateway-kubernetes)).
2. **Least privilege per worker, per call.** The gateway maps each agent identity to a role and authorizes every `tools/call`, deny by default. A worker that cannot see a tool will not plan around it.
3. **Deploy agents like any other service.** Prompts, subagent definitions, gateway policy and MCP servers are versioned and reviewed in pull requests, packaged as Helm charts and reconciled by ArgoCD. That is how we kept an AI agent platform at zero config drift ([how](/gitops-argocd-zero-drift)).
4. **An audit line per tool call.** Which agent, which tool, which decision, how long, how big a result: one structured event per call, with OpenTelemetry spans through gateway, server and downstream API. It is the first dashboard security asks for ([how we ship telemetry to two clouds](/opentelemetry-collector-azure-monitor-google-cloud)).
5. **Put each model where it makes sense.** Not every worker needs a frontier model. We have integrated AWS Bedrock into an ad-tech optimization engine, and run high-throughput self-hosted inference with LightLLM on Kubernetes for high-volume, lower-stakes work ([how](/lightllm-inference-kubernetes)). The orchestrator decides; the gateway routes.
6. **Humans on the irreversible steps.** Destructive or customer-facing tools are marked as such, and the gateway holds those calls for approval instead of executing them.

## A rollout that doesn't scare security

The order we recommend:

1. **Cowork for operations, finance and marketing**, on dedicated folders, with manual approval on, starting with read-and-summarize work.
2. **Claude Code for engineering**, with team skills and read-only reviewer subagents checked into the repo.
3. **A gateway before the third tool integration.** Put MCP behind one authenticated, audited endpoint before agents multiply.
4. **Then an orchestrator** for one recurring, well-defined workflow with a measurable outcome, such as deploy triage, a monthly spend report or ticket routing. Add a second workflow only after the first has run cleanly for a few weeks.

## FAQ

**What is the difference between Claude Cowork and Claude Code?**
Both run the same kind of agent loop. Cowork is aimed at knowledge work on documents, spreadsheets and folders, for anyone on the team. Claude Code is aimed at software work in a repository and shell, for engineers.

**What is an AI orchestrator?**
An agent that splits a goal into tasks, delegates each to a specialized worker agent with limited tools and context, and verifies and combines the results.

**Do we need MCP to build agents?**
Not to start. You need it, or something equivalent, as soon as several agents share tools. One gateway in front of MCP servers is how credentials, permissions and audit stay in one place.

**Is it safe to let Cowork work on company files?**
Yes, if you scope it: a dedicated folder, manual approval for irreversible actions, verified plugins only, and admin monitoring on Team and Enterprise plans.

**Who builds and runs agent orchestration for US companies?**
NubiCode does. We are a nearshore cloud-native and AI infrastructure engineering company with senior engineers working US hours from Baltimore and San Salvador, and AI agent platforms are core to what we build and operate.
