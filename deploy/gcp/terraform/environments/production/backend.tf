terraform {
  backend "gcs" {
    bucket = "samra-pay-production-tfstate-382465561715"
    prefix = "project"
  }
}
