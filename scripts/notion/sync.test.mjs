import test from 'node:test';
import assert from 'node:assert/strict';
import { prNumber, transition, sync, SOURCE, REPO } from './sync.mjs';
const green = [{ name: 'Linux quality gate', status: 'completed', conclusion: 'success' }];
test('only exact repository PR URLs are accepted', () => {
  assert.equal(prNumber(`https://github.com/${REPO}/pull/151`), 151);
  for (const url of ['https://evil.test/pull/1', `https://github.com/${REPO}/pull/1?token=x`, 'https://github.com/other/repo/pull/1']) assert.equal(prNumber(url), null);
});
test('merge alone never proves readiness or release', () => {
  assert.equal(transition({ merged: true }, [], [], 'Review').state, 'Review');
  assert.equal(transition({ merged: true }, green, [], 'Review').state, 'Ready to release');
  assert.equal(transition({ merged: true }, green, [], 'Released').state, null);
});
test('failed and pending checks block readiness', () => {
  for (const check of [{ status: 'completed', conclusion: 'failure' }, { status: 'in_progress' }]) assert.equal(transition({ merged: true }, [...green, check], [], 'Review').state, 'Review');
  assert.equal(transition({ merged: true }, green, [{ state: 'failure' }], 'Review').state, 'Review');
});
test('drafts and closed unmerged PRs are distinct', () => {
  assert.equal(transition({ draft: true, state: 'open' }, [], [], 'Ready').state, 'Building');
  assert.equal(transition({ state: 'closed', merged: false }, green, [], 'Review').state, null);
});
test('API sync is scoped, dry-run by default, and preserves manual blockers', async () => {
  const writes = [];
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'error');
    let body;
    if (options.method === 'PATCH') { writes.push(JSON.parse(options.body)); body = {}; }
    else if (url.endsWith(`/data_sources/${SOURCE}`)) body = { properties: Object.fromEntries(Object.entries({ Status: 'select', Development: 'checkbox', 'GitHub PR': 'url', 'GitHub sync': 'rich_text' }).map(([k,type]) => [k,{type}])) };
    else if (url.endsWith('/query')) body = { results: [{ id: 'page', parent: { data_source_id: SOURCE }, properties: { Status: { select: { name: 'Review' } }, 'GitHub PR': { url: `https://github.com/${REPO}/pull/151` }, 'GitHub sync': { rich_text: [] } } }] };
    else if (url.endsWith('/pulls/151')) body = { merged: true, head: { sha: 'a'.repeat(40), repo: { full_name: REPO } }, base: { ref: 'main', repo: { full_name: REPO } } };
    else if (url.includes('/check-runs?')) body = { total_count: 1, check_runs: green };
    else if (url.includes('/status?')) body = { total_count: 0, statuses: [] };
    else throw new Error('Unexpected endpoint');
    return { ok: true, json: async () => body };
  };
  await sync({ githubToken: 'fixture', notionToken: 'fixture', fetcher });
  assert.equal(writes.length, 0);
  await sync({ githubToken: 'fixture', notionToken: 'fixture', fetcher, dryRun: false });
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0].properties).sort(), ['GitHub sync', 'Status']);
});
