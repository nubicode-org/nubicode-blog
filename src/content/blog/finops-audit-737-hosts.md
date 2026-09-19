---
title: "FinOps audit of 737 hosts: the script, the buckets, the savings"
description: "How we inventoried 737 hosts across three clouds, sorted them into four buckets, and found the savings before buying a single Savings Plan."
pubDate: 2026-10-07
tags: [finops, aws, gcp, azure, kubernetes]
image: /images/finops-audit.png
proof: [PP-01]
tldr: "Inventory by script, bucket by evidence (keep / rightsize / decommission / ask), price the buckets, commit last. The deliverable is a re-runnable job, not a PDF."
---

## The starting point

An AI/analytics platform, three clouds, 737 hosts, and a bill that had grown faster than the team. Nobody was doing anything wrong. The estate had simply been built by more people than currently worked there.

The ask was "reduce cloud cost." The first thing we did was refuse to open Cost Explorer.

Cost tooling tells you what you spend. It doesn't tell you what a host is *for*, and that's the only question that produces savings you can defend in a room with the engineers who own the workloads.

## Step 1 — Inventory by script

We wanted one CSV with one row per host, same columns regardless of cloud. The columns:

| Column | Why |
|---|---|
| `cloud`, `account`, `region`, `id`, `name` | Identity |
| `owner` (tag), `service` (tag), `env` (tag) | Accountability — empty is a finding |
| `type`, `vcpu`, `mem_gb` | Cost driver |
| `cpu_p95_30d`, `mem_p95_30d` | Rightsizing evidence |
| `last_deploy` | From the deploy pipeline or instance launch time |
| `volumes_gb`, `public_ip`, `lb_attached` | Orphan and exposure hints |
| `monthly_cost` | From billing export, joined on resource ID |

The AWS side, trimmed:

```bash
aws ec2 describe-instances --query 'Reservations[].Instances[].{id:InstanceId,type:InstanceType,launch:LaunchTime,tags:Tags,pub:PublicIpAddress}' --output json \
| jq -r '.[] | [.id,.type,.launch,(.tags|from_entries|.owner//""),(.tags|from_entries|.service//""),(.pub//"")] | @csv'
```

p95 utilization from CloudWatch, 30 days, per instance:

```bash
aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=$ID --statistics p95 --period 86400 \
  --start-time $(date -u -d '30 days ago' +%FT%TZ) --end-time $(date -u +%FT%TZ) --extended-statistics p95
```

Memory needs an agent (CloudWatch agent, Ops Agent, Azure Monitor agent). Where there was none, we wrote `mem_p95_30d = unknown` and moved on. Unknown is data.

For Kubernetes nodes we joined on the node's instance ID and added `pods_running` and `requests_vs_allocatable` from `kubectl top` and the scheduler view. An underutilized *node pool* is a different fix than an underutilized VM.

The whole thing runs in about 20 minutes for 737 hosts and lands in a CSV in a bucket. That matters later.

## Step 2 — Bucket by evidence

Four verdicts, applied mechanically first, reviewed by humans second:

| Verdict | Rule |
|---|---|
| **decommission** | no owner AND no deploy in 90 days AND (no LB, no traffic) |
| **rightsize** | cpu_p95 < 20% AND mem_p95 < 40% (or unknown) AND not a K8s node |
| **ask** | owner empty, or metrics unknown, or contradictory signals |
| **keep** | everything else, this pass |

On day one, roughly a third of the fleet landed in **ask**. That column is the actual work. We sent each service owner a five-line email: here are your hosts, here's what we see, pick a verdict by Friday or we pick "rightsize."

Two weeks later, "ask" was under 5%.

## Step 3 — Price the buckets

Before any conversation about commitments, we priced each bucket using the billing export joined on resource ID:

1. **Decommission** — 100% of the host's monthly cost plus attached storage and any public IP.
2. **Rightsize** — delta between current type and the smallest type whose capacity is ≥ 1.5 × p95 (headroom is not optional).
3. **Orphans** — unattached volumes, snapshots past retention, idle NAT gateways, load balancers with zero healthy targets. Boring. Real.
4. **Commitments** — Savings Plans / committed-use discounts on the *surviving* fleet only.

The order is the point. Commitments on a fleet you're about to shrink are a discount on waste, and they lock you in for one to three years.

## Step 4 — Commit last

Once the fleet stabilized (about six weeks in), we sized commitments on the post-cleanup baseline. Compute Savings Plans on AWS for flexibility across families; committed-use discounts on GCP per region; reserved instances on Azure where the workload was clearly static.

## What we found, roughly

Client-safe summary of where the savings came from, in order of size:

| Source | Share of identified savings |
|---|---|
| Decommission (no owner, no traffic) | largest |
| Rightsizing over-provisioned VMs | second |
| Orphaned storage, NAT, LBs, public IPs | third |
| Commitments on the remaining fleet | fourth |

We're deliberately not publishing the dollar figure. The shape is what transfers: cleanup beats commitments, and the "ask" bucket is where the money hides.

## Step 5 — Make it a cron job

The inventory script runs monthly now. Output goes to the same bucket, and a small job diffs the new CSV against the previous one: new hosts without an owner tag, hosts whose p95 dropped below threshold, volumes that became unattached. The diff posts to a Slack channel.

That's the deliverable. Not a 40-page PDF. A job, a CSV, and a diff.

## What we'd do differently

- Enforce `owner` and `service` tags at provisioning (SCPs / policy) *before* the audit. Half of the "ask" bucket was a tagging problem.
- Install the memory agent fleet-wide in week one instead of accepting `unknown`.
- Treat Kubernetes node pools as their own audit with requests vs. allocatable as the primary signal. VM rules gave misleading answers there.

## Get the script

The inventory script is being cleaned up for release as `nubicode-org/finops-inventory` on GitHub. Follow [NubiCode on LinkedIn](https://www.linkedin.com/company/NubiCode-org/) for the release.
