/**
 * One-time install ping for macos-mcp. That is the entire telemetry surface.
 *
 * WHY SO LITTLE: this MCP points INWARD — the user reaches through it into
 * their own mail, calendar, notes, camera. For an inward-facing tool even
 * "safe" metadata (boot times, tool names, error rhythms) is information
 * about a person's life, so the rule here is don't-emit, not
 * capture-and-curate. The outward-facing MCPs in this fleet (GA4, GSC, ...)
 * carry richer telemetry; this one deliberately does not.
 *
 * WHAT IS SENT: exactly one event, ever — `server_first_install`, fired the
 * first time the server runs (when the install id is created), carrying
 * version/os/arch/node only. No boot events, no tool events, no errors, no
 * client identity, no sessions. If the ping fails, it is never retried and
 * the install goes uncounted — silence is preferred over retry logic.
 *
 * OPT-OUT (absolute, checked before anything): DISABLE_TELEMETRY /
 * DO_NOT_TRACK / NO_TELEMETRY. Opted-out installs never create network
 * traffic and are never counted.
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Overridable via env only for local verification / self-hosting.
const TELEMETRY_ENDPOINT =
  process.env.MACOS_MCP_TELEMETRY_ENDPOINT || 'https://macos-mcp.builditwithai.xyz/e';
const CONFIG_DIR = path.join(os.homedir(), '.macos_mcp');
const INSTALL_ID_FILE = path.join(CONFIG_DIR, 'install_id');

/** Any of these set to a truthy, non-"false"/"0" value disables telemetry. */
function isOptedOut(): boolean {
  for (const name of ['DISABLE_TELEMETRY', 'DO_NOT_TRACK', 'NO_TELEMETRY']) {
    const v = process.env[name];
    if (v !== undefined && v !== '' && v !== '0' && v.toLowerCase() !== 'false') {
      return true;
    }
  }
  return false;
}

/**
 * Fired once at boot. Sends the one-time ping ONLY if this is the first run
 * ever (no install id on disk). The persisted id file doubles as the
 * "already pinged" marker, so the ping can never repeat. Installs where the
 * id cannot be persisted (read-only HOME, sandboxes) send nothing — better
 * to undercount than to ping on every boot.
 */
export function trackFirstInstall(version: string): void {
  if (isOptedOut()) return;
  try {
    if (fs.existsSync(INSTALL_ID_FILE) && fs.readFileSync(INSTALL_ID_FILE, 'utf8').trim()) {
      return; // not the first run — telemetry stays silent forever
    }
    const installId = `inst_${randomUUID().replace(/-/g, '')}`;
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(INSTALL_ID_FILE, installId, { mode: 0o600 });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    // Product UA — the gateway ignores default library/runtime UAs.
    void fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': `macos-mcp/${version}`,
      },
      body: JSON.stringify({
        event: 'server_first_install',
        mcp_server_name: 'macos-mcp',
        install_id: installId,
        server_version: version,
        os: process.platform,
        arch: process.arch,
        node_version: process.versions.node,
        ts: new Date().toISOString(),
      }),
      signal: controller.signal,
    })
      .catch(() => { /* best-effort; never retried */ })
      .finally(() => clearTimeout(timer));
  } catch {
    /* never let telemetry break the server */
  }
}
