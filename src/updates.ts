import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const PACKAGE_NAME = '@surendranb/macos-companion-mcp';
export const FLEET_CACHE_FILE = path.join(os.homedir(), '.cache', 'mcp_fleet_updates.json');
export const UPDATE_CHECK_TTL = 86400; // 24 hours in seconds
export const NUDGE_THROTTLE_INTERVAL = 7 * 86400; // 7 days in seconds

export interface CacheEntry {
  latest_version?: string;
  last_checked?: number;
  last_nudged?: number;
}

export type FleetCache = Record<string, CacheEntry>;

export interface UpdateCheckResult {
  server: string;
  current_version: string;
  latest_version: string;
  update_available: boolean;
  upgrade_command: string | null;
  message: string;
}

export function parseVersion(v: string): number[] {
  try {
    const clean = v.replace(/[^\d.]/g, '');
    const parts = clean.split('.').filter(p => p.length > 0).map(p => parseInt(p, 10));
    return parts.length > 0 ? parts : [0];
  } catch {
    return [0];
  }
}

export function isNewerVersion(latest: string, current: string): boolean {
  const v1 = parseVersion(latest);
  const v2 = parseVersion(current);
  const maxLen = Math.max(v1.length, v2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = v1[i] ?? 0;
    const num2 = v2[i] ?? 0;
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  return false;
}

export function readCache(): FleetCache {
  try {
    if (fs.existsSync(FLEET_CACHE_FILE)) {
      const content = fs.readFileSync(FLEET_CACHE_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore read or parse errors
  }
  return {};
}

export function writeCache(cache: FleetCache): void {
  try {
    const dir = path.dirname(FLEET_CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${FLEET_CACHE_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tmp, FLEET_CACHE_FILE);
  } catch {
    // Ignore cache persistence errors
  }
}

export async function fetchLatestVersion(
  packageName: string = PACKAGE_NAME,
  currentVersion: string = '0.0.0'
): Promise<string | null> {
  try {
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    const res = await fetch(url, {
      headers: {
        'user-agent': `${packageName}/${currentVersion}`,
        'accept': 'application/json',
      },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data?.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

export async function checkServerUpdate(
  packageName: string = PACKAGE_NAME,
  currentVersion: string = '0.0.0',
  forceCheck: boolean = false
): Promise<UpdateCheckResult> {
  const now = Date.now() / 1000;
  const cache = readCache();
  const entry = cache[packageName] || {};
  const lastCheck = entry.last_checked || 0;
  let latestVersion = entry.latest_version || currentVersion;

  if (forceCheck || (now - lastCheck > UPDATE_CHECK_TTL)) {
    const fetched = await fetchLatestVersion(packageName, currentVersion);
    if (fetched) {
      latestVersion = fetched;
      entry.latest_version = latestVersion;
      entry.last_checked = now;
      cache[packageName] = entry;
      writeCache(cache);
    }
  }

  const hasUpdate = isNewerVersion(latestVersion, currentVersion);
  const cmd = `npx -y ${packageName}@latest`;
  const message = hasUpdate
    ? `An updated version of ${packageName} is available (v${latestVersion}, current: v${currentVersion}). Inform the user to run '${cmd}' to update. Do NOT attempt to run this command yourself in this session.`
    : `${packageName} is up to date (v${currentVersion}).`;

  return {
    server: packageName,
    current_version: currentVersion,
    latest_version: latestVersion,
    update_available: hasUpdate,
    upgrade_command: hasUpdate ? cmd : null,
    message,
  };
}

export function getUpgradeNudge(
  packageName: string = PACKAGE_NAME,
  currentVersion: string = '0.0.0'
): string {
  try {
    const now = Date.now() / 1000;
    const cache = readCache();
    const entry = cache[packageName] || {};
    const lastCheck = entry.last_checked || 0;
    const latestVersion = entry.latest_version || currentVersion;
    const lastNudged = entry.last_nudged || 0;

    // Trigger non-blocking background fetch if TTL expired
    if (now - lastCheck > UPDATE_CHECK_TTL) {
      void fetchLatestVersion(packageName, currentVersion)
        .then((fetched) => {
          if (fetched) {
            const currentCache = readCache();
            const curEntry = currentCache[packageName] || {};
            curEntry.latest_version = fetched;
            curEntry.last_checked = Date.now() / 1000;
            currentCache[packageName] = curEntry;
            writeCache(currentCache);
          }
        })
        .catch(() => {});
    }

    if (isNewerVersion(latestVersion, currentVersion)) {
      if (now - lastNudged > NUDGE_THROTTLE_INTERVAL) {
        entry.last_nudged = now;
        entry.latest_version = latestVersion;
        entry.last_checked = lastCheck;
        cache[packageName] = entry;
        writeCache(cache);

        const cmd = `npx -y ${packageName}@latest`;
        return `\n\n[NOTICE: An updated version of ${packageName} is available (v${latestVersion}, current: v${currentVersion}). Inform the user to run '${cmd}' to update. Do NOT attempt to run this command yourself in this session.]`;
      }
    }
  } catch {
    // Non-blocking, never fail tool execution
  }
  return '';
}
