output "cloudfront_domain" {
  description = "CNAME target for blog.nubicode.com if DNS is not on Route 53"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "cloudfront_distribution_id" {
  description = "→ GitHub secret CLOUDFRONT_DISTRIBUTION_ID"
  value       = aws_cloudfront_distribution.site.id
}

output "deploy_role_arn" {
  description = "→ GitHub secret AWS_ROLE_ARN"
  value       = aws_iam_role.deploy.arn
}

output "bucket" {
  value = aws_s3_bucket.site.bucket
}

output "certificate_arn" {
  value = local.cert_arn
}
