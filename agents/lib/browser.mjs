// Headless-browser helper (Edge/Chrome over CDP).
//
// One browser process is reused for every render in a run — launching a browser
// per image is the difference between 4 seconds and 40.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const CANDIDATES = [
  process.env.AIVOXFLOW_BROWSER,
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findBrowser() {
  return CANDIDATES.find((p) => p && existsSync(p)) || null;
}

let session = null;

async function launch(bin) {
  const port = 9487 + (process.pid % 200);
  const udd = path.join(process.env.TEMP || '/tmp', `aivox-profile-${process.pid}-${Date.now()}`);
  const proc = spawn(bin, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--force-device-scale-factor=1',
    `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`, '--remote-allow-origins=*',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  const kill = () => {
    try { execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* unix or gone */ }
    try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    try { rmSync(udd, { recursive: true, force: true }); } catch { /* locked */ }
  };
  process.once('exit', kill);

  let version = null;
  for (let i = 0; i < 80 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  if (!version) { kill(); throw new Error('Browser DevTools endpoint never came up.'); }

  let targets = [];
  for (let i = 0; i < 30 && !targets.length; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) { kill(); throw new Error('No page target in the browser.'); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });

  let id = 0;
  const pending = new Map();
  let onLoad = null;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === 'Page.loadEventFired' && onLoad) { onLoad(); onLoad = null; }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');

  const render = async (html, outPath, { width, height, format = 'jpeg', quality = 88 }) => {
    const file = path.join(process.env.TEMP || '/tmp', `aivox-render-${Date.now()}-${id}.html`);
    writeFileSync(file, html, 'utf8');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const loaded = new Promise((r) => { onLoad = r; });
    await send('Page.navigate', { url: `file:///${file.replace(/\\/g, '/')}` });
    await Promise.race([loaded, new Promise((_, rej) => setTimeout(() => rej(new Error('load timeout')), 15000))]);
    await new Promise((r) => setTimeout(r, 120));
    const shot = await send('Page.captureScreenshot', {
      format,
      ...(format === 'jpeg' ? { quality } : {}),
      clip: { x: 0, y: 0, width, height, scale: 1 },
      captureBeyondViewport: false,
    });
    const buf = Buffer.from(shot.data, 'base64');
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
    try { rmSync(file, { force: true }); } catch { /* ignore */ }
    return { bytes: buf.length, width, height };
  };

  return { render, close: kill };
}

export async function getSession() {
  if (session) return session;
  const bin = findBrowser();
  if (!bin) throw new Error('No Edge/Chrome found — set AIVOXFLOW_BROWSER to a browser binary.');
  session = await launch(bin);
  return session;
}

/** Render a single HTML string and write it to outPath. */
export async function renderHtml(html, outPath, opts) {
  const s = await getSession();
  return s.render(html, outPath, opts);
}
