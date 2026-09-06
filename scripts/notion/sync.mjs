import { pathToFileURL } from 'node:url';

export const REPO = 'samra-pay/Samra-Pay';
export const SOURCE = '3d114b38-4266-805a-832d-000b268a539e';
export function prNumber(url) {
  const match = /^https:\/\/github\.com\/samra-pay\/Samra-Pay\/pull\/([1-9]\d*)$/.exec(url ?? '');
  return match ? Number(match[1]) : null;
}
export function transition(pr, checks, statuses, current) {
  if (current === 'Released') return { state: null, note: 'Released preserved; deployment evidence remains authoritative.' };
  if (!pr.merged && pr.state === 'closed') return { state: null, note: 'PR closed without merge. Decide whether to revise or close this ticket.' };
  const failed = checks.some(c => c.status === 'completed' && !['success', 'neutral', 'skipped'].includes(c.conclusion)) || statuses.some(s => ['failure', 'error'].includes(s.state));
  const pending = checks.some(c => c.status !== 'completed') || statuses.some(s => s.state === 'pending');
  // Require the repository CI gate as well as all other reported checks.
  const quality = checks.some(c => c.name === 'Linux quality gate' && c.status === 'completed' && c.conclusion === 'success');
  const ready = quality && !failed && !pending;
  return { state: pr.merged && ready ? 'Ready to release' : pr.draft ? 'Building' : 'Review', note: failed ? 'Checks failed; inspect the linked PR.' : pending ? 'Checks pending.' : !quality ? 'Required Linux quality gate not verified on PR head.' : pr.merged ? 'Merged; PR-head checks passed. Deployment and release approval remain separate.' : 'PR open; checks passed. Review required.' };
}
export async function sync({ githubToken, notionToken, dryRun = true, fetcher = fetch }) {
  if (!githubToken || !notionToken) throw new Error('GitHub and Notion credentials are required.');
  async function request(service, path, method = 'GET', body) {
    const notion = service === 'notion';
    const response = await fetcher((notion ? 'https://api.notion.com/v1/' : 'https://api.github.com/') + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${notion ? notionToken : githubToken}`, 'Content-Type': 'application/json', ...(notion ? { 'Notion-Version': '2025-09-03' } : { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    // Do not log response bodies, request headers, or credentials.
    if (!response.ok) throw new Error(`${service} request failed: HTTP ${response.status}`);
    return response.json();
  }
  const schema = await request('notion', `data_sources/${SOURCE}`);
  for (const [name, type] of Object.entries({ Status: 'select', Development: 'checkbox', 'GitHub PR': 'url', 'GitHub sync': 'rich_text' })) {
    if (schema.properties?.[name]?.type !== type) throw new Error(`Unexpected Notion schema: ${name}`);
  }
  let cursor; let count = 0;
  do {
    const result = await request('notion', `data_sources/${SOURCE}/query`, 'POST', {
      page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
      filter: { and: [{ property: 'Development', checkbox: { equals: true } }, { property: 'GitHub PR', url: { is_not_empty: true } }] },
    });
    for (const page of result.results) {
      if (page.parent?.data_source_id !== SOURCE || page.archived || page.in_trash) continue;
      const number = prNumber(page.properties['GitHub PR']?.url);
      if (!number) continue;
      const pr = await request('github', `repos/${REPO}/pulls/${number}`);
      if (pr.base.repo.full_name !== REPO || pr.head.repo?.full_name !== REPO || pr.base.ref !== 'main') continue;
      const sha = pr.head.sha;
      if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid PR SHA');
      const checks = await request('github', `repos/${REPO}/commits/${sha}/check-runs?per_page=100&filter=latest`);
      const status = await request('github', `repos/${REPO}/commits/${sha}/status?per_page=100`);
      // Refuse incomplete evidence rather than treating a truncated page as green.
      if (checks.total_count > 100 || status.total_count > 100) throw new Error('Check evidence requires pagination; refusing status update');
      const plan = transition(pr, checks.check_runs, status.statuses, page.properties.Status?.select?.name);
      const note = `PR #${number} @ ${sha}: ${plan.note}`;
      const oldNote = page.properties['GitHub sync'].rich_text.map(t => t.plain_text ?? t.text?.content ?? '').join('');
      const properties = {};
      if (plan.state && plan.state !== page.properties.Status?.select?.name) properties.Status = { select: { name: plan.state } };
      if (note !== oldNote) properties['GitHub sync'] = { rich_text: [{ text: { content: note } }] };
      if (Object.keys(properties).length && !dryRun) await request('notion', `pages/${page.id}`, 'PATCH', { properties });
      console.log(`PR #${number}: ${dryRun ? 'dry-run' : 'synced'} ${plan.state ?? 'preserved'}`);
      count++;
    }
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return count;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sync({ githubToken: process.env.GITHUB_TOKEN, notionToken: process.env.NOTION_TOKEN, dryRun: process.env.NOTION_SYNC_APPLY !== 'true' })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
