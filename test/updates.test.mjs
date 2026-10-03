import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseVersion,
  isNewerVersion,
  checkServerUpdate,
  getUpgradeNudge,
  FLEET_CACHE_FILE,
  PACKAGE_NAME,
} from '../dist/updates.js';

test('parseVersion extracts numeric semver tuples', () => {
  assert.deepEqual(parseVersion('1.3.4'), [1, 3, 4]);
  assert.deepEqual(parseVersion('v2.0.1'), [2, 0, 1]);
  assert.deepEqual(parseVersion('invalid'), [0]);
});

test('isNewerVersion correctly compares versions', () => {
  assert.equal(isNewerVersion('1.3.4', '1.3.3'), true);
  assert.equal(isNewerVersion('2.0.0', '1.9.9'), true);
  assert.equal(isNewerVersion('1.4.0', '1.3.9'), true);
  assert.equal(isNewerVersion('1.3.3', '1.3.3'), false);
  assert.equal(isNewerVersion('1.3.2', '1.3.3'), false);
  assert.equal(isNewerVersion('1.3.0', '1.3.4'), false);
});

test('checkServerUpdate returns correct structure and directive when outdated', async () => {
  const result = await checkServerUpdate(PACKAGE_NAME, '1.0.0', false);
  assert.equal(result.server, PACKAGE_NAME);
  assert.equal(result.current_version, '1.0.0');
  assert.equal(result.update_available, true);
  assert.equal(result.upgrade_command, `npx -y ${PACKAGE_NAME}@latest`);
  assert.ok(result.message.includes("Inform the user to run 'npx -y @surendranb/macos-companion-mcp@latest' to update."));
  assert.ok(result.message.includes("Do NOT attempt to run this command yourself in this session."));
});

test('checkServerUpdate returns up to date when current version matches or exceeds latest', async () => {
  const result = await checkServerUpdate(PACKAGE_NAME, '99.0.0', true);
  assert.equal(result.server, PACKAGE_NAME);
  assert.equal(result.current_version, '99.0.0');
  assert.equal(result.update_available, false);
  assert.equal(result.upgrade_command, null);
  assert.equal(result.message, `${PACKAGE_NAME} is up to date (v99.0.0).`);
});

test('getUpgradeNudge returns directive when outdated and throttles after 1st nudge', () => {
  const testPkg = '@surendranb/macos-companion-mcp-test-dummy';
  let cache = {};
  if (fs.existsSync(FLEET_CACHE_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(FLEET_CACHE_FILE, 'utf8')); } catch {}
  }

  // Seed cache with a higher version and no nudge
  cache[testPkg] = {
    latest_version: '9.9.9',
    last_checked: Date.now() / 1000,
    last_nudged: 0,
  };
  fs.writeFileSync(FLEET_CACHE_FILE, JSON.stringify(cache, null, 2));

  // 1st call should return the nudge
  const nudge1 = getUpgradeNudge(testPkg, '1.0.0');
  assert.ok(nudge1.includes('[NOTICE: An updated version of'));
  assert.ok(nudge1.includes("Inform the user to run 'npx -y @surendranb/macos-companion-mcp-test-dummy@latest' to update."));
  assert.ok(nudge1.includes('Do NOT attempt to run this command yourself in this session.'));

  // 2nd call immediately should be throttled (empty string)
  const nudge2 = getUpgradeNudge(testPkg, '1.0.0');
  assert.equal(nudge2, '');

  // Cleanup test key
  delete cache[testPkg];
  fs.writeFileSync(FLEET_CACHE_FILE, JSON.stringify(cache, null, 2));
});
