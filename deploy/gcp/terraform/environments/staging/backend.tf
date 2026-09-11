terraform {
  backend "gcs" {
    bucket = "samra-pay-staging-tfstate-934122615631"
    prefix = "project"
  }
}
