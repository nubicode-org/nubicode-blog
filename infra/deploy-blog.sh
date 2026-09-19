#!/usr/bin/env bash
# End-to-end first deploy of blog.nubicode.com from your Mac.
# Prereqs: aws cli v2 (profile "personal"), terraform >= 1.6, gh (fherrera-nubicode), node 20+.
#   ./infra/deploy-blog.sh              # plan + apply + set GitHub secrets + push branch
#   ./infra/deploy-blog.sh --merge      # ...and merge the PR so deploy.yml publishes
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-personal}"
REPO=nubicode-org/nubicode-blog
cd "$(dirname "$0")/.."

echo "→ AWS identity"; aws sts get-caller-identity --query Account --output text

echo "→ existing ACM certs (us-east-1)"
aws acm list-certificates --region us-east-1 --certificate-statuses ISSUED \
  --query 'CertificateSummaryList[].[DomainName,CertificateArn]' --output table
CERT_ARN="${ACM_CERTIFICATE_ARN:-$(aws acm list-certificates --region us-east-1 --certificate-statuses ISSUED \
  --query "CertificateSummaryList[?DomainName=='*.nubicode.com' || contains(SubjectAlternativeNameSummaries, 'blog.nubicode.com')] | [0].CertificateArn" --output text)}"
[ -n "$CERT_ARN" ] && [ "$CERT_ARN" != "None" ] || { echo "!! no ISSUED cert covering blog.nubicode.com. Request one (DNS validation) and re-run with ACM_CERTIFICATE_ARN=arn:..."; exit 1; }
echo "→ using cert $CERT_ARN"

OIDC_ARN=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn,'token.actions.githubusercontent.com')].Arn | [0]" --output text)
[ "$OIDC_ARN" = "None" ] && OIDC_ARN=""
ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name nubicode.com --query "HostedZones[?Name=='nubicode.com.'].Id | [0]" --output text | sed 's#/hostedzone/##')
[ "$ZONE_ID" = "None" ] && ZONE_ID=""
echo "→ oidc: ${OIDC_ARN:-<create>}  route53 zone: ${ZONE_ID:-<none, manual CNAME>}"

cd infra
terraform init -input=false
terraform apply -input=false \
  -var "acm_certificate_arn=$CERT_ARN" \
  -var "github_oidc_provider_arn=$OIDC_ARN" \
  -var "route53_zone_id=$ZONE_ID"
ROLE=$(terraform output -raw deploy_role_arn)
DIST=$(terraform output -raw cloudfront_distribution_id)
CF=$(terraform output -raw cloudfront_domain)
cd ..

echo "→ GitHub secrets"
gh auth switch -u fherrera-nubicode >/dev/null 2>&1 || true
gh secret set AWS_ROLE_ARN --repo $REPO --body "$ROLE"
gh secret set CLOUDFRONT_DISTRIBUTION_ID --repo $REPO --body "$DIST"
gh api -X PUT "repos/$REPO/environments/production" >/dev/null && echo "→ environment 'production' ensured"

echo "→ push branch"; git push

if [ "${1:-}" = "--merge" ]; then
  gh pr merge --repo $REPO --squash --delete-branch --auto || gh pr merge --repo $REPO --squash --delete-branch
  echo "→ merged; deploy.yml is running:"; gh run list --repo $REPO --limit 1
fi

cat <<EOF

DNS (only if route53 zone was <none>): at Wix/registrar add
  blog.nubicode.com  CNAME  $CF   (TTL 300)

Verify once DNS resolves:
  curl -sI https://blog.nubicode.com/ | head -1                       # 200
  curl -sI https://blog.nubicode.com/finops-audit-737-hosts | head -1  # 200
  curl -sI https://blog.nubicode.com/nope | head -1                    # 404
  curl -s  https://blog.nubicode.com/llms.txt | head -3
EOF
