#!/usr/bin/env node
// AIVOXFLOW automatic deployment — static files only.
//
// There is nothing to "install" on the host: no database, no PHP runtime, no
// admin panel. The site is pre-rendered HTML. This script does everything a
// manual File Manager session would do, repeatably:
//
//   1. build the production bundle with the real AIVOXFLOW_SITE_URL
//   2. refuse to ship a preview build (missing sitemap/robots/canonicals)
//   3. back up the live .htaccess before replacing it (deploy/backup-<ts>/)
//   4. upload dist/ over FTP(S) with bounded retries
//   5. smoke-test the live URL (status codes, headers, sitemap host, 404)
//
// One-time setup (credentials stay local — the file is gitignored and the
// password is passed to curl through a temp config file, never a command line):
//   1. hPanel -> Files -> FTP Accounts -> set an FTP password
//   2. cp deploy/.ftp.env.example deploy/.ftp.env   and fill it in
//
// Usage:
//   node deploy/deploy.mjs                 build + upload + live checks
//   node deploy/deploy.mjs --dry-run       show the upload plan, touch nothing
//   node deploy/deploy.mjs --skip-build    reuse the current dist/ as-is
//
// Exit codes: 0 verified live | 1 step failed | 2 missing configuration.

import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url)); // deploy/
const repo = path.join(here, '..');
const dist = path.join(repo, 'dist');
const flags = process.argv.slice(2);
const has = (f) => flags.includes(f);

const say = (...a) => console.log(...a);
const die = (msg, code = 1) => { console.error(`ERROR  ${msg}`); process.exit(code); };

// ---------------------------------------------------------------- credentials
// Sources, in order: deploy/.ftp.env (local operator) then the process
// environment (a CI runner injects the same names as secrets). A deploy is
// only attempted when the essential host+user are present from either source.
const envFile = path.join(here, '.ftp.env');
const local = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) local[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
const fromEnv = (name) => (process.env[name] ?? '').trim();
const cred = (name) => (local[name] !== undefined && local[name] !== '' ? local[name] : fromEnv(name));

if (!has('--dry-run') && !cred('AIVOXFLOW_FTP_HOST')) {
  die('No FTP host configured.\n'
    + '       Local:  cp deploy/.ftp.env.example deploy/.ftp.env   then fill it in\n'
    + '       CI:     set AIVOXFLOW_FTP_HOST / _USER / _PASS (and _SITE_URL) as secrets\n'
    + '       (use --dry-run to preview without any credentials)', 2);
}

const siteUrl = (cred('AIVOXFLOW_SITE_URL') || 'https://aivoxflow.unaux.com').replace(/\/+$/, '');
const ftpHost = cred('AIVOXFLOW_FTP_HOST') || 'ftp.example.invalid';
const ftpUser = cred('AIVOXFLOW_FTP_USER') || '';
const ftpPass = cred('AIVOXFLOW_FTP_PASS') || '';
const remoteRoot = (cred('AIVOXFLOW_FTP_REMOTE_ROOT') || 'public_html').replace(/^\/+|\/+$/g, '');
const ftpSsl = /^(1|true|yes)$/i.test(cred('AIVOXFLOW_FTP_SSL') || '');

// ---------------------------------------------------------------- 1. build
if (!has('--skip-build')) {
  say(`BUILD    ${siteUrl}`);
  const r = spawnSync(process.execPath, [path.join(repo, 'site', 'build.mjs')], {
    cwd: repo,
    stdio: 'inherit',
    env: { ...process.env, AIVOXFLOW_SITE_URL: siteUrl },
  });
  if (r.status !== 0) die('production build failed');
}

// ---------------------------------------------------------------- 2. gates
// A preview build (no SITE_URL) would ship without canonicals, sitemap and
// feeds. Never upload one, whatever the flags say.
for (const f of ['index.html', '404.html', 'sitemap.xml', 'robots.txt', 'feed.xml']) {
  if (!existsSync(path.join(dist, f))) {
    die(`dist/${f} missing — that is a preview build, not a deployable one. `
      + (has('--skip-build') ? 'Re-run without --skip-build.' : 'Did the build print the SITE_URL note?'));
  }
}
if (!existsSync(path.join(here, 'apache.htaccess'))) die('deploy/apache.htaccess is missing');

// ---------------------------------------------------------------- 3. plan
const walk = (dir, rel = '', out = []) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, `${rel}${name}/`, out);
    else out.push({ local: full, remote: `${rel}${name}` });
  }
  return out;
};
const files = walk(dist);
files.push({ local: path.join(here, 'apache.htaccess'), remote: '.htaccess' });
const bytes = files.reduce((n, f) => n + statSync(f.local).size, 0);
const base = `ftp://${ftpHost}/${remoteRoot ? `${remoteRoot}/` : ''}`;
say(`PLAN     ${files.length} files, ${(bytes / 1048576).toFixed(2)} MB -> ${base}${ftpUser ? ` (as ${ftpUser})` : ''}`);

if (has('--dry-run')) {
  files.slice(0, 6).forEach((f) => say(`         ${path.relative(repo, f.local)} -> ${f.remote}`));
  say(`         ... +${files.length - 6} more`);
  process.exit(0);
}

// curl.exe ships with Windows 10+; Linux/macOS runners provide plain `curl`.
const curlBin = ['curl.exe', 'curl'].find((bin) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0);
if (!curlBin) die('curl not found on PATH (it ships with Windows 10+ and every CI runner)');

// curl reads the credentials from a temp config file (-K) so the password
// never appears on a command line or in any log.
const cfgPath = path.join(here, '.curlcfg.tmp');
const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
writeFileSync(cfgPath, `user = ${q(`${ftpUser}:${ftpPass}`)}\n${ftpSsl ? 'ssl-reqd = true\n' : ''}`, 'utf8');
const curl = (extra) => spawnSync(curlBin, [
  '-sS', '--fail', '--retry', '2', '--retry-delay', '1', '-K', cfgPath, ...extra,
], { encoding: 'utf8' });

let uploadError = null;
try {
  // ---------------------------------------------------------------- 4a. backup
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const backupDir = path.join(here, `backup-${stamp}`);
  const bak = curl(['-o', path.join(backupDir, 'remote.htaccess'), `${base}.htaccess`]);
  if (bak.status === 0) {
    say(`BACKUP   live .htaccess -> ${path.relative(repo, path.join(backupDir, 'remote.htaccess'))}`);
  } else {
    say('BACKUP   no live .htaccess found (nothing to preserve)');
  }

  // ---------------------------------------------------------------- 4b. upload
  for (const f of files) {
    const r = curl(['--ftp-create-dirs', '-T', f.local, `${base}${f.remote}`]);
    if (r.status !== 0) { uploadError = `upload failed: ${f.remote}\n${r.stderr || ''}`; break; }
    say(`PUT      ${f.remote}`);
  }
} finally {
  rmSync(cfgPath, { force: true });
}
if (uploadError) die(uploadError);

// ---------------------------------------------------------------- 5. live checks
say('CHECK    live smoke tests');
const origin = siteUrl;
const checks = [
  ['home returns 200 with HSTS + nosniff', `${origin}/`,
    (r) => r.status === 200
      && !!(r.headers.get('strict-transport-security'))
      && (r.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff'],
  ['sitemap 200 and absolute host', `${origin}/sitemap.xml`,
    (r, t) => r.status === 200 && t.includes(new URL(origin).host) && !t.includes(`${new URL(origin).host}//`)],
  ['robots 200 and links the sitemap', `${origin}/robots.txt`,
    (r, t) => r.status === 200 && t.includes('/sitemap.xml')],
  ['feed 200', `${origin}/feed.xml`, (r) => r.status === 200],
  ['/articles redirects to /articles/', `${origin}/articles`,
    (r) => [301, 308].includes(r.status) && (r.headers.get('location') || '').endsWith('/articles/')],
  ['unknown URL returns real 404', `${origin}/definitely-not-a-page`,
    (r) => r.status === 404],
  ['hashed asset served with immutable cache', `${origin}/assets/favicon.svg`,
    (r) => r.status === 200 && /immutable/.test(r.headers.get('cache-control') || '')],
  ['search page reachable', `${origin}/search/`, (r) => r.status === 200],
];

let failed = 0;
for (const [name, url, test] of checks) {
  try {
    const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'AIVOXFLOW-deploy-check/1.0' } });
    const text = await r.text();
    const ok = await test(r, text);
    say(`${ok ? 'PASS' : 'FAIL'}    ${name}${ok ? '' : ` (status ${r.status})`}`);
    if (!ok) failed++;
  } catch (e) {
    say(`FAIL    ${name} — ${e.message}`);
    failed++;
  }
}

if (failed) die(`${failed} live check(s) failed — files are uploaded but the site needs attention`);
say('DONE     deployed and verified end to end');
