terraform {
  required_version = "= 1.14.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "= 7.41.0"
    }
  }
}
