import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { report, recordState, planRecords, planPulls, summarizePeriods, periodFor, midnight, makeClient, queryAll, rich, textValue, formatReportingError } from './reporting.mjs';
import { REPO, OWNER, HEALTH_PAGE, OUTPUTS, SOURCES, OUTPUT_SCHEMAS } from './reporting-config.mjs';

const NOW = '2026-09-05T12:00:00.000Z';
const LATER = '2026-09-05T12:15:00.000Z';
const task = SOURCES.find(s => s.kind === 'Task');
const id = '11111111-1111-4111-8111-111111111111';
const chosen = name => ({ select: { name } });
function record(source = task, status = 'Ready', created = '2026-09-01T12:00:00.000Z') {
  return { id, created_time: created, parent: { data_source_id: source.id }, properties: {
    [source.title]: rich('Fixture work', 'title'), [source.owner]: { people: [{ id: OWNER }] },
    Development: { checkbox: false }, 'Business status': chosen(status), Status: chosen(status), Stage: chosen(status),
    'Record state': chosen('Active'), 'Release evidence': rich(''), Evidence: { url: null }, Type: chosen('Gate'), 'Acceptance evidence': rich(''), 'GitHub PR': { url: null },
  } };
}
function pull(overrides = {}) {
  return { number: 201, title: 'Fixture PR', html_url: `https://github.com/${REPO}/pull/201`, state: 'open', draft: false, created_at: NOW, merged_at: null, merge_commit_sha: null,
    base: { ref: 'main', repo: { full_name: REPO } }, head: { sha: 'a'.repeat(40), repo: { full_name: REPO } }, ...overrides };
}
test('old completed work is baselined without a fictitious completion date', () => {
  const page = record(task, 'Done');
  const plan = planRecords([{ source: task, page }], {}, NOW, NOW);
  assert.equal(plan.events.length, 0);
  assert.equal(plan.states[id].completion, 'Completed');
});
test('created dates come from source and new completion is first observed', () => {
  const page = record(task, 'Done', '2026-09-05T12:02:00.000Z');
  const plan = planRecords([{ source: task, page }], {}, NOW, LATER);
  assert.deepEqual(plan.events.map(e => [e.event, e.at, e.basis]), [['Created', page.created_time, 'Source timestamp'], ['Completed', LATER, 'First observed']]);
  const again = planRecords([{ source: task, page }], plan.states, NOW, LATER);
  assert.deepEqual(again.events.map(e => e.event), ['Created']);
});
test('repeat runs and reopens produce stable completion cycles', () => {
  const page = record();
  const baseline = planRecords([{ source: task, page }], {}, NOW, NOW);
  page.properties['Business status'] = chosen('Done');
  const first = planRecords([{ source: task, page }], baseline.states, NOW, LATER);
  assert.equal(first.events[0].key, `notion:${id}:complete:1`);
  assert.equal(planRecords([{ source: task, page }], first.states, NOW, LATER).events.length, 0);
  page.properties['Business status'] = chosen('In progress');
  const reopened = planRecords([{ source: task, page }], first.states, NOW, LATER);
  assert.equal(reopened.events[0].key, `notion:${id}:reopened:1`);
  page.properties['Business status'] = chosen('Done');
  assert.equal(planRecords([{ source: task, page }], reopened.states, NOW, LATER).events[0].key, `notion:${id}:complete:2`);
});
test('records created after the observation cutoff wait for the next run', () => {
  const page = record(task, 'Done', LATER);
  const first = planRecords([{ source: task, page }], {}, NOW, NOW);
  assert.deepEqual(first.states, {}); assert.deepEqual(first.events, []);
  assert.deepEqual(planRecords([{ source: task, page }], first.states, NOW, LATER).events.map(e => e.event), ['Created', 'Completed']);
});
test('cancelled and held milestones do not count as completed', () => {
  const milestone = SOURCES.find(s => s.kind === 'Milestone');
  for (const state of ['On Hold', 'Cancelled', 'In progress']) assert.equal(recordState(milestone, record(milestone, state)).completion, null);
  assert.equal(recordState(milestone, record(milestone, 'Completed')).completion, 'Completed');
  assert.equal(recordState(task, record(task, 'Cancelled')).completion, null);
});
test('development releases and cleared gates require their evidence', () => {
  const page = record(task, 'Released'); page.properties.Development.checkbox = true;
  assert.equal(recordState(task, page).completion, null);
  page.properties['Release evidence'] = rich('Internal workflow run verified.');
  assert.equal(recordState(task, page).completion, 'Release recorded');
  page.properties.Status = chosen('Ready to release');
  assert.equal(recordState(task, page).completion, null);
  const source = SOURCES.find(s => s.kind === 'Readiness'); const gate = record(source, 'Cleared');
  assert.equal(recordState(source, gate).completion, null);
  gate.properties.Evidence.url = 'https://example.test/evidence';
  assert.equal(recordState(source, gate).completion, 'Gate cleared');
  gate.properties.Type = chosen('Risk');
  assert.equal(recordState(source, gate).completion, null);
});
test('source reference records and held meetings do not imply outcomes', () => {
  const page = record(task, 'Done'); page.properties['Record state'] = chosen('Reference');
  assert.equal(recordState(task, page).completion, null);
  for (const kind of ['Meeting', 'Partner']) {
    const source = SOURCES.find(s => s.kind === kind);
    assert.equal(recordState(source, record(source, 'Done')).completion, null);
  }
});
test('PR creation and merge are separate; closed unmerged and foreign PRs are not delivery', () => {
  assert.deepEqual(planPulls([pull({ state: 'closed' })], NOW, LATER).events.map(e => e.event), ['Created']);
  const merged = pull({ state: 'closed', merged_at: LATER, merge_commit_sha: 'b'.repeat(40) });
  const result = planPulls([merged], NOW, LATER);
  assert.deepEqual(result.events.map(e => e.event), ['Created', 'Merged']);
  assert.equal(result.events.some(e => e.event === 'Release recorded'), false);
  assert.equal(planPulls([pull({ head: { repo: { full_name: 'other/repo' } } })], NOW, LATER).events.length, 0);
  assert.throws(() => planPulls([pull({ html_url: 'https://example.test/pull/201' })], NOW, LATER), /Invalid GitHub/);
});
test('New York calendar weeks, year boundary and DST use local midnight', () => {
  assert.equal(periodFor('2026-09-07T03:59:59Z', 'Week').start, '2026-08-31');
  assert.equal(periodFor('2026-09-07T04:00:00Z', 'Week').start, '2026-09-07');
  assert.equal(periodFor('2027-01-01T04:59:59Z', 'Quarter').start, '2026-10-01');
  assert.equal(midnight('2026-03-08'), '2026-03-08T05:00:00.000Z');
  assert.equal(midnight('2026-03-09'), '2026-03-09T04:00:00.000Z');
  assert.equal(midnight('2026-11-01'), '2026-11-01T04:00:00.000Z');
  assert.equal(midnight('2026-11-02'), '2026-11-02T05:00:00.000Z');
});
test('period totals deduplicate work within the period and disclose incomplete coverage', () => {
  const events = [1, 2].map(n => ({ key: `done${n}`, id, kind: 'Task', event: 'Completed', at: LATER }));
  events.push({ key: 'reopen', id, kind: 'Task', event: 'Reopened', at: LATER });
  const periods = summarizePeriods(events, NOW, '2026-09-15T12:00:00.000Z');
  const first = periods.find(p => p.key === 'Week:2026-08-31');
  assert.equal(first.counts['Tasks completed'], 1); assert.equal(first.counts.Reopened, 1); assert.equal(first.coverage, 'Partial');
  assert.equal(periods.find(p => p.key === 'Week:2026-09-07').coverage, 'Complete');
  const gap = summarizePeriods(events, NOW, '2026-09-15T12:00:00.000Z', [['2026-09-10T00:00:00.000Z', '2026-09-10T04:00:00.000Z']]);
  assert.equal(gap.find(p => p.key === 'Week:2026-09-07').coverage, 'Partial');
});
test('Notion pagination is exhausted and repeated cursors fail closed', async () => {
  let n = 0;
  const rows = await queryAll(async () => (++n === 1 ? { results: [record()], has_more: true, next_cursor: 'next' } : { results: [], has_more: false }), task.id);
  assert.equal(n, 2); assert.equal(rows.length, 1);
  await assert.rejects(queryAll(async () => ({ results: [], has_more: true, next_cursor: 'same' }), task.id), /pagination/);
  await assert.rejects(queryAll(async () => ({ results: [{ ...record(), parent: { data_source_id: 'other' } }], has_more: false }), task.id), /different source/);
});
test('rate limits obey Retry-After and ambiguous creates are not blindly replayed', async () => {
  const waits = []; let n = 0;
  const client = makeClient({ githubToken: 'fixture', notionToken: 'fixture', pause: async ms => waits.push(ms), fetcher: async (_url, init) => {
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
    return ++n === 1 ? { ok: false, status: 529, headers: new Headers({ 'retry-after': '2' }) } : { ok: true, json: async () => ({}) };
  } });
  await client('notion', 'pages', 'POST', {}); assert.ok(waits.includes(2000)); assert.equal(n, 2);
  n = 0;
  const ambiguous = makeClient({ githubToken: 'fixture', notionToken: 'fixture', pause: async () => {}, fetcher: async () => { n++; return { ok: false, status: 503 }; } });
  await assert.rejects(ambiguous('notion', 'pages', 'POST', {}), /HTTP 503/); assert.equal(n, 1);
  const secret = makeClient({ githubToken: 'fixture', notionToken: 'fixture', pause: async () => {}, fetcher: async () => { throw new Error('secret-token-value'); } });
  await assert.rejects(secret('notion', 'pages', 'POST', {}), error => !error.message.includes('secret-token-value'));
});
test('HTTP diagnostics retain only fixed request metadata and known property paths', async () => {
  const secret = 'private-token-and-source-value';
  for (const code of ['validation_error', secret]) {
    const client = makeClient({ githubToken: secret, notionToken: secret, pause: async () => {}, fetcher: async () => ({
      ok: false, status: 400, json: async () => ({ code, message: `body.properties.Cursor.rich_text[0].text.content should be valid, instead was ${secret}. body.properties.Owner.people[0].id is ${id}. body.properties.${secret}.rich_text should be valid.`, request_id: secret }),
    }) });
    await assert.rejects(client('notion', `pages/${id}`, 'PATCH', { secret }), error => {
      const output = formatReportingError(error);
      assert.match(output, /service=notion; method=PATCH; status=400/);
      assert.equal(output.includes('code=validation_error'), code === 'validation_error');
      assert.equal(output.includes('body.properties.Cursor'), code === 'validation_error');
      assert.equal(output.includes('body.properties.Owner'), code === 'validation_error');
      assert.equal(output.includes(secret), false); assert.equal(output.includes(id), false);
      return true;
    });
  }
});
test('unknown throwables and hostile error accessors cannot leak through the formatter', () => {
  const secret = 'private-error-message';
  const hostile = Object.defineProperty({}, 'message', { get() { throw new Error(secret); } });
  for (const error of [secret, new Error(secret), { message: secret, status: secret, code: secret }, hostile, null]) {
    assert.equal(formatReportingError(error), 'Capture failed (phase=unknown; reason=internal).');
  }
});

function fixture() {
  const health = { id: HEALTH_PAGE, parent: { data_source_id: OUTPUTS.health }, properties: { Cursor: { id: 'cursor', ...rich('') }, 'Last success': { date: null }, 'Monitoring since': { date: null } } };
  const dbs = Object.fromEntries([...SOURCES.map(s => s.id), ...Object.values(OUTPUTS)].map(ds => [ds, []]));
  dbs[task.id].push(record());
  const writes = []; let serial = 1; let failPost = false; let pulls = [];
  const schemas = Object.fromEntries(SOURCES.map(s => [s.id, { [s.title]: 'title', [s.owner]: 'people', ...s.schema }]));
  for (const [key, ds] of Object.entries(OUTPUTS)) schemas[ds] = OUTPUT_SCHEMAS[key];
  const json = payload => ({ ok: true, json: async () => structuredClone(payload) });
  async function fetcher(url, init) {
    const u = new URL(url); const path = u.pathname.replace(/^\/v1\//, ''); const body = init.body ? JSON.parse(init.body) : {};
    if (u.hostname === 'api.github.com') { const n = Number(u.searchParams.get('page')); return json(pulls.slice((n - 1) * 100, n * 100)); }
    if (init.method === 'PATCH') {
      writes.push({ path, body });
      const row = path === `pages/${HEALTH_PAGE}` ? health : Object.values(dbs).flat().find(row => path === `pages/${row.id}`);
      assert.ok(row, 'patch target exists'); Object.assign(row.properties, body.properties);
      if (row === health) health.properties.Cursor.id = 'cursor';
      return json(row);
    }
    if (path === 'pages' && init.method === 'POST') {
      const row = { id: `99999999-9999-4999-8999-${String(serial++).padStart(12, '0')}`, parent: body.parent, properties: body.properties, created_time: NOW };
      writes.push({ path, body }); dbs[body.parent.data_source_id].push(row);
      if (failPost && body.parent.data_source_id === OUTPUTS.activity) { failPost = false; return { ok: false, status: 503 }; }
      return json(row);
    }
    if (path === `pages/${HEALTH_PAGE}`) return json(health);
    if (path.startsWith(`pages/${HEALTH_PAGE}/properties/`)) return json({ object: 'list', has_more: false, results: (health.properties.Cursor.rich_text ?? []).map(r => ({ rich_text: r })) });
    const schema = /^data_sources\/([^/]+)$/.exec(path);
    if (schema) return json({ properties: Object.fromEntries(Object.entries(schemas[schema[1]]).map(([k, type]) => [k, { type }])) });
    const query = /^data_sources\/([^/]+)\/query$/.exec(path);
    if (query) {
      let results = dbs[query[1]];
      if (body.filter) results = results.filter(r => textValue(r.properties[body.filter.property]) === body.filter.rich_text.equals);
      return json({ results, has_more: false });
    }
    throw new Error('Unexpected fixture endpoint');
  }
  return { fetcher, dbs, health, writes, schemas, setPulls: value => { pulls = value; }, failNextCreate: () => { failPost = true; } };
}
const run = (f, options = {}) => report({ githubToken: 'fixture', notionToken: 'fixture', fetcher: f.fetcher, pause: async () => {}, now: NOW, ...options });
test('report is completely read-only by default and baselines only on apply', async () => {
  const f = fixture(); assert.equal((await run(f)).baseline, true); assert.equal(f.writes.length, 0);
  await run(f, { dryRun: false });
  assert.equal(f.health.properties['Last success'].date.start, NOW);
  assert.equal(f.dbs[OUTPUTS.activity].length, 0); assert.equal(f.dbs[OUTPUTS.periods].length, 3);
  assert.equal(f.dbs[OUTPUTS.periods].every(row => row.properties.Owner.people[0].id === OWNER), true);
});
test('a completion is captured once and source manual fields stay intact', async () => {
  const f = fixture(); await run(f, { dryRun: false }); f.writes.length = 0;
  const page = f.dbs[task.id][0]; page.properties['Business status'] = chosen('Done'); page.properties.Blocked = { checkbox: true };
  await run(f, { dryRun: false, now: LATER }); await run(f, { dryRun: false, now: '2026-09-05T12:30:00.000Z' });
  assert.equal(f.dbs[OUTPUTS.activity].length, 1);
  assert.equal(f.writes.some(w => w.path === `pages/${id}`), false);
  assert.equal(page.properties.Blocked.checkbox, true);
});
test('an ambiguous event write is deduplicated on retry and never advances success', async () => {
  const f = fixture(); await run(f, { dryRun: false });
  f.dbs[task.id][0].properties['Business status'] = chosen('Done'); f.failNextCreate();
  await assert.rejects(run(f, { dryRun: false, now: LATER }), /HTTP 503/);
  assert.equal(f.dbs[OUTPUTS.activity].length, 1); assert.equal(f.health.properties['Last success'].date.start, NOW);
  assert.equal(f.health.properties['Run state'].select.name, 'Failed');
  await run(f, { dryRun: false, now: '2026-09-05T12:30:00.000Z' });
  assert.equal(f.dbs[OUTPUTS.activity].length, 1);
  assert.equal(f.dbs[OUTPUTS.activity][0].properties['Occurred at'].date.start, LATER);
  assert.equal(f.dbs[OUTPUTS.periods][0].properties['Tasks completed'].number, 1);
});
test('new merged PRs are discovered, linked and owned without asserting release', async () => {
  const f = fixture(); await run(f, { dryRun: false });
  const pr = pull({ state: 'closed', created_at: '2026-09-05T12:01:00.000Z', merged_at: LATER, merge_commit_sha: 'b'.repeat(40) });
  f.setPulls([pr]); f.dbs[task.id][0].properties['GitHub PR'].url = pr.html_url;
  await run(f, { dryRun: false, now: LATER }); await run(f, { dryRun: false, now: LATER });
  const rows = f.dbs[OUTPUTS.merged]; assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].properties.Task.relation, [{ id }]);
  assert.equal(rows[0].properties.Owner.people[0].id, OWNER);
  assert.equal(rows[0].properties['Release check'].select.name, 'See linked task');
  assert.equal(f.dbs[OUTPUTS.activity].length, 2);
});
test('GitHub discovery reaches a second page and stale setup periods lose Current', async () => {
  const f = fixture();
  const prs = Array.from({ length: 101 }, (_, i) => pull({ number: i + 1, html_url: `https://github.com/${REPO}/pull/${i + 1}` }));
  f.setPulls(prs);
  assert.equal((await run(f)).newEvents, 101);
  f.setPulls([]);
  f.dbs[OUTPUTS.periods].push({ id: '88888888-8888-4888-8888-888888888888', parent: { data_source_id: OUTPUTS.periods }, properties: { 'Period key': rich('Week:2026-08-24'), Current: { checkbox: true }, Coverage: chosen('Awaiting activation') } });
  await run(f, { dryRun: false });
  assert.equal(f.dbs[OUTPUTS.periods][0].properties.Current.checkbox, false);
  assert.equal(f.dbs[OUTPUTS.periods][0].properties['Tasks completed'], undefined);
});
test('missing schema, corrupt state, and duplicate keys fail without a false healthy run', async () => {
  const f = fixture(); delete f.schemas[task.id]['Business status'];
  await assert.rejects(run(f), /schema/); assert.equal(f.writes.length, 0);
  const bad = fixture(); bad.health.properties.Cursor = { id: 'cursor', ...rich('{bad') };
  await assert.rejects(run(bad), /Invalid capture cursor/);
  const duplicate = fixture(); await run(duplicate, { dryRun: false }); duplicate.dbs[OUTPUTS.periods].push(structuredClone(duplicate.dbs[OUTPUTS.periods][0]));
  await assert.rejects(run(duplicate), /duplicate reporting key/);
});
test('a rejected final checkpoint records sanitized phase, HTTP status and cursor sizes', async () => {
  const f = fixture(); const secret = 'private-checkpoint-value'; let submittedCursor;
  const fetcher = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : {};
    if (init.method === 'PATCH' && body.properties?.Cursor) {
      submittedCursor = body.properties.Cursor.rich_text;
      return { ok: false, status: 400, json: async () => ({ code: 'validation_error', message: `body.properties.Cursor.rich_text[0].text.content should be valid, instead was ${secret}. ${id}` }) };
    }
    return f.fetcher(url, init);
  };
  await assert.rejects(run(f, { dryRun: false, fetcher }), error => {
    const output = formatReportingError(error);
    assert.match(output, /phase=health.commit; reason=http; service=notion; method=PATCH; status=400; code=validation_error/);
    const lengths = submittedCursor.map(part => part.text.content.length);
    assert.ok(output.includes(`cursorChars=${lengths.reduce((a, b) => a + b, 0)}`));
    assert.ok(output.includes(`cursorSegments=${lengths.length}`));
    assert.ok(output.includes(`cursorMaxSegment=${Math.max(...lengths)}`));
    const details = textValue(f.health.properties.Details);
    assert.ok(details.startsWith(output));
    for (const value of [secret, id, OWNER, task.id]) assert.equal(details.includes(value), false);
    return true;
  });
  assert.equal(f.health.properties['Run state'].select.name, 'Failed');
  assert.equal(f.health.properties['Last success'].date, null);
  assert.equal(textValue(f.health.properties.Cursor), '');
  assert.equal(f.dbs[OUTPUTS.periods].length, 3);
});
test('unexpected exceptions are sanitized in persisted failure details and retain their phase', async () => {
  const f = fixture(); const secret = 'private-pause-error'; let calls = 0;
  await assert.rejects(run(f, { dryRun: false, pause: async () => { if (++calls === 1) throw new Error(secret); } }), error => {
    assert.equal(formatReportingError(error), 'Capture failed (phase=schema; reason=internal).');
    assert.equal(textValue(f.health.properties.Details).includes(secret), false);
    assert.match(textValue(f.health.properties.Details), /phase=schema; reason=internal/);
    return true;
  });
});
test('state size is bounded and credential-bearing workflow remains main-only and opt-in', () => {
  const maximum = rich('x'.repeat(180000)).rich_text;
  assert.equal(maximum.length, 100);
  assert.ok(maximum.every(part => part.text.content.length === 1800));
  assert.throws(() => rich('x'.repeat(180001)), /size limit/);
  const workflow = readFileSync(new URL('../../.github/workflows/notion-ticket-sync.yml', import.meta.url), 'utf8');
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /NOTION_REPORTING_ENABLED == 'true'/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /pull_request_target|contents: write|id-token: write/);
});
