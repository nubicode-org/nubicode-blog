variable "aws_profile" {
  description = "AWS CLI profile"
  type        = string
  default     = "personal"
}

variable "domain" {
  description = "Blog hostname"
  type        = string
  default     = "blog.nubicode.com"
}

variable "bucket_name" {
  description = "S3 bucket for the built site (private, served via CloudFront OAC)"
  type        = string
  default     = "nubicode-blog"
}

variable "acm_certificate_arn" {
  description = "Existing ACM cert (us-east-1) covering the blog hostname. Leave empty to look up the newest ISSUED cert matching acm_lookup_domain."
  type        = string
  default     = ""
}

variable "acm_lookup_domain" {
  description = "Domain to search ACM for when acm_certificate_arn is empty (the cert must list blog.nubicode.com as a SAN or be a wildcard)."
  type        = string
  default     = "*.nubicode.com"
}

variable "route53_zone_id" {
  description = "Hosted zone for nubicode.com. Leave empty if DNS lives elsewhere (Wix/registrar); then create the CNAME manually from the output."
  type        = string
  default     = ""
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN in this account. Leave empty to create one."
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "owner/repo allowed to assume the deploy role"
  type        = string
  default     = "nubicode-org/nubicode-blog"
}
