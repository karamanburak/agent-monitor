// End-to-end smoke test: real backend + real Vite dev server + headless Chrome, driven over
// the Chrome DevTools Protocol. No extra dependencies and nothing leaves the machine.
//
//   bun run test:e2e
//
// Everything is throwaway: the backend writes to a temp SQLite file (AGENT_MONITOR_DB),
// usage scanning sees an empty temp HOME, and both servers use free ports — your real
// events.db and running dashboard are never touched. Skips (exit 0) if Chrome isn't found;
// set CHROME_PATH to point at a Chrome/Chromium binary.

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer as netServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { SHORTCUTS } from '../../src/lib/shortcuts';

const ROOT = path.join(import.meta.dir, '..', '..');
const TMP = mkdtempSync(path.join(os.tmpdir(), 'agent-monitor-e2e-'));
const procs: { kill: () => void }[] = [];
let failures = 0;

function cleanup() {
  for (const p of procs) {
    try {
      p.kill();
    } catch {
      /* already gone */
    }
  }
  rmSync(TMP, { recursive: true, force: true });
}

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean) as string[];
  return candidates.find((c) => existsSync(c)) || null;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = netServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, what: string, ms = 10000): Promise<T> {
  const end = Date.now() + ms;
  let last: unknown;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v as T;
    } catch (e) {
      last = e;
    }
    await Bun.sleep(100);
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (${String(last)})` : ''}`);
}

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------- minimal CDP client ----------
class Page {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  constructor(private ws: WebSocket) {
    ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      if (d.id && this.pending.has(d.id)) {
        this.pending.get(d.id)!(d);
        this.pending.delete(d.id);
      }
    };
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve) => {
      const i = ++this.id;
      this.pending.set(i, resolve);
      this.ws.send(JSON.stringify({ id: i, method, params }));
    });
  }
  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
    return r.result?.result?.value as T;
  }
  async goto(url: string) {
    await this.send('Page.navigate', { url });
    await waitFor(() => this.eval<boolean>(`document.readyState === 'complete' && !!document.querySelector('.topbar')`), 'app shell');
  }
  key(key: string, extra: Record<string, unknown> = {}) {
    return this.eval(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, ...extra })}))`);
  }
}

// ---------- fixture ----------
let API = '';
async function post(e: Record<string, unknown>) {
  const res = await fetch(`${API}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'claude', ...e }),
  });
  if (res.status !== 204) throw new Error(`POST /event → ${res.status}`);
  await Bun.sleep(10);
}
async function tool(sid: string, cwd: string, id: string, name: string, input: unknown, resp: unknown = { stdout: 'ok' }) {
  await post({ hook_event_name: 'PreToolUse', session_id: sid, cwd, tool_name: name, tool_use_id: id, tool_input: input });
  await post({ hook_event_name: 'PostToolUse', session_id: sid, cwd, tool_name: name, tool_use_id: id, tool_response: resp });
}
async function seed() {
  const A = 'e2e-acme',
    acwd = '/tmp/e2e/acme-web';
  await post({ hook_event_name: 'SessionStart', session_id: A, cwd: acwd, model: 'claude-opus-5-5' });
  await post({ hook_event_name: 'UserPromptSubmit', session_id: A, cwd: acwd, prompt: 'Add a dark-mode toggle' });
  await tool(A, acwd, 'tu_1', 'Read', { file_path: 'src/Page.tsx' });
  await tool(A, acwd, 'tu_2', 'Edit', { file_path: 'src/Page.tsx', old_string: 'a', new_string: 'b' });
  await tool(A, acwd, 'tu_3', 'Bash', { command: 'npm test' }, { is_error: true, stderr: 'FAIL' });
  await post({ hook_event_name: 'SubagentStart', session_id: A, cwd: acwd, agent_id: 'ag_1', agent_type: 'Explore' });
  await post({ hook_event_name: 'SubagentStop', session_id: A, cwd: acwd, agent_id: 'ag_1' });
  const B = 'e2e-billing',
    bcwd = '/tmp/e2e/billing-api';
  await post({ hook_event_name: 'SessionStart', session_id: B, cwd: bcwd });
  await post({ hook_event_name: 'UserPromptSubmit', session_id: B, cwd: bcwd, prompt: 'Run the migration' });
  await post({ hook_event_name: 'Notification', session_id: B, cwd: bcwd, message: 'Claude needs your permission to use Bash' });
}

// ---------- run ----------
async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.log('e2e smoke: skipped — no Chrome/Chromium found (set CHROME_PATH)');
    return;
  }
  const [apiPort, uiPort, cdpPort] = [await freePort(), await freePort(), await freePort()];
  API = `http://127.0.0.1:${apiPort}`;
  const UI = `http://127.0.0.1:${uiPort}/`;

  const api = Bun.spawn(['bun', 'run', path.join(ROOT, 'server/server.ts')], {
    env: { ...process.env, PORT: String(apiPort), AGENT_MONITOR_DB: path.join(TMP, 'events.db'), HOME: TMP },
    stdout: 'ignore',
    stderr: 'ignore',
  });
  procs.push(api);
  await waitFor(() => fetch(`${API}/stats`).then((r) => r.ok), 'backend');

  process.env.AGENT_MONITOR_API = API;
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    cacheDir: path.join(ROOT, 'node_modules', '.vite-e2e'), // separate from the dev server's .vite cache
    logLevel: 'silent',
    server: { port: uiPort, strictPort: true },
  });
  await vite.listen();
  procs.push({ kill: () => void vite.close() });

  const chrome = Bun.spawn(
    [chromePath, '--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${path.join(TMP, 'chrome')}`,
      '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' },
  );
  procs.push(chrome);
  const target = await waitFor(
    () => fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json()).then((l: any[]) => l.find((t) => t.type === 'page')),
    'chrome',
  );
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const page = new Page(ws);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await seed();
  await page.goto(UI);
  const select = (name: string) =>
    page.eval(`[...document.querySelectorAll('.srow-main')].find((b) => b.textContent.includes(${JSON.stringify(name)}))?.click()`);

  console.log('e2e smoke');
  await check('rail lists both live sessions, needs-you first', async () => {
    const names = await waitFor(
      () => page.eval<string[]>(`[...document.querySelectorAll('.srow .sname')].map((e) => e.textContent)`).then((n) => n.length >= 2 && n),
      'two rail rows',
    );
    if (!names[0].includes('billing-api')) throw new Error(`first row was "${names[0]}"`);
  });
  await check('top bar shows the needs-you pill', async () => {
    await waitFor(() => page.eval<boolean>(`/1 needs you/.test(document.querySelector('.pill.needs.show')?.textContent || '')`), 'pill');
  });
  await check('waiting session shows the needs-you banner with its wait time', async () => {
    await select('billing-api');
    await waitFor(() => page.eval<boolean>(`!!document.querySelector('.detail-view.waiting .dbanner .bwait')`), 'banner');
  });
  await check('timeline marks the failed tool and labels the subagent by type', async () => {
    await select('acme-web');
    await waitFor(() => page.eval<boolean>(`document.querySelectorAll('.trow.tool.failed').length === 1`), 'failed row');
    await waitFor(() => page.eval<boolean>(`/Explore \\(/.test(document.querySelector('.dtl')?.textContent || '')`), 'Explore label');
  });
  await check('a tool finishing while the page is open stops showing "running"', async () => {
    // regression: live PostToolUse used to update only the pending copy of the entry
    await post({ hook_event_name: 'PreToolUse', session_id: 'e2e-acme', cwd: '/tmp/e2e/acme-web', tool_name: 'Grep', tool_use_id: 'tu_live', tool_input: { pattern: 'x' } });
    await waitFor(() => page.eval<boolean>(`!!document.querySelector('.trow.tool.running')`), 'running row');
    await post({ hook_event_name: 'PostToolUse', session_id: 'e2e-acme', cwd: '/tmp/e2e/acme-web', tool_name: 'Grep', tool_use_id: 'tu_live', tool_response: { stdout: 'x' } });
    await waitFor(() => page.eval<boolean>(`!document.querySelector('.trow.tool.running')`), 'row to finish');
  });
  await check('clicking a tool row opens the inspector and the pane makes room', async () => {
    await page.eval(`document.querySelector('.trow.tool')?.click()`);
    await waitFor(() => page.eval<boolean>(`!!document.querySelector('.inspector.open') && document.body.classList.contains('inspopen')`), 'inspector');
    await page.key('Escape');
    await waitFor(() => page.eval<boolean>(`!document.querySelector('.inspector.open')`), 'inspector to close');
  });
  await check('selection and view survive a reload via the URL', async () => {
    await page.eval(`[...document.querySelectorAll('.seg button')].find((b) => b.textContent === 'Trace')?.click()`);
    await waitFor(() => page.eval<boolean>(`/s=e2e-acme/.test(location.search) && /view=trace/.test(location.search)`), 'URL params');
    await page.goto(await page.eval<string>('location.href'));
    await waitFor(() => page.eval<boolean>(`document.querySelector('.dnames h1')?.textContent === 'acme-web' && !!document.querySelector('.detail-view.tracemode')`), 'restored selection');
  });
  await check('"?" cheatsheet lists every registered shortcut', async () => {
    await page.key('?', { shiftKey: true });
    const n = await waitFor(() => page.eval<number>(`document.querySelectorAll('.shortrow').length`), 'cheatsheet');
    if (n !== SHORTCUTS.length) throw new Error(`${n} rows, expected ${SHORTCUTS.length}`);
    await page.key('Escape');
  });
  await check('Stats splits live data from transcript usage', async () => {
    await page.eval(`[...document.querySelectorAll('.topbar button')].find((b) => /Stats/.test(b.textContent))?.click()`);
    const tabs = await waitFor(() => page.eval<string[]>(`[...document.querySelectorAll('.stattabs button')].map((b) => b.textContent)`).then((t) => (t.length ? t : null)), 'tabs');
    if (tabs.join('|') !== 'Live now|Your usage') throw new Error(`tabs: ${tabs.join(', ')}`);
  });

  ws.close();
}

try {
  await main();
} catch (e) {
  failures++;
  console.error('e2e smoke: setup failed —', e instanceof Error ? e.message : e);
} finally {
  cleanup();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
