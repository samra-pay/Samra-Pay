# Bootstrap once with a reviewed administrator plan. Local state is temporary;
# migrate it to the distinct bootstrap bucket immediately after creation.
provider "google" {
  project                         = "samra-pay-production"
  region                          = "us-east4"
  add_terraform_attribution_label = false
}

locals {
  buckets = {
    bootstrap  = { project = "samra-pay-production", number = "382465561715", name = "samra-pay-bootstrap-tfstate-382465561715" }
    dev        = { project = "samra-pay-dev", number = "829811168658", name = "samra-pay-dev-tfstate-829811168658" }
    test       = { project = "samra-pay-test", number = "378050809796", name = "samra-pay-test-tfstate-378050809796" }
    staging    = { project = "samra-pay-staging", number = "934122615631", name = "samra-pay-staging-tfstate-934122615631" }
    production = { project = "samra-pay-production", number = "382465561715", name = "samra-pay-production-tfstate-382465561715" }
  }
}

data "google_project" "existing" {
  for_each   = local.buckets
  project_id = each.value.project
}

resource "google_storage_bucket" "state" {
  for_each                    = local.buckets
  project                     = each.value.project
  name                        = each.value.name
  location                    = "US-EAST4"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning { enabled = true }
  soft_delete_policy { retention_duration_seconds = 604800 }
  labels = { application = "samra-pay", purpose = "terraform-state", environment = each.key }
  lifecycle {
    prevent_destroy = true
    precondition {
      condition = (
        data.google_project.existing[each.key].number == each.value.number &&
        data.google_project.existing[each.key].org_id == "993968777863"
      )
      error_message = "State storage must belong to the verified Samra Pay project and organization."
    }
  }
}

# No IAM grants here. Plan/apply identities need a separately reviewed grant on
# their one bucket. Runtime, build and deployment identities receive none.
# Do not add a bucket retention lock: it would prevent Terraform lock deletion.
