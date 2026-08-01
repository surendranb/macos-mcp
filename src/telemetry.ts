/**
 * Anonymous, PII-aware telemetry for macos-mcp.
 *
 * WHAT THIS IS: the only power this module has is to POST a small JSON event to
 * the shared Cloudflare gateway so we can learn WHO uses the server (client,
 * OS) and WHAT breaks (tool + status). It captures protocol/telemetry metadata
 * ONLY. It NEVER sends tool arguments, tool results, AppleScript, file paths,
 * emails, messages, or anything the user's machine tools touch.
 *
 * PRINCIPLES (mirrors the GA4 MCP telemetry contract):
 *  - Opt-out is absolute: DISABLE_TELEMETRY / DO_NOT_TRACK / NO_TELEMETRY (any
 *    truthy value disables). GA_MCP_TELEMETRY=false also disables.
 *  - No IPs are ever stored (the gateway strips them; we never send them).
 *  - Random, resettable install id (delete ~/.macos_mcp/install_id to reset).
 *    No fingerprinting, ever.
 *  - Capture-first: the client sends raw metadata; the worker scrubs/curates
 *    later. Nothing PII-bearing is captured here in the first place.
 *  - Fire-and-forget: telemetry never blocks or breaks a tool call.
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Endpoint is overridable via env only for local verification / self-hosting;
// it defaults to the shared gateway. This is not a telemetry marker persisted
// on the user's machine — it's read from the environment at runtime.
const TELEMETRY_ENDPOINT =
  process.env.MACOS_MCP_TELEMETRY_ENDPOINT || 'https://macos-mcp.builditwithai.xyz/e';
const CONFIG_DIR = path.join(os.homedir(), '.macos_mcp');
const INSTALL_ID_FILE = path.join(CONFIG_DIR, 'install_id');

/** Any of these set to a truthy, non-"false"/"0" value disables telemetry. */
function isOptedOut(): boolean {
  const disableVars = [
    'DISABLE_TELEMETRY',
    'DO_NOT_TRACK',
    'NO_TELEMETRY',
  ];
  for (const name of disableVars) {
    const v = process.env[name];
    if (v !== undefined && v !== '' && v !== '0' && v.toLowerCase() !== 'false') {
      return true;
    }
  }
  // Explicit false-style opt-out for the product-specific flag.
  const flag = process.env.GA_MCP_TELEMETRY;
  if (flag !== undefined && flag.toLowerCase() === 'false') {
    return true;
  }
  return false;
}

const OPTED_OUT = isOptedOut();

/**
 * A random, resettable install id. Stored under ~/.macos_mcp/install_id.
 * If the file can't be read/written (read-only home, sandbox), we fall back to
 * an ephemeral in-memory id so telemetry still groups within one process run.
 */
let cachedInstallId: string | null = null;
function getInstallId(): string {
  if (cachedInstallId) return cachedInstallId;
  try {
    if (fs.existsSync(INSTALL_ID_FILE)) {
      const existing = fs.readFileSync(INSTALL_ID_FILE, 'utf8').trim();
      if (existing) {
        cachedInstallId = existing;
        return existing;
      }
    }
    const fresh = `inst_${randomUUID().replace(/-/g, '')}`;
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(INSTALL_ID_FILE, fresh, { mode: 0o600 });
    cachedInstallId = fresh;
    return fresh;
  } catch {
    // Ephemeral fallback — never let install-id IO break the server.
    if (!cachedInstallId) cachedInstallId = `inst_ephemeral_${randomUUID().replace(/-/g, '')}`;
    return cachedInstallId;
  }
}

/** Per-request client identity, resolved dual-era from the SDK. */
export interface ClientIdentity {
  clientName?: string;
  clientVersion?: string;
  protocolVersion?: string;
}

interface TelemetryEvent {
  event: string;
  install_id: string;
  server_version: string;
  os: string;
  arch: string;
  node_version: string;
  mcp_client_name?: string;
  mcp_client_version?: string;
  mcp_protocol_version?: string;
  tool_name?: string;
  status?: string;
  error_category?: string;
  ts: string;
}

/**
 * Fire-and-forget POST to the gateway. Never throws, never awaited by callers,
 * short timeout so a dead network can't leak a hanging socket.
 */
function send(event: TelemetryEvent): void {
  if (OPTED_OUT) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    // Product UA — the gateway 403s default library/runtime UAs.
    void fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': `macos-mcp/${event.server_version}`,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    })
      .catch(() => { /* swallow — telemetry is best-effort */ })
      .finally(() => clearTimeout(timer));
  } catch {
    /* fetch unavailable / any sync throw — ignore */
  }
}

let serverVersion = '0.0.0';
export function initTelemetry(version: string): void {
  serverVersion = version || '0.0.0';
}

function baseEvent(event: string, identity?: ClientIdentity): TelemetryEvent {
  return {
    event,
    install_id: getInstallId(),
    server_version: serverVersion,
    os: process.platform,
    arch: process.arch,
    node_version: process.versions.node,
    mcp_client_name: identity?.clientName,
    mcp_client_version: identity?.clientVersion,
    mcp_protocol_version: identity?.protocolVersion,
    ts: new Date().toISOString(),
  };
}

/** Fired once when the server process boots. */
export function trackServerStart(): void {
  send(baseEvent('server_started'));
}

/**
 * Fired on each tool call. Captures ONLY the tool NAME + status + client
 * identity — never the arguments or the result content (those touch the user's
 * private machine data).
 */
export function trackToolExecuted(
  toolName: string,
  status: 'success' | 'error',
  identity?: ClientIdentity,
  errorCategory?: string,
): void {
  const ev = baseEvent('tool_executed', identity);
  ev.tool_name = toolName;
  ev.status = status;
  if (errorCategory) ev.error_category = errorCategory;
  send(ev);
}

/** Fired once per connection when a client first lists tools (real handshake). */
export function trackToolsListed(identity?: ClientIdentity): void {
  send(baseEvent('tools_listed', identity));
}
