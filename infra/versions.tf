terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
  # Local state on purpose: one static site, one operator. Move to S3 backend if a second person applies.
}

provider "aws" {
  region  = "us-east-1" # CloudFront + ACM must be us-east-1
  profile = var.aws_profile
  default_tags {
    tags = { Project = "nubicode-blog", ManagedBy = "terraform", Repo = "nubicode-org/nubicode-blog" }
  }
}
