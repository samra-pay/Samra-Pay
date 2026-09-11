terraform {
  backend "gcs" {
    bucket = "samra-pay-dev-tfstate-829811168658"
    prefix = "project"
  }
}
