import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { REPO, OWNER, HEALTH_PAGE, OUTPUTS, SOURCES, METRICS, OUTPUT_SCHEMAS } from './reporting-config.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENTS = ['Created', 'Completed', 'Merged', 'Reopened', 'Release recorded', 'Gate cleared'];
const COMPLETIONS = ['Completed', 'Release recorded', 'Gate cleared'];
const ZONE = 'America/New_York';
const MAX_PAGES = 100;
const GAP_MS = 45 * 60 * 1000;
const diagnostics = new WeakMap();
const NOTION_ERROR_CODES = new Set(['invalid_json', 'invalid_request_url', 'invalid_request', 'validation_error', 'missing_version', 'unauthorized', 'restricted_resource', 'object_not_found', 'conflict_error', 'rate_limited', 'internal_server_error', 'bad_gateway', 'service_unavailable', 'database_connection_unavailable', 'gateway_timeout', 'service_overload']);
const PROPERTY_NAMES = [...new Set(Object.values(OUTPUT_SCHEMAS).flatMap(Object.keys))];
function requestFailure(message, metadata) {
  const error = new Error(message);
  diagnostics.set(error, metadata);
  return error;
}
async function httpFailure(response, service, method) {
  const metadata = { reason: 'http', service, method, status: response.status };
  // Error messages can echo submitted values. Retain only known codes and
  // literal property paths from our fixed schemas; never retain the message.
  if (service === 'notion') {
    try {
      const body = await response.json();
      if (NOTION_ERROR_CODES.has(body?.code)) metadata.code = body.code;
      if (body?.code === 'validation_error' && typeof body.message === 'string') {
        const message = body.message.slice(0, 20000);
        metadata.fields = PROPERTY_NAMES.filter(name => [`.${name}`, `["${name}"]`, `['${name}']`].some(suffix =>
          ['.', '[', ' should ', ' is '].some(end => message.includes(`body.properties${suffix}${end}`))
        )).map(name => `body.properties.${name}`);
      }
    } catch { /* Status remains useful if the error body is not JSON. */ }
  }
  return requestFailure(`${service} request failed: HTTP ${response.status}.`, metadata);
}
export function formatReportingError(error) {
  // No reads of error.message, stacks, causes, response bodies or unknown keys.
  const d = error && (typeof error === 'object' || typeof error === 'function') ? diagnostics.get(error) : null;
  if (!d) return 'Capture failed (phase=unknown; reason=internal).';
  const parts = [`phase=${d.phase ?? 'request'}`, `reason=${d.reason ?? 'internal'}`];
  for (const key of ['service', 'method', 'status', 'code']) if (d[key] !== undefined) parts.push(`${key}=${d[key]}`);
  if (d.fields?.length) parts.push(`fields=${d.fields.join(',')}`);
  if (d.phase === 'health.commit' && d.cursor) parts.push(`cursorChars=${d.cursor.chars}`, `cursorSegments=${d.cursor.segments}`, `cursorMaxSegment=${d.cursor.maxSegment}`);
  return `Capture failed (${parts.join('; ')}).`;
}
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const clockFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export const textValue = p => (p?.rich_text ?? p?.title ?? []).map(t => t.plain_text ?? t.text?.content ?? '').join('');
const selected = p => p?.select?.name ?? p?.status?.name ?? '';
const dateValue = p => p?.date?.start ?? null;
const select = name => ({ select: name ? { name } : null });
const date = start => ({ date: start ? { start } : null });
const people = () => ({ people: [{ object: 'user', id: OWNER }] });
export function rich(value, type = 'rich_text') {
  const str = String(value ?? '');
  if (str.length > 180000) throw new Error('Reporting state size limit reached; partition capture before continuing.');
  const parts = [];
  for (let i = 0; i < str.length; i += 1800) parts.push({ type: 'text', text: { content: str.slice(i, i + 1800) } });
  return { [type]: parts };
}
function validTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid source timestamp.');
  return new Date(value).toISOString();
}
export function localDate(value) { return dateFormatter.format(new Date(value)); }
function plusDays(day, n) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function midnight(day) {
  const target = Date.parse(day + 'T00:00:00Z');
  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(clockFormatter.formatToParts(new Date(candidate)).map(x => [x.type, x.value]));
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    candidate += target - wall;
  }
  return new Date(candidate).toISOString();
}
export function periodFor(value, cadence) {
  const day = localDate(value);
  const [year, month] = day.split('-').map(Number);
  let start, next;
  if (cadence === 'Week') {
    const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
    start = plusDays(day, -((weekday + 6) % 7)); next = plusDays(start, 7);
  } else {
    const firstMonth = cadence === 'Quarter' ? Math.floor((month - 1) / 3) * 3 : month - 1;
    start = new Date(Date.UTC(year, firstMonth, 1)).toISOString().slice(0, 10);
    next = new Date(Date.UTC(year, firstMonth + (cadence === 'Quarter' ? 3 : 1), 1)).toISOString().slice(0, 10);
  }
  return { key: `${cadence}:${start}`, cadence, start, next, end: plusDays(next, -1) };
}
function eventFields(event) {
  const week = periodFor(event.at, 'Week').start;
  const month = periodFor(event.at, 'Month').start.slice(0, 7);
  const quarter = `${month.slice(0, 4)} Q${Math.floor((Number(month.slice(5)) - 1) / 3) + 1}`;
  return {
    Name: rich(`${event.event}: ${event.name}`.slice(0, 1800), 'title'), 'Event key': rich(event.key), 'Source ID': rich(event.id),
    Source: select(event.kind), Event: select(event.event), 'Occurred at': date(event.at), 'Observed at': date(event.observed),
    'Date basis': select(event.basis), 'Source URL': { url: event.url }, 'Evidence URL': { url: event.evidence || null },
    'Previous state': rich(event.previous), 'New state': rich(event.state), Owner: people(), Week: rich(week), Month: rich(month), Quarter: rich(quarter),
  };
}
export function recordState(source, page) {
  const p = page.properties;
  let state = '', completion = null;
  const active = !p['Record state'] || ['', 'Active'].includes(selected(p['Record state']));
  const evidence = p.Evidence?.url ?? p['Latest evidence']?.url ?? null;
  if (source.kind === 'Task') {
    state = selected(p[p.Development?.checkbox ? 'Status' : 'Business status']);
    if (p.Development?.checkbox) {
      if (state === 'Released' && textValue(p['Release evidence']).trim()) completion = 'Release recorded';
    } else if (state === 'Done') completion = 'Completed';
  } else if (source.kind === 'Project') { state = selected(p.Stage); if (state === 'Complete') completion = 'Completed'; }
  else if (source.kind === 'Milestone') { state = selected(p.Status); if (state === 'Completed') completion = 'Completed'; }
  else if (source.kind === 'Document') { state = selected(p.Status); if (state === 'Done') completion = 'Completed'; }
  else if (source.kind === 'Readiness') {
    state = selected(p.Status);
    if (selected(p.Type) === 'Gate' && state === 'Cleared' && (evidence || textValue(p['Acceptance evidence']).trim())) completion = 'Gate cleared';
  }
  return { state, completion: active ? completion : null, evidence };
}
export function planRecords(records, previous, since, now) {
  const states = structuredClone(previous);
  const events = [], owners = [];
  for (const { source, page } of records) {
    if (!UUID.test(page.id) || page.parent?.data_source_id !== source.id) throw new Error('Unexpected Notion source page.');
    if (page.archived || page.in_trash) continue;
    const created = validTime(page.created_time);
    // A page created after this run's observation cutoff belongs to the next
    // run; do not baseline its completion before recording its creation.
    if (created > now) continue;
    const current = recordState(source, page);
    if (current.state.length > 128) throw new Error('Source state exceeds the reporting limit.');
    const old = previous[page.id];
    let cycle = old?.cycle ?? 0;
    const base = { id: page.id, kind: source.kind, name: textValue(page.properties[source.title]) || 'Untitled', url: `https://www.notion.so/${page.id.replaceAll('-', '')}`, evidence: current.evidence, observed: now, previous: old?.state ?? '', state: current.state };
    if (created >= since && created <= now) events.push({ ...base, event: 'Created', at: created, basis: 'Source timestamp', key: `notion:${page.id}:created` });
    // Existing completed pages are baselined; their completion date is unknown.
    if (current.completion && current.completion !== old?.completion && (old || created >= since)) {
      cycle++;
      events.push({ ...base, event: current.completion, at: now, basis: 'First observed', key: `notion:${page.id}:complete:${cycle}` });
    } else if (old?.completion && !current.completion) {
      events.push({ ...base, event: 'Reopened', at: now, basis: 'First observed', key: `notion:${page.id}:reopened:${cycle}` });
    }
    states[page.id] = { state: current.state, completion: current.completion, cycle };
    if (!page.properties[source.owner]?.people?.length) owners.push({ id: page.id, property: source.owner });
  }
  return { states, events, owners };
}
export function planPulls(pulls, since, now) {
  const events = [], merged = [];
  for (const pr of pulls) {
    if (pr.base?.repo?.full_name !== REPO || pr.head?.repo?.full_name !== REPO || pr.base.ref !== 'main') continue;
    if (!Number.isSafeInteger(pr.number) || pr.number < 1 || pr.html_url !== `https://github.com/${REPO}/pull/${pr.number}` || !/^[a-f0-9]{40}$/.test(pr.head.sha)) throw new Error('Invalid GitHub PR source.');
    const created = validTime(pr.created_at);
    const mergedAt = pr.merged_at ? validTime(pr.merged_at) : null;
    const state = mergedAt ? 'Merged' : pr.state === 'closed' ? 'Closed without merge' : pr.draft ? 'Draft' : 'Open';
    const base = { id: `${REPO}#${pr.number}`, kind: 'Pull request', name: `#${pr.number} ${pr.title}`, url: pr.html_url, evidence: pr.html_url, observed: now, basis: 'Source timestamp', previous: '', state };
    if (created >= since && created <= now) events.push({ ...base, event: 'Created', at: created, key: `github:${REPO}:${pr.number}:created` });
    if (mergedAt && mergedAt >= since && mergedAt <= now) {
      if (pr.state !== 'closed' || !/^[a-f0-9]{40}$/.test(pr.merge_commit_sha)) throw new Error('Incomplete GitHub merge evidence.');
      events.push({ ...base, event: 'Merged', at: mergedAt, key: `github:${REPO}:${pr.number}:merged` }); merged.push(pr);
    }
  }
  return { events, merged };
}
export function summarizePeriods(events, since, now, gaps = []) {
  const periods = [];
  for (const cadence of ['Week', 'Month', 'Quarter']) {
    let p = periodFor(since, cadence);
    for (let i = 0; i < 1000; i++) {
      const startTime = midnight(p.start), endTime = midnight(p.next);
      if (startTime > now) break;
      const current = now < endTime;
      const partial = since > startTime || current || gaps.some(([a, b]) => a < endTime && b > startTime);
      const inPeriod = events.filter(e => e.at >= startTime && e.at < endTime && e.at >= since && e.at <= now);
      const counts = Object.fromEntries(Object.entries(METRICS).map(([metric, [kind, event]]) => [metric, new Set(inPeriod.filter(e => e.kind === kind && e.event === event).map(e => e.id)).size]));
      counts.Reopened = new Set(inPeriod.filter(e => e.event === 'Reopened').map(e => `${e.kind}:${e.id}`)).size;
      periods.push({ ...p, current, coverage: partial ? 'Partial' : 'Complete', counts });
      if (current) break;
      p = periodFor(midnight(p.next), cadence);
      if (i === 999) throw new Error('Reporting horizon requires partitioning.');
    }
  }
  return periods;
}
export function makeClient({ githubToken, notionToken, fetcher = fetch, pause = sleep }) {
  return async function request(service, path, method = 'GET', body) {
    if (!['notion', 'github'].includes(service) || !['GET', 'POST', 'PATCH'].includes(method) || path.startsWith('/') || path.includes('://')) throw new Error('Invalid reporting endpoint.');
    for (let attempt = 0; attempt < 4; attempt++) {
      if (service === 'notion') await pause(350);
      let response;
      try {
        response = await fetcher((service === 'notion' ? 'https://api.notion.com/v1/' : 'https://api.github.com/') + path, {
          method, redirect: 'error', signal: AbortSignal.timeout(30000),
          headers: { Authorization: `Bearer ${service === 'notion' ? notionToken : githubToken}`, 'Content-Type': 'application/json', ...(service === 'notion' ? { 'Notion-Version': '2025-09-03' } : { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch { throw requestFailure(`${service} request failed; retry the capture run.`, { reason: 'network', service, method }); }
      if (response.ok) { try { return await response.json(); } catch { throw requestFailure(`${service} returned invalid JSON.`, { reason: 'invalid_json', service, method }); } }
      if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) throw requestFailure('Invalid HTTP response status.', { reason: 'invalid_status', service, method });
      // Never blindly replay an ambiguous create. Event keys are checked next run.
      const retryable = [429, 529].includes(response.status) || (method === 'GET' && [500, 502, 503, 504].includes(response.status));
      if (!retryable || attempt === 3) throw await httpFailure(response, service, method);
      const header = response.headers?.get('retry-after');
      const seconds = header !== null && header !== undefined ? Number(header) : 2 ** attempt;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) throw requestFailure(`${service} rate limited; retry the capture run later.`, { reason: 'retry_after', service, method, status: response.status });
      await pause(Math.max(seconds * 1000, 1000));
    }
  };
}
export async function queryAll(request, source) {
  const rows = [], cursors = new Set(); let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await request('notion', `data_sources/${source}/query`, 'POST', { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    if (!Array.isArray(result.results) || typeof result.has_more !== 'boolean') throw new Error('Invalid Notion query response.');
    for (const row of result.results) {
      if (row.parent?.data_source_id !== source) throw new Error('Notion query returned a different source.');
      if (!row.archived && !row.in_trash) rows.push(row);
    }
    if (!result.has_more) return rows;
    cursor = result.next_cursor;
    if (!cursor || cursors.has(cursor)) throw new Error('Incomplete Notion pagination.');
    cursors.add(cursor);
  }
  throw new Error('Notion query limit reached; refusing incomplete capture.');
}
async function readCursor(request, health) {
  const prop = health.properties.Cursor;
  // Property-item pagination also handles state larger than a page response.
  let cursor; let text = ''; const seen = new Set();
  for (let i = 0; i < MAX_PAGES; i++) {
    const result = await request('notion', `pages/${HEALTH_PAGE}/properties/${encodeURIComponent(prop.id)}?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (result.object !== 'list' || !Array.isArray(result.results)) throw new Error('Invalid capture cursor response.');
    text += result.results.map(item => item.rich_text?.plain_text ?? item.rich_text?.text?.content ?? '').join('');
    if (!result.has_more) break;
    cursor = result.next_cursor;
    if (!cursor || seen.has(cursor) || i === MAX_PAGES - 1) throw new Error('Incomplete capture cursor.');
    seen.add(cursor);
  }
  if (!text) {
    if (dateValue(health.properties['Last success'])) throw new Error('Capture cursor missing; restore it before continuing.');
    return { version: 1, states: {}, gaps: [] };
  }
  let result; try { result = JSON.parse(text); } catch { throw new Error('Invalid capture cursor; restore it before continuing.'); }
  if (result.version !== 1 || !result.states || Array.isArray(result.states) || !Array.isArray(result.gaps)) throw new Error('Invalid capture cursor schema.');
  for (const [id, s] of Object.entries(result.states)) if (!UUID.test(id) || typeof s.state !== 'string' || s.state.length > 128 || !Number.isSafeInteger(s.cycle) || s.cycle < 0 || (s.completion !== null && !COMPLETIONS.includes(s.completion))) throw new Error('Invalid capture state.');
  for (const pair of result.gaps) if (!Array.isArray(pair) || pair.length !== 2 || validTime(pair[0]) >= validTime(pair[1])) throw new Error('Invalid capture gap.');
  return result;
}
function indexRows(rows, property) {
  const map = new Map();
  for (const row of rows) {
    const p = row.properties[property]; const key = p?.url ?? textValue(p);
    if (!key || map.has(key)) throw new Error(`Missing or duplicate reporting key: ${property}.`);
    map.set(key, row);
  }
  return map;
}
function decodeEvents(rows) {
  indexRows(rows, 'Event key');
  return rows.map(row => {
    const p = row.properties;
    const e = { key: textValue(p['Event key']), id: textValue(p['Source ID']), kind: selected(p.Source), event: selected(p.Event), at: validTime(dateValue(p['Occurred at'])) };
    if (!e.id || ![...SOURCES.map(s => s.kind), 'Pull request'].includes(e.kind) || !EVENTS.includes(e.event)) throw new Error('Invalid activity record.');
    return e;
  });
}
function comparable(prop) {
  if (!prop) return null;
  if (prop.title || prop.rich_text) return textValue(prop);
  if ('select' in prop) return prop.select?.name ?? null;
  if ('people' in prop) return prop.people.map(p => p.id).sort().join(',');
  if ('relation' in prop) return prop.relation.map(p => p.id).sort().join(',');
  if ('date' in prop) return prop.date?.start ? (prop.date.start.includes('T') ? validTime(prop.date.start) : prop.date.start) : null;
  return prop.number ?? prop.checkbox ?? prop.url ?? null;
}
function changed(existing, properties) { return Object.fromEntries(Object.entries(properties).filter(([key, value]) => comparable(existing?.properties[key]) !== comparable(value))); }
export async function report({ githubToken, notionToken, dryRun = true, fetcher = fetch, pause = sleep, now = new Date().toISOString(), runUrl = null } = {}) {
  if (!githubToken || !notionToken) throw new Error('GitHub and Notion credentials are required.');
  now = validTime(now);
  if (runUrl && !new RegExp(`^https://github.com/${REPO}/actions/runs/[1-9][0-9]*$`).test(runUrl)) throw new Error('Invalid workflow run URL.');
  const request = makeClient({ githubToken, notionToken, fetcher, pause });
  let health, cursorSummary;
  let phase = 'schema';
  try {
    for (const source of SOURCES) {
      const schema = await request('notion', `data_sources/${source.id}`);
      for (const [name, type] of Object.entries({ [source.title]: 'title', [source.owner]: 'people', ...source.schema })) if (schema.properties?.[name]?.type !== type) throw new Error(`Unexpected ${source.kind} schema: ${name}.`);
    }
    for (const [name, id] of Object.entries(OUTPUTS)) {
      const schema = await request('notion', `data_sources/${id}`);
      for (const [prop, type] of Object.entries(OUTPUT_SCHEMAS[name])) if (schema.properties?.[prop]?.type !== type) throw new Error(`Unexpected ${name} schema: ${prop}.`);
    }
    phase = 'health.read';
    health = await request('notion', `pages/${HEALTH_PAGE}`);
    if (health.parent?.data_source_id !== OUTPUTS.health || health.archived || health.in_trash) throw new Error('Unexpected capture health page.');
    const previous = await readCursor(request, health);
    const since = dateValue(health.properties['Monitoring since']) ? validTime(dateValue(health.properties['Monitoring since'])) : now;
    const last = dateValue(health.properties['Last success']);
    if (since > now || (last && validTime(last) > now)) throw new Error('Capture clock precedes saved state.');
    phase = 'sources.read';
    const records = [];
    for (const source of SOURCES) for (const page of await queryAll(request, source.id)) records.push({ source, page });
    phase = 'outputs.read';
    const activities = await queryAll(request, OUTPUTS.activity);
    const periodRows = indexRows(await queryAll(request, OUTPUTS.periods), 'Period key');
    const mergedRows = indexRows(await queryAll(request, OUTPUTS.merged), 'GitHub PR');
    phase = 'pulls.read';
    const pulls = new Map();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = await request('github', `repos/${REPO}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`);
      if (!Array.isArray(rows)) throw new Error('Invalid GitHub pull request list.');
      for (const pr of rows) pulls.set(pr.number, pr);
      if (rows.length < 100) break;
      if (page === MAX_PAGES) throw new Error('GitHub pagination limit reached; refusing incomplete capture.');
    }
    phase = 'plan';
    const notionPlan = planRecords(records, previous.states, since, now);
    const gitPlan = planPulls([...pulls.values()], since, now);
    const savedEvents = decodeEvents(activities);
    const eventKeys = new Set(savedEvents.map(e => e.key));
    const newEvents = [...notionPlan.events, ...gitPlan.events].filter(e => !eventKeys.has(e.key));
    const gaps = [...previous.gaps];
    if (last && Date.parse(now) - Date.parse(last) > GAP_MS) gaps.push([validTime(last), now]);
    const state = { version: 1, states: notionPlan.states, gaps };
    const cursorProperty = rich(JSON.stringify(state)); // Bound state before any writes.
    const cursorLengths = cursorProperty.rich_text.map(part => part.text.content.length);
    cursorSummary = { chars: cursorLengths.reduce((a, b) => a + b, 0), segments: cursorLengths.length, maxSegment: Math.max(0, ...cursorLengths) };
    const periods = summarizePeriods([...savedEvents, ...newEvents], since, now, gaps);
    const summary = { dryRun, baseline: !last, sourceRecords: records.length, newEvents: newEvents.length, mergedPRs: gitPlan.merged.length, periods: periods.length, defaultOwners: notionPlan.owners.length };
    if (dryRun) return summary;
    phase = 'health.start';
    await request('notion', `pages/${HEALTH_PAGE}`, 'PATCH', { properties: { 'Run state': select('Running'), 'Last attempt': date(now), 'Monitoring since': date(since), 'Run URL': { url: runUrl } } });
    phase = 'events.write';
    for (const event of newEvents) {
      // A previous ambiguous POST can have succeeded. Requery its stable key.
      const found = await request('notion', `data_sources/${OUTPUTS.activity}/query`, 'POST', { page_size: 2, filter: { property: 'Event key', rich_text: { equals: event.key } } });
      if (!Array.isArray(found.results) || found.has_more || found.results.length > 1) throw new Error('Ambiguous activity key.');
      if (!found.results.length) await request('notion', 'pages', 'POST', { parent: { type: 'data_source_id', data_source_id: OUTPUTS.activity }, properties: eventFields(event) });
    }
    phase = 'pulls.write';
    for (const pr of gitPlan.merged) {
      const old = mergedRows.get(pr.html_url);
      const properties = { Name: rich(`#${pr.number} ${pr.title}`.slice(0, 1800), 'title'), 'PR number': { number: pr.number }, State: select('Merged'), 'GitHub PR': { url: pr.html_url }, 'Merged at': date(pr.merged_at), 'Merge commit': rich(pr.merge_commit_sha), 'PR head commit': rich(pr.head.sha), Repository: rich(REPO) };
      if (!old) {
        const links = records.filter(r => r.source.kind === 'Task' && r.page.properties['GitHub PR']?.url === pr.html_url).map(r => ({ id: r.page.id }));
        if (links.length > 100) throw new Error('Too many linked tasks for one PR.');
        Object.assign(properties, { Owner: people(), 'Imported at': date(now), 'Release check': select(links.length ? 'See linked task' : 'Not assessed'), Task: { relation: links } });
        await request('notion', 'pages', 'POST', { parent: { type: 'data_source_id', data_source_id: OUTPUTS.merged }, properties });
      } else {
        const updates = changed(old, properties);
        if (Object.keys(updates).length) await request('notion', `pages/${old.id}`, 'PATCH', { properties: updates });
      }
    }
    phase = 'owners.write';
    for (const owner of notionPlan.owners) await request('notion', `pages/${owner.id}`, 'PATCH', { properties: { [owner.property]: people() } });
    phase = 'periods.write';
    for (const p of periods) {
      const old = periodRows.get(p.key);
      const name = p.cadence === 'Week' ? `Week of ${p.start}` : p.cadence === 'Month' ? p.start.slice(0, 7) : `${p.start.slice(0, 4)} Q${Math.floor((Number(p.start.slice(5, 7)) - 1) / 3) + 1}`;
      const notes = `America/New_York. Capture starts ${since}. ${p.current ? 'Period in progress. ' : ''}${p.coverage === 'Partial' ? 'Partial period or a capture gap; do not compare to a complete period as equivalent coverage. ' : ''}Each metric counts unique source records with that event in this period. Reopening includes withdrawal of a completion or its evidence and is shown separately; reworked records can appear in different periods. PR merges are not deployments.`;
      const properties = { Name: rich(name, 'title'), 'Period key': rich(p.key), Cadence: select(p.cadence), Start: date(p.start), End: date(p.end), Current: { checkbox: p.current }, Coverage: select(p.coverage), ...Object.fromEntries(Object.entries(p.counts).map(([name, number]) => [name, { number }])), Notes: rich(notes), Owner: people() };
      const updates = changed(old, properties);
      if (old && (Object.keys(updates).length || p.current)) await request('notion', `pages/${old.id}`, 'PATCH', { properties: { ...updates, 'Last refreshed': date(now) } });
      else if (!old) await request('notion', 'pages', 'POST', { parent: { type: 'data_source_id', data_source_id: OUTPUTS.periods }, properties: { ...properties, 'Last refreshed': date(now) } });
    }
    // Setup placeholders can predate activation if setup spans a period boundary.
    // Retain their unknown totals but stop presenting them as current.
    const periodKeys = new Set(periods.map(p => p.key));
    for (const [key, row] of periodRows) if (!periodKeys.has(key) && row.properties.Current?.checkbox) {
      await request('notion', `pages/${row.id}`, 'PATCH', { properties: { Current: { checkbox: false } } });
    }
    phase = 'health.commit';
    await request('notion', `pages/${HEALTH_PAGE}`, 'PATCH', { properties: { 'Run state': select('Healthy'), 'Last success': date(now), Cursor: cursorProperty, Owner: people(), Details: rich(`Captured ${records.length} source records and checked ${pulls.size} PRs. Added ${newEvents.length} events. Notion completion timestamps are first observed; transient changes between checks can be missed.`) } });
    return summary;
  } catch (error) {
    const failure = error && (typeof error === 'object' || typeof error === 'function') ? error : new Error('Unknown capture failure.');
    diagnostics.set(failure, { ...diagnostics.get(failure), phase, cursor: cursorSummary });
    // Last success and cursor stay unchanged. A disabled or inaccessible writer
    // also becomes visibly stale through the native Notion freshness formula.
    if (!dryRun) {
      try { await request('notion', `pages/${HEALTH_PAGE}`, 'PATCH', { properties: { 'Run state': select('Failed'), 'Last attempt': date(now), 'Run URL': { url: runUrl }, Details: rich(`${formatReportingError(failure)} Last success is unchanged. Check the workflow run.`) } }); } catch { /* GitHub failure plus stale timestamp remains the fallback. */ }
    }
    throw failure;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  report({ githubToken: process.env.GITHUB_TOKEN, notionToken: process.env.NOTION_TOKEN, dryRun: process.env.NOTION_SYNC_APPLY !== 'true', runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}` : null })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(formatReportingError(error)); process.exitCode = 1; });
}
