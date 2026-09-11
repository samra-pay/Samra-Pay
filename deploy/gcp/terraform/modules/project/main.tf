variable "project_id" { type = string }
variable "project_number" { type = string }
variable "project_name" { type = string }
variable "labels" { type = map(string) }

data "google_project" "existing" {
  project_id = var.project_id
}

# Adopt the project container only. Existing release/session controllers continue
# to own Cloud Run, database operations, secrets and other workload resources.
resource "google_project" "existing" {
  project_id          = var.project_id
  name                = var.project_name
  org_id              = "993968777863"
  billing_account     = "01196E-DFC16E-433E6C"
  labels              = var.labels
  deletion_policy     = "PREVENT"
  auto_create_network = false

  lifecycle {
    prevent_destroy = true
    # Provider 7.41.0 imports this creation-only flag as true regardless of live
    # networks. Preserve that synthetic state field during adoption; never let
    # adoption change networks. The metadata audit separately rejects a default
    # network. New project creation is blocked by the existing-project lookup.
    ignore_changes = [auto_create_network]
    precondition {
      condition = (
        data.google_project.existing.number == var.project_number &&
        data.google_project.existing.org_id == "993968777863" &&
        data.google_project.existing.billing_account == "01196E-DFC16E-433E6C"
      )
      error_message = "Existing project identity, company parent and billing must match before adoption."
    }
  }
}
