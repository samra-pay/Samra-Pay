provider "google" {
  project = "samra-pay-production"
  region  = "us-east4"
  # Never add default_labels during adoption: that would mutate the project.
  add_terraform_attribution_label = false
}

variable "project_name" { type = string }
variable "project_labels" { type = map(string) }

module "project" {
  source         = "../../modules/project"
  project_id     = "samra-pay-production"
  project_number = "382465561715"
  project_name   = var.project_name
  labels         = var.project_labels
}

import {
  to = module.project.google_project.existing
  id = "samra-pay-production"
}
