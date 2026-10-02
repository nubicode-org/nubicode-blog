#!/usr/bin/env bash
# Deploy dist/ to S3 + invalidate CloudFront. Usage: ./deploy-to-s3.sh [bucket] [distribution-id]
#
# Cache tiers (CloudFront's CachingOptimized policy honors these; every deploy invalidates /*,
# so s-maxage can be long — the edge only ever serves the latest deploy):
#   _astro/*                 content-hashed → browsers and edge keep forever
#   images, logos, icons     stable names   → browsers 1 day + stale-while-revalidate
#   html, xml, txt, sw.js    documents      → browsers revalidate every visit (cheap 304s)
set -euo pipefail
BUCKET="${1:-${S3_BUCKET:-nubicode-blog}}"
DIST="${2:-${CLOUDFRONT_DISTRIBUTION_ID:-}}"
[ -d dist ] || { echo "run 'npm run build' first"; exit 1; }
DOCS=(--include "*.html" --include "*.xml" --include "*.txt" --include "sw.js")

# Hashed assets first, and never deleted here: a page still open in a tab may reference them.
aws s3 sync dist/_astro "s3://$BUCKET/_astro" --cache-control "public,max-age=31536000,immutable"
# cp (not sync) so changed cache headers are rewritten on existing objects too.
aws s3 cp dist/ "s3://$BUCKET/" --recursive --exclude "_astro/*" --exclude "*.html" --exclude "*.xml" --exclude "*.txt" --exclude "sw.js" \
  --cache-control "public,max-age=86400,s-maxage=31536000,stale-while-revalidate=604800"
aws s3 cp dist/ "s3://$BUCKET/" --recursive --exclude "*" "${DOCS[@]}" --cache-control "public,max-age=0,s-maxage=31536000,must-revalidate"
# Remove pages/files that no longer exist (everything was just uploaded, so this only deletes).
aws s3 sync dist/ "s3://$BUCKET/" --delete --exclude "_astro/*"
[ -n "$DIST" ] && aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null && echo "invalidated $DIST"
echo "deployed to s3://$BUCKET"
