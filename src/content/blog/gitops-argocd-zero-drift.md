---
title: "GitOps with ArgoCD: zero config drift across multi-cloud Kubernetes"
description: "ArgoCD on a multi-cloud AI agent platform: app-of-apps, versioned Helm charts from GitHub Actions, selfHeal and prune, and what zero drift actually required."
pubDate: 2026-10-21
tags: [argocd, gitops, kubernetes, helm, github-actions]
proof: [PP-06, PP-07, PP-08]
tldr: "Zero drift for nine months came from four things: kubectl apply was not an option, every chart had a version, ArgoCD self-healed and pruned, and every cluster was bootstrapped the same way. Discipline was not one of them."
---

## The problem GitOps actually solves

Config drift is not a tooling problem; it's a *permissions* problem. If a human can `kubectl apply` in production, someone will, at 2am, with good intentions, and the cluster will quietly diverge from the repo.

For an AI agent platform running on Kubernetes across more than one cloud, we needed every cluster to be provably identical to a Git commit. Here's the setup that got us nine months without a drift incident.

## Architecture

```
GitHub (platform-charts) ──GitHub Actions──▶ OCI registry (Helm charts, semver)
                                                      │
GitHub (platform-envs) ──▶ ArgoCD (per cluster) ──────┘
   envs/
     prod-aws/    apps.yaml  (app-of-apps)
     prod-gcp/    apps.yaml
     staging/     apps.yaml
```

Two repos. **Charts** are built and published as versioned OCI artifacts. **Envs** hold only `Application` manifests and `values.yaml` per environment. ArgoCD in each cluster watches its env folder.

## Publishing charts from GitHub Actions

Every chart gets a semver from the tag. No `latest`. The workflow, trimmed:

```yaml
name: publish-charts
on:
  push:
    tags: ["charts/*/v*"]
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write, id-token: write }
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
      - run: |
          CHART=$(echo "$GITHUB_REF_NAME" | cut -d/ -f2)
          VERSION=$(echo "$GITHUB_REF_NAME" | cut -d/ -f3 | sed 's/^v//')
          helm lint charts/$CHART
          helm package charts/$CHART --version $VERSION --app-version $GITHUB_SHA
          echo "$GITHUB_TOKEN" | helm registry login ghcr.io -u $GITHUB_ACTOR --password-stdin
          helm push $CHART-$VERSION.tgz oci://ghcr.io/nubicode-org/charts
```

`appVersion` is the Git SHA. Immutable. When something is wrong in prod, `helm list` tells you the exact commit.

## The Application that doesn't drift

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mcp-gateway
  namespace: argocd
  finalizers: [resources-finalizer.argocd.argoproj.io]
spec:
  project: platform
  source:
    repoURL: ghcr.io/nubicode-org/charts
    chart: mcp-gateway
    targetRevision: 1.4.2
    helm:
      valueFiles: [$values/envs/prod-aws/mcp-gateway/values.yaml]
  sources:
    - repoURL: https://github.com/nubicode-org/platform-envs
      targetRevision: main
      ref: values
  destination:
    server: https://kubernetes.default.svc
    namespace: mcp
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
      - ApplyOutOfSyncOnly=true
    retry:
      limit: 5
      backoff: { duration: 30s, factor: 2, maxDuration: 5m }
```

Three lines do the work:

- `selfHeal: true` — a manual change in the cluster is reverted within seconds.
- `prune: true` — a resource removed from Git is removed from the cluster.
- `ServerSideApply=true` — avoids the last-applied-annotation size limits and field-ownership fights with operators.

## App-of-apps per cluster

Each env folder has one root `Application` pointing at a directory of `Application` manifests. Bootstrapping a new cluster is: install ArgoCD, apply the root app, walk away. A GCP cluster and an AWS cluster differ only in their `values.yaml` files, which are diffable in a PR.

## Removing the escape hatch

This is the part teams skip. We removed `kubectl` write access to production namespaces for humans. Break-glass was a time-boxed role via the cloud IAM, audited, and ArgoCD would revert whatever was done the moment the role expired anyway.

"Zero drift" was not a KPI we hit through discipline. It was a consequence of there being no other path.

## Observability on the sync loop

The OpenTelemetry Collector on each cluster scraped ArgoCD's metrics (`argocd_app_sync_total`, `argocd_app_info{sync_status,health_status}`) and shipped them to both Azure Monitor and Google Cloud Monitoring from the same pipeline. One alert mattered: any app `OutOfSync` for more than 10 minutes. It fired twice in nine months; both were expired registry credentials, not drift.

## Results

| Metric | Value |
|---|---|
| Drift incidents (9 months) | 0 |
| Clusters bootstrapped identically | all, via app-of-apps |
| Time to bootstrap a new cluster | under an hour after infra exists |
| Human `kubectl apply` in prod | not possible without break-glass |

## What we'd do differently

- Start with ApplicationSets for the per-cluster fan-out instead of copying `Application` files between env folders.
- Sign charts (cosign) from day one and enforce verification in ArgoCD.
- Put the values repo under CODEOWNERS earlier; the first two weeks had too many single-approver merges.

We run this pattern for US teams standing up AI and platform workloads on Kubernetes. The MCP gateway chart referenced above will be published as `nubicode-org/helm-mcp-gateway`.
