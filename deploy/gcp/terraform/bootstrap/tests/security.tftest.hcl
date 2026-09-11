mock_provider "google" {
  mock_data "google_project" {
    defaults = { org_id = "993968777863" }
  }
}
run "state_is_private_and_recoverable" {
  command = plan
  override_data {
    target = data.google_project.existing["dev"]
    values = { number = "829811168658", org_id = "993968777863" }
  }
  override_data {
    target = data.google_project.existing["test"]
    values = { number = "378050809796", org_id = "993968777863" }
  }
  override_data {
    target = data.google_project.existing["staging"]
    values = { number = "934122615631", org_id = "993968777863" }
  }
  override_data {
    target = data.google_project.existing["production"]
    values = { number = "382465561715", org_id = "993968777863" }
  }
  override_data {
    target = data.google_project.existing["bootstrap"]
    values = { number = "382465561715", org_id = "993968777863" }
  }
  assert {
    condition = alltrue([for b in google_storage_bucket.state :
      b.public_access_prevention == "enforced" && b.uniform_bucket_level_access &&
      !b.force_destroy && b.versioning[0].enabled &&
      b.soft_delete_policy[0].retention_duration_seconds >= 604800
    ])
    error_message = "Every state bucket must prevent public access and retain recoverable versions."
  }
  assert {
    condition     = length(distinct([for b in google_storage_bucket.state : b.name])) == 5
    error_message = "Bootstrap and the four environments must not share state buckets."
  }
}
