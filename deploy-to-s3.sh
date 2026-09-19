#!/usr/bin/env bash
# Deploy dist/ to S3 + invalidate CloudFront. Usage: ./deploy-to-s3.sh [bucket] [distribution-id]
set -euo pipefail
BUCKET="${1:-${S3_BUCKET:-nubicode-blog}}"
DIST="${2:-${CLOUDFRONT_DISTRIBUTION_ID:-}}"
[ -d dist ] || { echo "run 'npm run build' first"; exit 1; }
aws s3 sync dist/ "s3://$BUCKET/" --delete --exclude "*.html" --exclude "*.xml" --exclude "*.txt" --cache-control "public,max-age=31536000,immutable"
aws s3 sync dist/ "s3://$BUCKET/" --exclude "*" --include "*.html" --include "*.xml" --include "*.txt" --cache-control "public,max-age=300"
[ -n "$DIST" ] && aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null && echo "invalidated $DIST"
echo "deployed to s3://$BUCKET"
