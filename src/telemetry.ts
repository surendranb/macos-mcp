/**
 * Zero-PII Telemetry for macos-mcp (Schema v2 Compliant).
 *
 * PRIVACY GUARANTEE:
 * - NO user arguments, parameters, or intent strings.
 * - NO personal data (calendar details, mail, reminders, notes, clipboard, camera).
 * - NO file names or local filesystem paths.
 * - STRICTLY anonymous operational telemetry: install and server startup signals.
 *
 * OPT-OUT (checked before anything):
 * DISABLE_TELEMETRY / DO_NOT_TRACK / NO_TELEMETRY.
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SERVER_NAME = 'macos-mcp';
const GATEWAY_URLS = [
  process.env.MACOS_MCP_TELEMETRY_ENDPOINT || 'https://macos-mcp.builditwithai.xyz/e',
  'https://macos-mcp-telemetry.reachsuren.workers.dev/e',
];

const CONFIG_DIR = path.join(os.homedir(), '.macos_mcp');
const INSTALL_ID_FILE = path.join(CONFIG_DIR, 'install_id');
const SESSION_ID = `anon_${randomUUID()}`;

/** Formats local timezone offset into standard ISO format (+05:30, -08:00, +00:00). */
function getTimezoneOffset(): string {
  try {
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const absMin = Math.abs(offsetMin);
    const hours = String(Math.floor(absMin / 60)).padStart(2, '0');
    const mins = String(absMin % 60).padStart(2, '0');
    return `${sign}${hours}:${mins}`;
  } catch {
    return '+00:00';
  }
}

/** Any of these set to a truthy, non-"false"/"0" value disables telemetry. */
export function isOptedOut(): boolean {
  for (const name of ['DISABLE_TELEMETRY', 'DO_NOT_TRACK', 'NO_TELEMETRY']) {
    const v = process.env[name];
    if (v !== undefined && v !== '' && v !== '0' && v.toLowerCase() !== 'false') {
      return true;
    }
  }
  return false;
}

/** Retrieves or lazily creates the persistent anonymous install ID. */
export function getOrCreateInstallId(): string {
  try {
    if (fs.existsSync(INSTALL_ID_FILE)) {
      const existing = fs.readFileSync(INSTALL_ID_FILE, 'utf8').trim();
      if (existing) return existing;
    }
  } catch {
    // fallback to generating session-level anon id if filesystem is read-only
  }

  const newId = `inst_${randomUUID().replace(/-/g, '')}`;
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(INSTALL_ID_FILE, newId, { mode: 0o600 });
  } catch {
    // ignore filesystem write errors
  }
  return newId;
}

/** Builds the canonical Schema v2 envelope properties. */
function buildEnvelopeProperties(version: string, extraProps: Record<string, any> = {}): Record<string, any> {
  return {
    schema_version: 2,
    mcp_server_name: SERVER_NAME,
    mcp_server_version: version,
    $os: os.type(),
    node_version: process.versions.node,
    cpu_arch: os.arch(),
    timezone_offset: getTimezoneOffset(),
    session_id: SESSION_ID,
    has_ever_worked: true,
    $process_person_profile: false,
    ...extraProps,
  };
}

/** Dispatches event with dual gateway failover in background. */
async function sendEvent(eventName: string, distinctId: string, properties: Record<string, any>): Promise<void> {
  if (isOptedOut()) return;

  const payload = JSON.stringify({
    event: eventName,
    distinct_id: distinctId,
    properties,
  });

  for (const gatewayUrl of GATEWAY_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);

      const resp = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': `macos-mcp/${properties.mcp_server_version || '0.0.0'}`,
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (resp.ok) {
        break; // Successfully recorded by gateway
      }
    } catch {
      // Failover to secondary gateway URL
    }
  }
}

/**
 * Fired once when a fresh install is detected.
 */
export function trackFirstInstall(version: string): void {
  if (isOptedOut()) return;
  try {
    const isFirstRun = !fs.existsSync(INSTALL_ID_FILE) || !fs.readFileSync(INSTALL_ID_FILE, 'utf8').trim();
    const installId = getOrCreateInstallId();
    if (!isFirstRun) return;

    const props = buildEnvelopeProperties(version, {
      install_id: installId,
      install_date: new Date().toISOString(),
    });

    void sendEvent('server_first_install', installId, props);
  } catch {
    // Never crash the server
  }
}

/**
 * Fired on server startup / initialize handshake.
 */
export function trackMcpStarted(version: string, clientInfo?: { name?: string; version?: string }): void {
  if (isOptedOut()) return;
  try {
    const installId = getOrCreateInstallId();
    const props = buildEnvelopeProperties(version, {
      mcp_client_name: clientInfo?.name || 'unknown',
      mcp_client_version: clientInfo?.version || 'unknown',
    });

    void sendEvent('mcp_started', installId, props);
  } catch {
    // Never crash the server
  }
}

