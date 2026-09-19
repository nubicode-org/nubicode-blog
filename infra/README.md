# infra — blog.nubicode.com

Private S3 bucket + CloudFront (OAC) + existing ACM cert + GitHub OIDC deploy role. Terraform, local state, `AWS_PROFILE=personal`, `us-east-1`.

**Monthly cost at current traffic:** ≈ $0.10 (S3 storage + requests). CloudFront and Route 53 alias queries stay inside the free tier. No NAT, no Lambda, no Route 53 zone required.

## Apply (one time, ~5 min)

Shortcut: `./infra/deploy-blog.sh [--merge]` runs everything below (cert + OIDC + zone lookup, `terraform apply`, GitHub secrets, push, optional squash-merge).

```bash
cd infra
export AWS_PROFILE=personal

# 1. Confirm the cert that already covers blog.nubicode.com (must be us-east-1)
aws acm list-certificates --region us-east-1 \
  --query 'CertificateSummaryList[].[DomainName,CertificateArn,Status]' --output table
# If it's a wildcard *.nubicode.com the default lookup works; otherwise pass the ARN below.

# 2. Reuse an existing GitHub OIDC provider if the account already has one
aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output text

terraform init
terraform plan \
  -var acm_certificate_arn=arn:aws:acm:us-east-1:123456789012:certificate/xxxx \   # omit if wildcard lookup works
  -var github_oidc_provider_arn=arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com \  # omit to create
  -var route53_zone_id=Z0XXXXXXXX                                                  # omit if DNS is at Wix/registrar
terraform apply
```

## After apply

1. **DNS** (if `route53_zone_id` was omitted): create `CNAME blog.nubicode.com → <cloudfront_domain output>` at the registrar / Wix DNS. TTL 300.
2. **GitHub secrets** on `nubicode-org/nubicode-blog`: `AWS_ROLE_ARN` = `deploy_role_arn`, `CLOUDFRONT_DISTRIBUTION_ID` = `cloudfront_distribution_id`. Create the `production` environment (Settings → Environments) — the role trusts `ref:refs/heads/main` and `environment:production`.
3. Merge to `main` → `deploy.yml` builds and syncs `dist/`, invalidates `/*`.
4. Verify: `curl -I https://blog.nubicode.com/` → 200 · `/finops-audit-737-hosts` → 200 · `/nope` → 404 · `/llms.txt` → 200.

## Design notes

- `build.format = "file"` in Astro emits `slug.html`; the CloudFront Function rewrites `/slug` → `/slug.html` so URLs stay extension-free and canonical.
- OAC + `BucketOwnerEnforced` + public-access block: the bucket is never public; only this distribution can read it.
- `Managed-CachingOptimized` + `Managed-SecurityHeadersPolicy`: HSTS, X-Content-Type-Options, frame/referrer policies without custom code.
- `deploy-to-s3.sh` sets `immutable` cache on assets and 5-minute cache on HTML/XML/TXT; invalidation covers the rest.
- Same pattern as `nubicode-webpage` (S3 + CloudFront) so the two sites are operated the same way; this one is just codified.

## Teardown

`terraform destroy` (empty the bucket first: `aws s3 rm s3://nubicode-blog --recursive`).
