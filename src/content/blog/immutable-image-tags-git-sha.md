---
title: "Stop deploying :latest: immutable image tags with Git SHAs"
description: "Tag images with the Git commit SHA, make the registry refuse overwrites, promote one image from dev to prod, and roll back with git revert."
pubDate: 2026-09-16
tags: [containers, ecr, kubernetes, github-actions, gitops]
image: /images/immutable-image-tags-git-sha/cover.png
imageAlt: "Stop deploying :latest — immutable image tags with Git SHAs — 1 commit = 1 tag, forever"
tldr: "Tag every image with the Git SHA that built it, turn on tag immutability in the registry, build once and promote the same image through every environment, and roll back by reverting a commit. You get a one-line answer to 'what's running in prod?' and rollbacks that can't pick up surprise changes."
---


"What version is running in production?" should take five seconds to answer. On a lot of the clusters we inherit, it takes an afternoon: the Deployment says `api:latest`, the registry says `latest` was pushed three times this week, and nobody is sure which of those pushes the pods pulled.

Mutable tags are the root cause. Here's how we remove them.

<figure class="diagram">
  <img src="/images/immutable-image-tags-git-sha/diagram.png" alt="Pipeline diagram: a git commit is built once by GitHub Actions using an OIDC role and pushed to Amazon ECR tagged with the commit SHA; ECR tag immutability rejects any re-push to the same tag. Promotion copies the same SHA tag from envs/staging/values.yaml to envs/prod/values.yaml in the GitOps repo, ArgoCD syncs each environment and pulls the image by SHA, and rollback is a git revert of the promotion commit." width="1200" height="700" loading="lazy" decoding="async" />
  <figcaption>The tag is the provenance. Promotion and rollback are Git commits.</figcaption>
</figure>

## The problem with `:latest` (and `:v2`, and `:prod`)

A tag is a pointer. Unless the registry forbids it, anyone can move that pointer to a different image. That breaks three things:

- **Auditability.** The manifest in Git says `:prod`; that tells you nothing about the code that's running.
- **Reproducibility.** Two nodes that pulled `:latest` an hour apart can run different code in the same Deployment.
- **Rollback.** "Roll back to the previous `:latest`" is not a thing. The previous image is gone from that tag.

Semantic version tags are better but still mutable unless you enforce otherwise, and they're usually assigned by a human after the build, which is one more step that can drift.

## The rule: one commit, one tag, forever

Every image gets tagged with the full commit SHA that produced it:

```
123456789012.dkr.ecr.us-east-1.amazonaws.com/api:3f9c2e1a7b...
```

Properties we get for free:

- The tag *is* the provenance: `git show <tag>` shows exactly what's inside.
- Tags are unique by construction, so there's nothing to overwrite.
- CI can compute the tag without asking anyone.

You can add a human-friendly tag on top (`v1.14.0`), but deployments reference the SHA.

## Make the registry enforce it

Convention isn't enough; someone will re-run a job with a hand-edited tag. On ECR, turn on tag immutability:

```hcl
resource "aws_ecr_repository" "api" {
  name                 = "api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}
```

Now a push to an existing tag fails. That failure is the point: it means the pipeline tried to change history.

Pair it with a lifecycle policy so the registry doesn't grow forever, and keep enough history to roll back:

```json
{
  "rules": [{
    "rulePriority": 1,
    "description": "Keep last 50 images",
    "selection": {
      "tagStatus": "any",
      "countType": "imageCountMoreThan",
      "countNumber": 50
    },
    "action": { "type": "expire" }
  }]
}
```

## Build once, in CI

```yaml
# .github/workflows/build.yml
name: build
on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        env:
          IMAGE: ${{ steps.ecr.outputs.registry }}/api:${{ github.sha }}
        run: |
          docker build -t "$IMAGE" .
          docker push "$IMAGE"
```

No long-lived AWS keys (GitHub OIDC assumes a role), and the tag is `github.sha`. There is no step where a person chooses a tag.

## Promote the image, not the code

The same image moves through every environment. Promotion is a change to a values file in the GitOps repo, not a rebuild:

```yaml
# envs/staging/api/values.yaml
image:
  repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/api
  tag: 3f9c2e1a7b...
```

```yaml
# envs/prod/api/values.yaml — same tag, one PR later
image:
  repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/api
  tag: 3f9c2e1a7b...
```

ArgoCD syncs each environment from its folder. What you tested in staging is byte-for-byte what reaches prod, because it's the same image.

Rebuilding per environment ("build with `ENV=prod`") quietly breaks this: base images, dependency resolution and build flags can all differ between two builds of the same commit. Push environment differences into runtime config (ConfigMaps, Secrets, env vars), never into the image.

## Pin by digest when it matters

A SHA tag on an immutable repository is already stable. For third-party images you don't control, or for the highest-assurance paths, pin by content digest:

```yaml
image: public.ecr.aws/nginx/nginx@sha256:<64-hex-digest>
# get it with: docker buildx imagetools inspect public.ecr.aws/nginx/nginx:1.27
```

A digest can't be moved by anyone, including the upstream publisher.

## Rollback is `git revert`

With this setup, rolling back prod is:

```bash
git revert <promotion-commit>
git push
```

ArgoCD sees the values file point back at the previous SHA and syncs. Nothing is rebuilt, nothing is re-tagged, and the rollback shows up in the Git history with an author and a reason.

## Answering "what's running?"

```bash
kubectl get deploy api -n prod \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
# …/api:3f9c2e1a7b...

git log -1 3f9c2e1a7b
```

Two commands, one answer, and it matches what the auditor sees in the repo.

## What we'd do differently

- **Enforce it in admission, too.** A Kyverno or Gatekeeper policy that rejects `:latest` (and any tag that isn't a 40-character SHA or a digest) catches the manual `kubectl set image` that bypasses GitOps.
- **Sign images.** Once tags are immutable, adding Sigstore/cosign signatures and verifying them at admission is a small step with a big supply-chain payoff.
- **Start on day one.** Migrating a fleet off mutable tags means touching every chart and pipeline. On a new service it's ten lines of config.
