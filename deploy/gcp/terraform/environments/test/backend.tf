terraform {
  backend "gcs" {
    bucket = "samra-pay-test-tfstate-378050809796"
    prefix = "project"
  }
}
