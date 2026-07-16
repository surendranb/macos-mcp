"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const util_1 = require("util");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function runAppleScript(script) {
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)('osascript', []);
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });
        proc.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            }
            else {
                reject(new Error(stderr.trim() || `Exit code ${code}`));
            }
        });
        proc.stdin.write(script);
        proc.stdin.end();
    });
}
async function main() {
    console.log('\n======================================================');
    console.log('       🚀 EXECUTING macOS COMPANION ACTIONS           ');
    console.log('======================================================\n');
    // 1. 5 Unread Emails
    console.log('📬 1. FETCHING 5 UNREAD EMAILS...');
    try {
        const emailOutput = await runAppleScript(`
      tell application "Mail"
        set output to ""
        try
          set inboxMessages to (every message of inbox whose read status is false)
          set mCount to count of inboxMessages
          if mCount > 5 then set mCount to 5
          repeat with i from 1 to mCount
            set aMsg to item i of inboxMessages
            set mSubject to subject of aMsg
            set mSender to sender of aMsg
            set mDate to date received of aMsg as string
            set output to output & mSender & "|" & mSubject & "|" & mDate & "\\n"
          end repeat
        on error e
          set output to "ERROR:" & e
        end try
        return output
      end tell
    `);
        if (emailOutput.startsWith('ERROR:')) {
            console.log(`   ⚠️ Mail app access error: ${emailOutput}`);
        }
        else {
            const emails = emailOutput.split('\n').filter(Boolean);
            if (emails.length === 0) {
                console.log('   (No unread emails found in Inbox)');
            }
            else {
                emails.forEach((email, idx) => {
                    const [sender, subject, date] = email.split('|');
                    console.log(`   [${idx + 1}] From: ${sender}`);
                    console.log(`       Subj: ${subject}`);
                    console.log(`       Date: ${date}`);
                });
            }
        }
    }
    catch (e) {
        console.log(`   ❌ Failed to fetch emails: ${e.message}`);
    }
    console.log();
    // 2. Schedule for yesterday (2026-07-15)
    console.log('📅 2. FETCHING SCHEDULE FOR YESTERDAY (2026-07-15)...');
    try {
        const { stdout: scheduleJson } = await execAsync('/opt/homebrew/bin/accli export --from 2026-07-15 --to 2026-07-15 --json');
        const schedule = JSON.parse(scheduleJson);
        if (schedule.length === 0) {
            console.log('   (No events found for yesterday)');
        }
        else {
            schedule.forEach((event, idx) => {
                console.log(`   [${idx + 1}] ${event.summary} (${event.start} - ${event.end})`);
            });
        }
    }
    catch (e) {
        console.log(`   ❌ Failed to fetch yesterday's schedule: ${e.message}`);
    }
    console.log();
    // 3. Add a reminder
    console.log('🔔 3. ADDING A REMINDER...');
    try {
        const rId = await runAppleScript(`
      tell application "Reminders"
        try
          set newReminder to make new reminder in default list with properties {name:"Verify macOS Companion MCP", notes:"Created via Antigravity Setup Assistant"}
          return id of newReminder
        on error e
          return "ERROR:" & e
        end try
      end tell
    `);
        if (rId.startsWith('ERROR:')) {
            console.log(`   ⚠️ Reminders app access error: ${rId}`);
        }
        else {
            console.log(`   ✓ Created reminder "Verify macOS Companion MCP" (ID: ${rId})`);
        }
    }
    catch (e) {
        console.log(`   ❌ Failed to create reminder: ${e.message}`);
    }
    console.log();
    // 4. Play a song
    console.log('🎵 4. PLAYING APPLE MUSIC...');
    try {
        await runAppleScript(`
      tell application "Music"
        try
          play
        end try
      end tell
    `);
        console.log('   ✓ Triggered play on Apple Music');
    }
    catch (e) {
        console.log(`   ❌ Failed to trigger Apple Music: ${e.message}`);
    }
    console.log();
    // 5. Increase the volume
    console.log('🔊 5. INCREASING VOLUME...');
    try {
        const newVol = await runAppleScript(`
      tell application "Music"
        try
          set curVol to sound volume
          set newVol to curVol + 10
          if newVol > 100 then set newVol to 100
          set sound volume to newVol
          return newVol as string
        on error e
          return "ERROR:" & e
        end try
      end tell
    `);
        if (newVol.startsWith('ERROR:')) {
            console.log(`   ⚠️ Volume adjustment error: ${newVol}`);
        }
        else {
            console.log(`   ✓ Increased Apple Music sound volume to ${newVol}%`);
        }
    }
    catch (e) {
        console.log(`   ❌ Failed to adjust volume: ${e.message}`);
    }
    console.log();
    // 6. List new podcast episodes
    console.log('🎙️ 6. LISTING NEW PODCAST EPISODES...');
    try {
        const dbPath = path.join(os.homedir(), 'Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Documents/MTLibrary.sqlite');
        const sql = `
      SELECT 
        datetime(e.ZPUBDATE + 978307200, 'unixepoch', 'localtime') as pub_date,
        p.ZTITLE as podcast_title,
        e.ZTITLE as episode_title
      FROM ZMTEPISODE e 
      JOIN ZMTPODCAST p ON e.ZPODCAST = p.Z_PK
      ORDER BY e.ZPUBDATE DESC LIMIT 5;
    `;
        const { stdout } = await execAsync(`sqlite3 "${dbPath}" "${sql}"`);
        const episodes = stdout.split('\n').filter(Boolean);
        if (episodes.length === 0) {
            console.log('   (No podcast episodes found)');
        }
        else {
            episodes.forEach((line) => {
                const [pubDate, podcast, title] = line.split('|');
                console.log(`   • [${pubDate}] ${podcast} - "${title}"`);
            });
        }
    }
    catch (e) {
        console.log(`   ❌ Failed to query Podcasts database: ${e.message}`);
    }
    console.log();
    // 7. Computer Health Check
    console.log('🖥️ 7. RUNNING COMPUTER HEALTH CHECK...');
    try {
        // Disk Space
        const { stdout: df } = await execAsync('df -h /');
        const dfLines = df.trim().split('\n');
        console.log('   📁 Storage status:');
        console.log(`      ${dfLines[0]}`);
        console.log(`      ${dfLines[1]}`);
        // Battery status
        const { stdout: bat } = await execAsync('pmset -g batt');
        console.log('   🔋 Power status:');
        console.log(`      ${bat.trim().split('\n').join('\n      ')}`);
        // CPU / Uptime
        const { stdout: up } = await execAsync('uptime');
        console.log(`   ⏱️ System uptime: ${up.trim()}`);
        // Thermal State
        const { stdout: therm } = await execAsync('sysctl -n kern.thermal_level');
        const thermalLevel = parseInt(therm.trim()) || 0;
        console.log(`   🌡️ CPU Thermal throttling: ${thermalLevel === 0 ? 'Normal (0)' : `Throttled (${thermalLevel})`}`);
        // Frozen processes
        try {
            const hung = await runAppleScript(`
        tell application "System Events"
          set output to ""
          repeat with p in every process
            if background only of p is false and responding of p is false then
              set output to output & name of p & "\\n"
            end if
          end repeat
          return output
        end tell
      `);
            const frozen = hung.split('\n').filter(Boolean);
            if (frozen.length === 0) {
                console.log('   ✓ Process health: No frozen apps detected.');
            }
            else {
                console.log(`   ⚠️ Frozen applications detected: ${frozen.join(', ')}`);
            }
        }
        catch (e) {
            console.log('   ✓ Process health: Unable to check (permission limit).');
        }
    }
    catch (e) {
        console.log(`   ❌ Health check diagnostic error: ${e.message}`);
    }
    console.log('\n======================================================');
    console.log('                   EXECUTION COMPLETE                 ');
    console.log('======================================================\n');
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
