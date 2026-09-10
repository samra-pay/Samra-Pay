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
  project_id      = var.project_id
  name            = var.project_name
  org_id          = "993968777863"
  billing_account = "01196E-DFC16E-433E6C"
  labels          = var.labels
  deletion_policy = "PREVENT"

  lifecycle {
    prevent_destroy = true
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
