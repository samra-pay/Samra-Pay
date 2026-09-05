// Fixed internal reporting scope. No customer, finance, or provider runtime data.
export const REPO = 'samra-pay/Samra-Pay';
// The sole Owner on this fixed health row supplies the canonical default user ID.
export const HEALTH_PAGE = '3d214b38-4266-81c9-93d1-d74cd5bef647';
export const OUTPUTS = {
  activity: 'a38473c0-ebba-4f04-9aee-1d22eb51ce8b',
  periods: '696e5d1f-becf-44a1-8559-02e528d37928',
  health: 'db6cd4b6-115b-472e-92a1-51b9cfb54547',
  merged: 'a012a087-f698-4d69-b170-f247244b060f',
};
export const SOURCES = [
  { kind: 'Task', id: '3d114b38-4266-805a-832d-000b268a539e', title: 'Name', owner: 'Owner', schema: { Development: 'checkbox', Status: 'select', 'Business status': 'select', 'Release evidence': 'rich_text', 'Record state': 'select', 'GitHub PR': 'url', Evidence: 'url' } },
  { kind: 'Project', id: '3d114b38-4266-8014-9c2a-000b980374c8', title: 'Name', owner: 'Lead', schema: { Stage: 'select', 'Latest evidence': 'url' } },
  { kind: 'Milestone', id: '3d114b38-4266-804d-bbe3-000b534dd87e', title: 'Project name', owner: 'Owner', schema: { Status: 'status', Evidence: 'url' } },
  { kind: 'Document', id: '3d114b38-4266-8082-982c-000b9cb33bac', title: 'Name', owner: 'Owner', schema: { Status: 'status', 'Record state': 'select', Evidence: 'url' } },
  { kind: 'Meeting', id: '3d114b38-4266-80e4-bb0e-000ba90d4bf1', title: 'Name', owner: 'Owner', schema: {} },
  { kind: 'Partner', id: 'e8d79903-0268-4207-98f6-df199e3fd257', title: 'Name', owner: 'Owner', schema: {} },
  { kind: 'Readiness', id: '3fcb47ed-b63e-4cb5-a414-a6bb8c3d091a', title: 'Name', owner: 'Owner', schema: { Status: 'select', Type: 'select', 'Acceptance evidence': 'rich_text', Evidence: 'url' } },
];
export const METRICS = {
  'PRs created': ['Pull request', 'Created'], 'PRs merged': ['Pull request', 'Merged'],
  'Tasks created': ['Task', 'Created'], 'Tasks completed': ['Task', 'Completed'],
  'Projects created': ['Project', 'Created'], 'Projects completed': ['Project', 'Completed'],
  'Milestones completed': ['Milestone', 'Completed'], 'Documents created': ['Document', 'Created'],
  'Documents completed': ['Document', 'Completed'], 'Meetings created': ['Meeting', 'Created'],
  'Partners created': ['Partner', 'Created'], 'Gates cleared': ['Readiness', 'Gate cleared'],
  'Releases recorded': ['Task', 'Release recorded'],
};
export const OUTPUT_SCHEMAS = {
  activity: { Name: 'title', 'Event key': 'rich_text', 'Source ID': 'rich_text', Source: 'select', Event: 'select', 'Occurred at': 'date', 'Observed at': 'date', 'Date basis': 'select', 'Source URL': 'url', 'Evidence URL': 'url', 'Previous state': 'rich_text', 'New state': 'rich_text', Owner: 'people', Week: 'rich_text', Month: 'rich_text', Quarter: 'rich_text' },
  periods: { Name: 'title', 'Period key': 'rich_text', Cadence: 'select', Start: 'date', End: 'date', Current: 'checkbox', Coverage: 'select', ...Object.fromEntries(Object.keys(METRICS).map(k => [k, 'number'])), Reopened: 'number', 'Last refreshed': 'date', Notes: 'rich_text', Owner: 'people' },
  health: { Name: 'title', 'Run state': 'select', 'Last attempt': 'date', 'Last success': 'date', 'Monitoring since': 'date', Details: 'rich_text', 'Run URL': 'url', Cursor: 'rich_text', Owner: 'people' },
  merged: { Name: 'title', 'PR number': 'number', State: 'select', 'GitHub PR': 'url', 'Merged at': 'date', Owner: 'people', 'Merge commit': 'rich_text', 'PR head commit': 'rich_text', Task: 'relation', 'Release check': 'select', 'Imported at': 'date', Repository: 'rich_text' },
};
