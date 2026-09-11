mock_provider "google" {}
variables {
  project_id     = "samra-pay-dev"
  project_number = "829811168658"
  project_name   = "Samra Pay Development"
  labels         = { environment = "dev" }
}
run "reject_source_organization" {
  command = plan
  override_data {
    target = data.google_project.existing
    values = { number = "829811168658", org_id = "614833350075", billing_account = "01196E-DFC16E-433E6C" }
  }
  expect_failures = [google_project.existing]
}
run "reject_wrong_billing" {
  command = plan
  override_data {
    target = data.google_project.existing
    values = { number = "829811168658", org_id = "993968777863", billing_account = "01B42D-76504F-1D2458" }
  }
  expect_failures = [google_project.existing]
}
run "protect_existing_project" {
  command = plan
  override_data {
    target = data.google_project.existing
    values = { number = "829811168658", org_id = "993968777863", billing_account = "01196E-DFC16E-433E6C" }
  }
  assert {
    condition     = google_project.existing.deletion_policy == "PREVENT"
    error_message = "Project deletion must remain prevented."
  }
}
