import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
const execAsync = promisify(exec);
// Helper to run AppleScript by feeding it to osascript's stdin
function runAppleScript(script) {
    return new Promise((resolve, reject) => {
        const proc = spawn('osascript', []);
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
// Initialize MCP Server
const server = new Server({
    name: 'macos-companion-mcp',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// Define available tools
const TOOLS = [
    // Calendar & Reminders
    {
        name: 'list_calendars',
        description: 'Lists all available calendar names in the Apple Calendar app',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_calendar_events',
        description: 'Fetches calendar events for a given time range (using accli)',
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', description: 'Start date in YYYY-MM-DD or YYYY-MM-DDTHH:mm format' },
                to: { type: 'string', description: 'End date in YYYY-MM-DD or YYYY-MM-DDTHH:mm format' },
            },
            required: ['from', 'to'],
        },
    },
    {
        name: 'create_calendar_event',
        description: 'Creates a new event in Apple Calendar (using accli)',
        inputSchema: {
            type: 'object',
            properties: {
                calendar: { type: 'string', description: 'Calendar name (e.g. Work)' },
                summary: { type: 'string', description: 'Title of the event' },
                start: { type: 'string', description: 'Start time (e.g., YYYY-MM-DDTHH:mm)' },
                end: { type: 'string', description: 'End time (e.g., YYYY-MM-DDTHH:mm)' },
                description: { type: 'string', description: 'Event description' },
                location: { type: 'string', description: 'Event location' },
            },
            required: ['calendar', 'summary', 'start', 'end'],
        },
    },
    {
        name: 'get_reminders',
        description: 'Fetches active reminders from Apple Reminders',
        inputSchema: {
            type: 'object',
            properties: {
                list: { type: 'string', description: 'Optional list name to filter reminders' },
            },
        },
    },
    {
        name: 'create_reminder',
        description: 'Creates a new reminder in Apple Reminders',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Title of the reminder' },
                notes: { type: 'string', description: 'Optional detailed notes' },
                due: { type: 'string', description: 'Optional due date/time (e.g. YYYY-MM-DD HH:mm)' },
                list: { type: 'string', description: 'Optional list name (defaults to default reminders list)' },
            },
            required: ['title'],
        },
    },
    {
        name: 'complete_reminder',
        description: 'Marks a reminder as completed',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Reminder unique ID' },
            },
            required: ['id'],
        },
    },
    // Notes
    {
        name: 'list_notes',
        description: 'Lists titles, IDs, and folders of notes in Apple Notes',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_note',
        description: 'Retrieves the body text of a note by title or ID',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Note ID' },
            },
            required: ['id'],
        },
    },
    {
        name: 'create_note',
        description: 'Creates a new note in Apple Notes',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Title of the new note' },
                body: { type: 'string', description: 'HTML or plain text body of the note' },
                folder: { type: 'string', description: 'Optional folder name' },
            },
            required: ['title', 'body'],
        },
    },
    {
        name: 'update_note',
        description: 'Appends content to an existing note in Apple Notes',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Note ID' },
                content: { type: 'string', description: 'Text to append' },
            },
            required: ['id', 'content'],
        },
    },
    // Apple Music
    {
        name: 'get_music_state',
        description: 'Returns the current playback state and active track metadata in Apple Music',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'play_playlist',
        description: 'Plays a specific Apple Music playlist by name',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Playlist name' },
            },
            required: ['name'],
        },
    },
    {
        name: 'play_pause_music',
        description: 'Toggles playback state of Apple Music',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'skip_music_track',
        description: 'Skips to the next or previous track in Apple Music',
        inputSchema: {
            type: 'object',
            properties: {
                direction: { type: 'string', enum: ['next', 'previous'], description: 'Skip direction' },
            },
            required: ['direction'],
        },
    },
    {
        name: 'set_music_volume',
        description: 'Sets Apple Music volume (0 to 100)',
        inputSchema: {
            type: 'object',
            properties: {
                volume: { type: 'number', minimum: 0, maximum: 100, description: 'Volume level' },
            },
            required: ['volume'],
        },
    },
    // Mail & Messages
    {
        name: 'send_email',
        description: 'Composes and sends an email via Apple Mail',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Recipient email address' },
                subject: { type: 'string', description: 'Email subject line' },
                body: { type: 'string', description: 'Body text' },
            },
            required: ['to', 'subject', 'body'],
        },
    },
    {
        name: 'get_unread_emails',
        description: 'Fetches recent unread email details from Apple Mail',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'send_imessage',
        description: 'Sends an iMessage/SMS via Messages app',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Phone number or email address of the buddy' },
                message: { type: 'string', description: 'Text message content' },
            },
            required: ['to', 'message'],
        },
    },
    // Browser & Shortcuts
    {
        name: 'open_url',
        description: 'Opens a URL in the default browser',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to open' },
            },
            required: ['url'],
        },
    },
    {
        name: 'get_safari_tabs',
        description: 'Lists all open tab URLs and titles in Safari',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_shortcuts',
        description: 'Lists all Siri/Apple Shortcuts configured on the system',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'run_shortcut',
        description: 'Runs an Apple/Siri Shortcut by name',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name of the shortcut' },
                input: { type: 'string', description: 'Optional text input' },
            },
            required: ['name'],
        },
    },
    // System Diagnostics & Maintenance
    {
        name: 'get_disk_usage',
        description: 'Returns local disk usage statistics',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_storage_scan',
        description: 'Deep storage scan: home directory sizes, caches, and local snapshots',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_battery_health',
        description: 'Detailed battery status: cycle count, max capacity, condition',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_startup_items',
        description: 'Lists macOS login items and LaunchAgents',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'run_health_audit',
        description: 'Comprehensive health audit: compute, memory, storage, battery, SSD wear, startup items',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'run_disk_cleanup',
        description: 'Safely prunes cache folders and empties trash to free up space',
        inputSchema: {
            type: 'object',
            properties: {
                targets: {
                    type: 'array',
                    items: { type: 'string', enum: ['derived_data', 'trash', 'user_caches', 'package_caches'] },
                    description: 'Pruning targets',
                },
            },
            required: ['targets'],
        },
    },
    {
        name: 'get_system_stats',
        description: 'Gets current CPU load, memory pressure, battery metrics, thermal level, and hung processes',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_process_list',
        description: 'Lists active running processes with resource usage',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'kill_process',
        description: 'Kills a process by PID or name',
        inputSchema: {
            type: 'object',
            properties: {
                pid: { type: 'number', description: 'Process ID to kill' },
                name: { type: 'string', description: 'Process name to kill (if PID not known)' },
            },
        },
    },
    {
        name: 'restart_service',
        description: 'Restarts a macOS launchd service using launchctl',
        inputSchema: {
            type: 'object',
            properties: {
                service: { type: 'string', description: 'Service name (e.g. com.cloudflare.cloudflared)' },
            },
            required: ['service'],
        },
    },
    // Podcasts
    {
        name: 'get_recent_podcast_episodes',
        description: 'Gets recent podcast episodes, release dates, and listening progress from MTLibrary.sqlite',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', default: 10, description: 'Max episodes to return' },
                inProgressOnly: { type: 'boolean', default: false, description: 'Only return partially listened episodes' },
            },
        },
    },
    // 📷 Ambient Sensing
    {
        name: 'capture_camera_snapshot',
        description: 'Takes a photo using the built-in camera via imagesnap. Returns JPEG as base64 data URL. Use: ambient light sensing, health PPG read, presence detection.',
        inputSchema: {
            type: 'object',
            properties: {
                delay: { type: 'number', default: 1, description: 'Warmup delay in seconds before capture (default 1)' },
                quality: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium', description: 'JPEG quality' },
            },
        },
    },
    {
        name: 'get_ambient_noise',
        description: 'Records a short audio sample via microphone and measures ambient noise level in decibels. Returns average dB, peak dB, and classification (quiet/moderate/loud).',
        inputSchema: {
            type: 'object',
            properties: {
                duration: { type: 'number', default: 3, description: 'Recording duration in seconds (default 3, max 10)' },
            },
        },
    },
    {
        name: 'capture_audio',
        description: 'Records an audio clip via microphone and saves to a temp WAV file. Returns file path, duration, and sample rate.',
        inputSchema: {
            type: 'object',
            properties: {
                duration: { type: 'number', default: 5, description: 'Recording duration in seconds (default 5, max 30)' },
            },
        },
    },
];
// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
});
// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            // 📅 Calendar & Reminders
            case 'list_calendars': {
                const stdout = await runAppleScript(`
          tell application "Calendar" to launch
          tell application "Calendar"
            set output to ""
            repeat with c in every calendar
              set output to output & name of c & "\\n"
            end repeat
            return output
          end tell
        `);
                return {
                    content: [{ type: 'text', text: stdout.split('\n').filter(Boolean).join('\n') }],
                };
            }
            case 'get_calendar_events': {
                const { from, to } = args;
                // accli must be installed
                const { stdout } = await execAsync(`/opt/homebrew/bin/accli export --from ${from} --to ${to} --json`);
                return {
                    content: [{ type: 'text', text: stdout }],
                };
            }
            case 'create_calendar_event': {
                const { calendar, summary, start, end, description, location } = args;
                let cmd = `/opt/homebrew/bin/accli create "${calendar}" --summary "${summary}" --start "${start}" --end "${end}"`;
                if (description)
                    cmd += ` --description "${description}"`;
                if (location)
                    cmd += ` --location "${location}"`;
                const { stdout } = await execAsync(cmd);
                return {
                    content: [{ type: 'text', text: stdout }],
                };
            }
            case 'get_reminders': {
                const filterList = args?.list;
                let script = `
          tell application "Reminders"
            set output to ""
            set allLists to every list
            repeat with aList in allLists
              set listName to name of aList
        `;
                if (filterList) {
                    script += `if listName is "${filterList}" then`;
                }
                script += `
              set allReminders to (every reminder of aList whose completed is false)
              repeat with aReminder in allReminders
                set rName to name of aReminder
                set rId to id of aReminder
                set rDue to ""
                try
                  if due date of aReminder is not missing value then
                    set rDue to due date of aReminder as string
                  end if
                end try
                set output to output & listName & "|" & rName & "|" & rId & "|" & rDue & "\\n"
              end repeat
        `;
                if (filterList) {
                    script += `end if`;
                }
                script += `
            end repeat
            return output
          end tell
        `;
                const stdout = await runAppleScript(script);
                const reminders = stdout.split('\n').filter(Boolean).map(line => {
                    const [list, title, id, due] = line.split('|');
                    return { list, title, id, due: due || null };
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(reminders, null, 2) }],
                };
            }
            case 'create_reminder': {
                const { title, notes, due, list } = args;
                let script = `
          tell application "Reminders"
            set targetList to default list
        `;
                if (list) {
                    script += `
            try
              set targetList to list "${list}"
            on error
              set targetList to make new list with properties {name:"${list}"}
            end try
          `;
                }
                // Use 'body' for notes — that's the correct AppleScript property in Reminders
                const props = [`name:"${title}"`];
                if (notes)
                    props.push(`body:"${notes}"`);
                script += `
            set newReminder to make new reminder in targetList with properties {${props.join(', ')}}
        `;
                if (due) {
                    script += `set due date of newReminder to date "${due}"\n`;
                }
                script += `
            return id of newReminder
          end tell
        `;
                const rId = await runAppleScript(script);
                return {
                    content: [{ type: 'text', text: `Created reminder ID: ${rId}` }],
                };
            }
            case 'complete_reminder': {
                const { id } = args;
                await runAppleScript(`
          tell application "Reminders"
            set aReminder to reminder id "${id}"
            set completed of aReminder to true
            return "done"
          end tell
        `);
                return {
                    content: [{ type: 'text', text: `Completed reminder ${id}` }],
                };
            }
            // 📝 Notes
            case 'list_notes': {
                const stdout = await runAppleScript(`
          tell application "Notes"
            set output to ""
            repeat with aNote in every note
              set folderName to ""
              try
                set folderName to name of folder of aNote
              end try
              set output to output & name of aNote & "|" & id of aNote & "|" & folderName & "\\n"
            end repeat
            return output
          end tell
        `);
                const notes = stdout.split('\n').filter(Boolean).map(line => {
                    const [title, id, folder] = line.split('|');
                    return { title, id, folder };
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }],
                };
            }
            case 'get_note': {
                const { id } = args;
                const body = await runAppleScript(`
          tell application "Notes"
            return body of note id "${id}"
          end tell
        `);
                return {
                    content: [{ type: 'text', text: body }],
                };
            }
            case 'create_note': {
                const { title, body, folder } = args;
                let script = `
          tell application "Notes"
        `;
                if (folder) {
                    script += `
            set targetFolder to folder "${folder}"
            make new note in targetFolder with properties {name:"${title}", body:"${body}"}
          `;
                }
                else {
                    script += `
            make new note with properties {name:"${title}", body:"${body}"}
          `;
                }
                script += `
            return "done"
          end tell
        `;
                await runAppleScript(script);
                return {
                    content: [{ type: 'text', text: `Created note: "${title}"` }],
                };
            }
            case 'update_note': {
                const { id, content } = args;
                await runAppleScript(`
          tell application "Notes"
            set aNote to note id "${id}"
            set body of aNote to (body of aNote) & "<p>${content}</p>"
            return "done"
          end tell
        `);
                return {
                    content: [{ type: 'text', text: `Updated note ${id}` }],
                };
            }
            // 🎵 Apple Music
            case 'get_music_state': {
                const res = await runAppleScript(`
          tell application "Music"
            if it is running then
              set pState to player state as string
              set vol to sound volume as string
              if player state is not stopped then
                set tName to name of current track
                set tArtist to artist of current track
                set tAlbum to album of current track
                set tDuration to duration of current track as string
                set tPosition to player position as string
                return pState & "|" & vol & "|" & tName & "|" & tArtist & "|" & tAlbum & "|" & tDuration & "|" & tPosition
              else
                return pState & "|" & vol & "|||||"
              end if
            else
              return "not running|0|||||"
            end if
          end tell
        `);
                const [state, volume, track, artist, album, duration, position] = res.split('|');
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                running: state !== 'not running',
                                state,
                                volume: parseInt(volume) || 0,
                                track: track || null,
                                artist: artist || null,
                                album: album || null,
                                duration: parseFloat(duration) || null,
                                position: parseFloat(position) || null,
                            }, null, 2),
                        },
                    ],
                };
            }
            case 'play_playlist': {
                const { name: pName } = args;
                await runAppleScript(`
          tell application "Music"
            play playlist "${pName}"
          end tell
        `);
                return {
                    content: [{ type: 'text', text: `Playing playlist: ${pName}` }],
                };
            }
            case 'play_pause_music': {
                await runAppleScript(`
          tell application "Music"
            playpause
          end tell
        `);
                return {
                    content: [{ type: 'text', text: 'Toggled Music playback' }],
                };
            }
            case 'skip_music_track': {
                const { direction } = args;
                await runAppleScript(`
          tell application "Music"
            ${direction === 'next' ? 'next track' : 'previous track'}
          end tell
        `);
                return {
                    content: [{ type: 'text', text: `Skipped track (${direction})` }],
                };
            }
            case 'set_music_volume': {
                const { volume } = args;
                await runAppleScript(`
          tell application "Music"
            set sound volume to ${volume}
          end tell
        `);
                return {
                    content: [{ type: 'text', text: `Set Apple Music volume to ${volume}` }],
                };
            }
            // ✉️ Mail & Messages
            case 'send_email': {
                const { to, subject, body } = args;
                await runAppleScript(`
          tell application "Mail"
            set newMsg to make new outgoing message with properties {subject:"${subject}", content:"${body}"}
            tell newMsg
              make new to recipient with properties {address:"${to}"}
            end tell
            send newMsg
          end tell
        `);
                return {
                    content: [{ type: 'text', text: `Sent email to ${to}` }],
                };
            }
            case 'get_unread_emails': {
                // Activate Mail first — querying a closed Mail.app causes AppleEvent timeout
                const stdout = await runAppleScript(`
          tell application "Mail"
            activate
            delay 2
            set output to ""
            set inboxMessages to (every message of inbox whose read status is false)
            set mCount to count of inboxMessages
            if mCount > 10 then set mCount to 10
            repeat with i from 1 to mCount
              set aMsg to item i of inboxMessages
              set mSubject to subject of aMsg
              set mSender to sender of aMsg
              set mDate to date received of aMsg as string
              set output to output & mSender & "|" & mSubject & "|" & mDate & "\\n"
            end repeat
            return output
          end tell
        `);
                const emails = stdout.split('\n').filter(Boolean).map(line => {
                    const [sender, subject, date] = line.split('|');
                    return { sender, subject, date };
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(emails, null, 2) }],
                };
            }
            case 'send_imessage': {
                const { to, message } = args;
                await runAppleScript(`
          tell application "Messages"
            send "${message}" to buddy "${to}" of service type iMessage
          end tell
        `);
                return {
                    content: [{ type: 'text', text: `Sent message to "${to}"` }],
                };
            }
            // 🌐 Browser & Shortcuts
            case 'open_url': {
                const { url } = args;
                await execAsync(`open "${url}"`);
                return {
                    content: [{ type: 'text', text: `Opened URL: ${url}` }],
                };
            }
            case 'get_safari_tabs': {
                const stdout = await runAppleScript(`
          tell application "Safari"
            set output to ""
            set winCount to count of windows
            repeat with i from 1 to winCount
              set tCount to count of tabs of window i
              repeat with j from 1 to tCount
                set tTab to tab j of window i
                set tName to name of tTab
                set tURL to URL of tTab
                set output to output & tName & "|" & tURL & "\\n"
              end repeat
            end repeat
            return output
          end tell
        `);
                const tabs = stdout.split('\n').filter(Boolean).map(line => {
                    const [title, url] = line.split('|');
                    return { title, url };
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(tabs, null, 2) }],
                };
            }
            case 'list_shortcuts': {
                const { stdout } = await execAsync('/usr/bin/shortcuts list');
                const list = stdout.split('\n').filter(Boolean);
                return {
                    content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
                };
            }
            case 'run_shortcut': {
                const { name: sName, input } = args;
                let cmd = `/usr/bin/shortcuts run "${sName}"`;
                if (input) {
                    cmd = `echo "${input}" | ${cmd}`;
                }
                const { stdout } = await execAsync(cmd);
                return {
                    content: [{ type: 'text', text: stdout.trim() || `Executed shortcut: ${sName}` }],
                };
            }
            // 💾 System Diagnostics & Maintenance
            case 'get_disk_usage': {
                const { stdout } = await execAsync('df -h /');
                return {
                    content: [{ type: 'text', text: stdout }],
                };
            }
            case 'get_storage_scan': {
                const stats = {};
                try {
                    const { stdout: df } = await execAsync('df -h /System/Volumes/Data');
                    stats.disk_usage = df.trim();
                }
                catch (e) { }
                try {
                    const { stdout: du } = await execAsync(`du -xh -d 2 "$HOME" | sort -rh | head -15`);
                    stats.home_folders = du.trim();
                }
                catch (e) { }
                try {
                    const { stdout: caches } = await execAsync(`du -xsh "$HOME/Library/Caches"`);
                    stats.user_caches = caches.trim();
                }
                catch (e) { }
                try {
                    const { stdout: tm } = await execAsync('tmutil listlocalsnapshots /');
                    stats.local_snapshots = tm.trim();
                }
                catch (e) { }
                try {
                    const { stdout: purgeable } = await execAsync(`diskutil info /System/Volumes/Data | grep -iE 'Container Free Space|Purgeable'`);
                    stats.container_info = purgeable.trim();
                }
                catch (e) { }
                return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
            }
            case 'get_battery_health': {
                try {
                    const { stdout: bat } = await execAsync(`system_profiler SPPowerDataType | grep -iE 'Cycle Count|Maximum Capacity|Condition|State of Charge|Fully Charged'`);
                    return { content: [{ type: 'text', text: bat.trim() || '(no battery - desktop Mac)' }] };
                }
                catch (e) {
                    return { content: [{ type: 'text', text: 'Error getting battery health' }] };
                }
            }
            case 'get_startup_items': {
                const stats = {};
                try {
                    const { stdout: la } = await execAsync(`ls -1 "$HOME/Library/LaunchAgents" 2>/dev/null || echo ""`);
                    stats.launch_agents = la.trim().split('\\n').filter(Boolean);
                }
                catch (e) { }
                try {
                    const stdout = await runAppleScript(`tell application "System Events" to get the name of every login item`);
                    stats.login_items = stdout.split(',').map(s => s.trim());
                }
                catch (e) { }
                return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
            }
            case 'run_health_audit': {
                const audit = {};
                // Machine Info
                try {
                    const { stdout: sw } = await execAsync('sw_vers');
                    const { stdout: hw } = await execAsync(`system_profiler SPHardwareDataType | grep -E 'Model Name|Chip|Processor Name|Total Number of Cores|Memory:'`);
                    const { stdout: up } = await execAsync('uptime');
                    audit.machine = { sw_vers: sw.trim(), hardware: hw.trim(), uptime: up.trim() };
                }
                catch (e) { }
                // Memory Pressure
                try {
                    const { stdout: mem } = await execAsync(`memory_pressure -Q | grep -iE 'free percentage|pressure' | tail -3`);
                    const { stdout: swap } = await execAsync(`sysctl vm.swapusage`);
                    const { stdout: topMem } = await execAsync(`top -l 1 -o mem -n 8 -stats command,mem | tail -9`);
                    audit.memory = { pressure: mem.trim(), swap: swap.trim(), top_consumers: topMem.trim() };
                }
                catch (e) { }
                // Storage
                try {
                    const { stdout: df } = await execAsync('df -h /System/Volumes/Data | awk "NR==1 || NR==2"');
                    const { stdout: du } = await execAsync(`du -xh -d 2 "$HOME" | sort -rh | head -15`);
                    audit.storage = { df: df.trim(), home_folders: du.trim() };
                }
                catch (e) { }
                // Compute / Thermals
                try {
                    const { stdout: therm } = await execAsync(`pmset -g therm | grep -iE 'thermal|CPU_Speed_Limit' || echo "no thermal pressure recorded"`);
                    const { stdout: topCpu } = await execAsync(`top -l 1 -o cpu -n 6 -stats command,cpu | tail -7`);
                    audit.compute = { thermals: therm.trim(), top_consumers: topCpu.trim() };
                }
                catch (e) { }
                // Battery
                try {
                    const { stdout: bat } = await execAsync(`system_profiler SPPowerDataType | grep -iE 'Cycle Count|Maximum Capacity|Condition|State of Charge|Fully Charged' || echo "(no battery)"`);
                    audit.battery = bat.trim();
                }
                catch (e) { }
                // SSD Wear
                try {
                    const { stdout: smart } = await execAsync(`smartctl -a /dev/disk0 | grep -iE 'SMART overall|Percentage Used|Available Spare|Data Units Written|Temperature:|Power On Hours' || echo "SMART read incomplete"`);
                    audit.ssd_wear = smart.trim();
                }
                catch (e) {
                    audit.ssd_wear = "smartctl not installed. Optional wear check: brew install smartmontools";
                }
                // Startup Load
                try {
                    const { stdout: la } = await execAsync(`ls -1 "$HOME/Library/LaunchAgents" 2>/dev/null || echo "(none)"`);
                    let loginItems = '';
                    try {
                        loginItems = await runAppleScript(`tell application "System Events" to get the name of every login item`);
                    }
                    catch (err) { }
                    audit.startup_load = { launch_agents: la.trim(), login_items: loginItems.trim() || '(unavailable)' };
                }
                catch (e) { }
                return { content: [{ type: 'text', text: JSON.stringify(audit, null, 2) }] };
            }
            case 'run_disk_cleanup': {
                const { targets } = args;
                const results = [];
                for (const target of targets) {
                    switch (target) {
                        case 'derived_data': {
                            const ddPath = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData');
                            try {
                                await execAsync(`rm -rf "${ddPath}"/*`);
                                results.push(`Pruned Xcode DerivedData: ${ddPath}`);
                            }
                            catch (e) {
                                results.push(`Skipped DerivedData (not found or permission denied)`);
                            }
                            break;
                        }
                        case 'trash': {
                            const trashPath = path.join(os.homedir(), '.Trash');
                            try {
                                await execAsync(`rm -rf "${trashPath}"/*`);
                                results.push(`Emptied Trash: ${trashPath}`);
                            }
                            catch (e) {
                                results.push(`Failed to empty trash: ${e.message}`);
                            }
                            break;
                        }
                        case 'user_caches': {
                            const cachePath = path.join(os.homedir(), 'Library/Caches');
                            try {
                                await execAsync(`rm -rf "${cachePath}"/*`);
                                results.push(`Cleared user caches: ${cachePath}`);
                            }
                            catch (e) {
                                results.push(`Cleared user caches partially: ${e.message}`);
                            }
                            break;
                        }
                        case 'package_caches': {
                            try {
                                await execAsync('npm cache clean --force');
                                results.push('Cleared npm cache');
                            }
                            catch (e) { }
                            break;
                        }
                    }
                }
                return {
                    content: [{ type: 'text', text: results.join('\n') }],
                };
            }
            case 'get_system_stats': {
                const stats = {};
                // CPU / Uptime
                try {
                    const { stdout: up } = await execAsync('uptime');
                    stats.uptime = up.trim();
                }
                catch (e) { }
                // Memory Pressure
                try {
                    const { stdout: vm } = await execAsync('vm_stat');
                    stats.memory_pressure = vm.trim();
                }
                catch (e) { }
                // Battery
                try {
                    const { stdout: bat } = await execAsync('pmset -g batt');
                    stats.battery = bat.trim();
                }
                catch (e) { }
                // Thermal State
                try {
                    const { stdout: therm } = await execAsync('sysctl -n kern.thermal_level');
                    stats.thermal_level = parseInt(therm.trim()) || 0; // 0 = Normal, higher means throttled
                }
                catch (e) { }
                // Hung processes
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
                    stats.frozen_processes = hung.split('\n').filter(Boolean);
                }
                catch (e) {
                    stats.frozen_processes = [];
                }
                return {
                    content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
                };
            }
            case 'get_process_list': {
                const { stdout } = await execAsync('ps -A -o pid,%cpu,%mem,comm | sort -nr -k 2 | head -n 15');
                return {
                    content: [{ type: 'text', text: stdout }],
                };
            }
            case 'kill_process': {
                const { pid, name: pName } = args;
                if (pid) {
                    await execAsync(`kill -9 ${pid}`);
                    return { content: [{ type: 'text', text: `Killed PID ${pid}` }] };
                }
                else if (pName) {
                    await execAsync(`pkill -9 -f "${pName}"`);
                    return { content: [{ type: 'text', text: `Killed process matching "${pName}"` }] };
                }
                throw new McpError(ErrorCode.InvalidParams, 'Must provide either pid or name');
            }
            case 'restart_service': {
                const { service } = args;
                await execAsync(`launchctl kickstart -k "gui/${process.getuid()}/${service}"`);
                return {
                    content: [{ type: 'text', text: `Restarted launchd service: ${service}` }],
                };
            }
            // 🎙️ Podcasts
            case 'get_recent_podcast_episodes': {
                const { limit = 10, inProgressOnly = false } = args;
                const dbPath = path.join(os.homedir(), 'Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Documents/MTLibrary.sqlite');
                let sql = `
          SELECT 
            datetime(e.ZPUBDATE + 978307200, 'unixepoch', 'localtime') as pub_date,
            p.ZTITLE as podcast_title,
            e.ZTITLE as episode_title,
            e.ZPLAYHEAD as playhead,
            e.ZDURATION as duration,
            e.ZPLAYSTATE as play_state
          FROM ZMTEPISODE e 
          JOIN ZMTPODCAST p ON e.ZPODCAST = p.Z_PK
        `;
                if (inProgressOnly) {
                    sql += ' WHERE e.ZPLAYSTATE = 1 ';
                }
                sql += ` ORDER BY e.ZPUBDATE DESC LIMIT ${limit}; `;
                const { stdout } = await execAsync(`sqlite3 "${dbPath}" "${sql}"`);
                const episodes = stdout.split('\n').filter(Boolean).map((line) => {
                    const [pubDate, podcast, title, playhead, duration, playState] = line.split('|');
                    return {
                        pubDate,
                        podcast,
                        title,
                        playhead: parseFloat(playhead) || 0,
                        duration: parseFloat(duration) || 0,
                        playState: parseInt(playState) || 0,
                    };
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(episodes, null, 2) }],
                };
            }
            // 📷 Ambient Sensing
            case 'capture_camera_snapshot': {
                const { delay = 1, quality = 'medium' } = args;
                const outPath = `/tmp/macos-mcp-cam-${Date.now()}.jpg`;
                const qualityMap = { low: '50', medium: '75', high: '90' };
                await execAsync(`/opt/homebrew/bin/imagesnap -w ${delay} -q ${qualityMap[quality] || '75'} "${outPath}"`);
                const { stdout } = await execAsync(`base64 -i "${outPath}"`);
                await execAsync(`rm -f "${outPath}"`);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ image: `data:image/jpeg;base64,${stdout.trim()}`, size_kb: Math.round(stdout.length * 0.75 / 1024), captured_at: new Date().toISOString() }, null, 2) }],
                };
            }
            case 'get_ambient_noise': {
                const { duration = 3 } = args;
                const outPath = `/tmp/m-mcp-audio-${Date.now()}.wav`;
                await execAsync(`/opt/homebrew/bin/rec -q -c 1 -r 16000 -b 16 -e signed-integer "${outPath}" trim 0 ${duration} 2>/dev/null`);
                const { stdout } = await execAsync(`/opt/homebrew/bin/sox "${outPath}" -n stat 2>&1`);
                await execAsync(`rm -f "${outPath}"`);
                const rmsMatch = stdout.match(/RMS\s+amplitude:\s+([\d.]+)/);
                const peakMatch = stdout.match(/Maximum\s+amplitude:\s+([\d.]+)/);
                const rms = rmsMatch ? parseFloat(rmsMatch[1]) : 0;
                const peak = peakMatch ? parseFloat(peakMatch[1]) : 0;
                const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -120;
                const peakDb = peak > 0 ? 20 * Math.log10(peak) : -120;
                const level = rmsDb > -30 ? 'loud' : rmsDb > -50 ? 'moderate' : 'quiet';
                return {
                    content: [{ type: 'text', text: JSON.stringify({ rms_db: Math.round(rmsDb * 10) / 10, peak_db: Math.round(peakDb * 10) / 10, level }, null, 2) }],
                };
            }
            case 'capture_audio': {
                const { duration = 5 } = args;
                const outPath = `/tmp/m-mcp-audio-${Date.now()}.wav`;
                await execAsync(`/opt/homebrew/bin/rec -q -c 1 -r 16000 -b 16 -e signed-integer "${outPath}" trim 0 ${duration} 2>/dev/null`);
                const { stdout: statOut } = await execAsync(`/opt/homebrew/bin/sox "${outPath}" -n stat 2>&1`);
                const durMatch = statOut.match(/Length \(seconds\):\s+([\d.]+)/);
                const srMatch = statOut.match(/Sample Rate:\s+(\d+)/);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ file_path: outPath, duration_sec: durMatch ? parseFloat(durMatch[1]) : duration, sample_rate: srMatch ? parseInt(srMatch[1]) : 16000 }, null, 2) }],
                };
            }
            default:
                throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
        }
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error executing tool "${name}": ${error.message}` }],
            isError: true,
        };
    }
});
// Start the server using stdio transport
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('macOS Companion MCP Server running on stdio');
    // ponytail: warm up slow-starting apps in background at init so first tool call isn't cold.
    // Notes, Reminders, Calendar, and Mail take 15-40s to launch headlessly; open them now, don't wait.
    const warmUp = (app) => exec(`osascript -e 'tell application "${app}" to launch'`, () => { });
    warmUp('Notes');
    warmUp('Reminders');
    warmUp('Calendar');
    warmUp('Mail');
}
run().catch((error) => {
    console.error('Fatal error running server:', error);
    process.exit(1);
});
