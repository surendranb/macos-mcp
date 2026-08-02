#!/usr/bin/env node
// Smoke test for the macOS MCP server — spawns dist/index.js over stdio and
// exercises the tools that regressed per the Aug 2 session trace:
//   - get_podcast_transcript: fs-based lookup (no find/cat exec), word spacing
//   - get_reminders / list_notes: batched AppleScript (no hangs)
//   - open_podcast_episode: podcasts:// deep link
// Usage: npm run build && node test/smoke.mjs [transcriptId]
import { spawn } from 'child_process';

const KNOWN_CACHED_ID = process.argv[2] || '1000779512444'; // Micky Malka ep, verified-cached
const KNOWN_MISSING_ID = '999999999999'; // never cached

let failures = 0;
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function main() {
  const server = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  const pending = new Map();
  let nextId = 1;

  server.stdout.on('data', (d) => {
    buffer += d.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });

  const call = (method, params, timeoutMs = 30_000) =>
    new Promise((resolve) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ timeout: true, id });
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });

  await new Promise((r) => setTimeout(r, 1500));

  // 1. Handshake
  const init = await call('initialize', {
    protocolVersion: '2026-07-28',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '1.0.0' },
  }, 10_000);
  check('initialize responds', !init.timeout && init.result?.serverInfo?.name === 'macos-companion-mcp');

  // 2. Tools list contains the podcast tools
  const list = await call('tools/list', {});
  const names = list.result?.tools?.map((t) => t.name) || [];
  for (const t of ['get_podcast_transcript', 'open_podcast_episode', 'play_podcast_episode', 'pause_podcast_episode', 'get_recent_podcast_episodes']) {
    check(`tools/list has ${t}`, names.includes(t));
  }
  check('tools/list count > 35', names.length > 35, `${names.length}`);

  // 3. get_recent_podcast_episodes surfaces transcript/episode ids
  const eps = await call('tools/call', { name: 'get_recent_podcast_episodes', arguments: { limit: 5 } }, 30_000);
  const epText = eps.result?.content?.[0]?.text || '';
  let parsed = [];
  try { parsed = JSON.parse(epText); } catch {}
  check('episodes returns array', Array.isArray(parsed));
  const withTranscript = parsed.find((e) => e.transcriptId);
  check('episodes include transcriptId field', parsed.length > 0 && 'transcriptId' in parsed[0]);
  check('episodes include episodeId field', parsed.length > 0 && 'episodeId' in parsed[0]);

  // 4. get_podcast_transcript on a KNOWN-CACHED id: words must have spaces
  const tr = await call('tools/call', {
    name: 'get_podcast_transcript',
    arguments: { transcriptId: `PodcastContent221/v4/00/00/00/transcript_${KNOWN_CACHED_ID}.ttml`, includeTimestamps: false },
  }, 30_000);
  const trText = tr.result?.content?.[0]?.text || '';
  const trJson = JSON.parse(trText);
  check('transcript (cached) returns content', !tr.timeout && trJson.segments?.length > 0, `${trJson.segments?.length || 0} segments`);
  if (trJson.transcript) {
    check('transcript words have spaces (no run-together)', !/\.\w/.test(trJson.transcript.slice(0, 200)), trJson.transcript.slice(0, 60).replace(/\n/g, ' '));
    check('transcript has speaker labels', /Speaker \d/.test(trJson.transcript));
  }

  // 5. get_podcast_transcript on a missing id: clean isError, no exception
  const miss = await call('tools/call', {
    name: 'get_podcast_transcript',
    arguments: { transcriptId: `PodcastContent221/v4/00/00/00/transcript_${KNOWN_MISSING_ID}.ttml` },
  }, 30_000);
  check('transcript (missing) isError', miss.result?.isError === true);
  check('transcript (missing) friendly message', /not cached|Play the episode/i.test(miss.result?.content?.[0]?.text || ''));

  // 6. open_podcast_episode UI flow (search + open top result in Podcasts app)
  const openTitle = withTranscript?.title || parsed[0]?.title || 'The Daily';
  const open = await call('tools/call', { name: 'open_podcast_episode', arguments: { title: openTitle } }, 40_000);
  check('open_podcast_episode returns ok', !open.timeout && open.result?.isError !== true, open.result?.content?.[0]?.text?.slice(0, 40) || '');

  // 7. get_reminders must NOT hang (was 75s per-object loop)
  const t0 = Date.now();
  const rem = await call('tools/call', { name: 'get_reminders', arguments: {} }, 40_000);
  const remMs = Date.now() - t0;
  check('get_reminders responds', !rem.timeout && rem.result?.isError !== true, `${remMs}ms`);
  try {
    const arr = JSON.parse(rem.result?.content?.[0]?.text || '[]');
    check('get_reminders returns array', Array.isArray(arr));
  } catch { check('get_reminders returns array', false); }

  // 8. list_notes must NOT hang (was >25s per-object loop)
  const t1 = Date.now();
  const notes = await call('tools/call', { name: 'list_notes', arguments: {} }, 40_000);
  const notesMs = Date.now() - t1;
  check('list_notes responds', !notes.timeout && notes.result?.isError !== true, `${notesMs}ms`);
  try {
    const arr = JSON.parse(notes.result?.content?.[0]?.text || '[]');
    check('list_notes returns array', Array.isArray(arr));
  } catch { check('list_notes returns array', false); }

  // 9. Basic system tools still fine
  const disk = await call('tools/call', { name: 'get_disk_usage', arguments: {} }, 30_000);
  check('get_disk_usage works', !disk.timeout && disk.result?.isError !== true);

  server.kill();
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('test harness error:', e); process.exit(1); });
