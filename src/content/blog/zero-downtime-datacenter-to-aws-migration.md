---
title: "Zero-downtime datacenter to AWS: golden AMIs, DMS, Direct Connect"
description: "How we moved a recruitment platform’s ~40-instance .NET fleet and databases from an Ireland datacenter to multi-account AWS with a zero-downtime cutover."
pubDate: 2026-11-04
tags: [aws, migration, packer, dms, direct-connect, eks]
image: /images/dc-to-aws.png
proof: [PP-04, PP-02]
tldr: "Golden AMIs made the fleet disposable, Direct Connect + DMS kept the databases in sync, and a weighted DNS cutover meant the last user never noticed. Decompose the monolith after the move, not during."
---

## Context

An online recruitment platform running a .NET monolith on roughly 40 hand-built Windows instances in a datacenter in Ireland, with SQL Server underneath and a growing analytics need. The goal: land on AWS in a multi-account structure, keep the site up throughout, and set up the monolith to be decomposed afterwards.

The order we chose: **compute first, data second, cutover third, decompose fourth.** Every failed migration story we know reversed at least one of those.

## 1. Multi-account foundation

AWS Organizations with separate accounts for shared services (networking, CI, logging), production, staging, and analytics. Terraform for all of it; the VPC layout mirrored the datacenter's network segments so firewall rules translated one-to-one into security groups during the parallel-run period.

## 2. Golden AMIs with Packer

Every server in the DC was a snowflake. Migrating snowflakes gives you snowflakes in a new location. So step one was making the fleet reproducible:

```hcl
data "amazon-parameterstore" "base" {
  name = "/aws/service/ami-windows-latest/Windows_Server-2019-English-Full-Base"
}

source "amazon-ebs" "web" {
  source_ami    = data.amazon-parameterstore.base.value
  instance_type = "m5.large"
  communicator  = "winrm"
  winrm_username = "Administrator"
  user_data_file = "bootstrap-winrm.ps1"
  ami_name      = "web-{{timestamp}}"
  tags = { GitSha = var.git_sha, Role = "web" }
}

build {
  sources = ["source.amazon-ebs.web"]
  provisioner "powershell" { script = "01-windows-update.ps1" }
  provisioner "windows-restart" {}
  provisioner "powershell" { script = "02-iis-dotnet.ps1" }
  provisioner "powershell" { script = "03-agents.ps1" }   # SSM, Dynatrace
  provisioner "powershell" { script = "04-app-config.ps1" }
  provisioner "powershell" { script = "99-sysprep.ps1" }
}
```

Built on every merge in CI (GoCD then; GitHub Actions now), tagged with the Git SHA, consumed by Auto Scaling Groups through launch template versions. Deploy became "new launch template version + instance refresh." Nobody RDPs into a running box.

## 3. Direct Connect + DMS for the databases

Direct Connect from the DC to the shared-services account gave us a private, predictable path. AWS Database Migration Service ran full load plus continuous replication (CDC) from SQL Server in the DC to RDS SQL Server in production.

Two things that bit us and how we handled them:

- **Identity columns and CDC**: validate row counts *and* checksums per table nightly, not just DMS's own task status.
- **Replication lag during batch jobs**: schedule the DC's heavy nightly jobs to finish before the cutover window and watch `CDCLatencySource` / `CDCLatencyTarget` on the task.

Analytics moved to Amazon Redshift in the analytics account, fed by the same replication path, which removed the reporting load from the transactional database for the first time.

## 4. Parallel run

Two weeks with both environments live, AWS taking read-only synthetic traffic, then a small percentage of real read traffic through weighted Route 53 records. Dynatrace on both sides, same dashboards, so every comparison was apples to apples.

## 5. Cutover

The actual cutover was boring, which is the goal:

1. Freeze writes in the DC for the final CDC catch-up (minutes, not hours, because lag had been near zero for days).
2. Confirm DMS task at zero lag, run the checksum job one last time.
3. Flip Route 53 weights to 100% AWS. TTLs had been lowered to 60 seconds a week earlier.
4. Keep the DC in read-only mode for 48 hours as a rollback path.

Zero downtime. The support inbox didn't notice.

## 6. Decompose after, not during

With the monolith running on disposable instances behind ALBs in AWS, we started carving services out into Docker containers on EKS: the pieces with the clearest boundaries first (search indexing, notifications), each with its own CI pipeline and semantic versioning. The monolith shrank; nothing was rewritten wholesale.

## Results

| Item | Outcome |
|---|---|
| Fleet | ~40 hand-built instances → golden-AMI Auto Scaling Groups |
| Cutover downtime | zero |
| Rollback path | DC read-only for 48h, unused |
| Reporting load on prod DB | moved to Redshift |
| Follow-on | .NET services on EKS, monolith shrinking |

## What we'd do differently

- Put the checksum validation in place before the first full load, not after the first surprise.
- Lower DNS TTLs on day one of the parallel run, not a week before cutover.
- Start the container platform (EKS) earlier so the first decomposed service lands within a month of cutover.

Migrations like this are most of what we do for US companies with an estate that predates the cloud. If yours has a datacenter, a monolith, and a database everyone is afraid of, that's the shape we like.
