#!/usr/bin/env node
// MCP 2.0 (2026-07-28 spec) — TypeScript SDK v2.
// The v2 SDK ships as scoped packages: `@modelcontextprotocol/server` (this
// server), `/server/stdio` (the stdio transport). The low-level `Server` +
// `setRequestHandler` API survives v2, but the handler-registration signature
// changed: v1 took a Zod request schema (e.g. `CallToolRequestSchema`); v2
// takes the method STRING ('tools/call'). `McpError`/`ErrorCode` are gone —
// v2 uses typed error classes, but our handlers already convert any thrown
// error into an `isError` text result, so plain `Error` is sufficient.
import { Server } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { trackFirstInstall, trackMcpStarted } from './telemetry.js';

// exec with a sane maxBuffer — the 1MB default kills any tool that returns a
// big payload (process lists, storage scans, podcast transcripts via cat).
// Hard timeout too: without it, any slow/hung command (du over $HOME,
// system_profiler stalls, camera waiting on permission) hangs the request
// until the client gives up with -32001, leaving an orphaned child process.
const EXEC_TIMEOUT_MS = 45_000;
const execRaw = promisify(exec);
function execAsync(cmd: string, opts: { maxBuffer?: number; timeout?: number } = {}): Promise<{ stdout: string }> {
  return execRaw(cmd, {
    maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
    timeout: opts.timeout ?? EXEC_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

// TTL cache for expensive scans — a full $HOME du takes minutes cold; repeat
// calls should be instant. Keyed by command string, no invalidation needed.
const SCAN_CACHE_TTL_MS = 10 * 60_000;
const scanCache = new Map<string, { at: number; value: string }>();
async function cachedExec(cmd: string, ttlMs: number = SCAN_CACHE_TTL_MS): Promise<string> {
  const hit = scanCache.get(cmd);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const { stdout } = await execAsync(cmd);
  scanCache.set(cmd, { at: Date.now(), value: stdout });
  return stdout;
}

// Resolve our own version from package.json (single source of truth) for both
// the server handshake and the telemetry product User-Agent.
function resolveServerVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // dist/index.js -> ../package.json
    const pkgPath = path.join(here, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
const SERVER_VERSION = resolveServerVersion();

// Reserved `_meta` envelope key carrying clientInfo on the 2026-07-28 era.
// Helper to run AppleScript by feeding it to osascript's stdin.
// ponytail: 60s hard timeout — without it, any AppleScript hang (e.g. a
// per-object property loop over iCloud-backed apps like Reminders/Notes)
// hangs the server forever, which is exactly the "can't deal with basic
// requests" failure. Per-app specific timeouts if a real op needs >60s.
const APPLESCRIPT_TIMEOUT_MS = 60_000;
function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('osascript', []);
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      proc.kill('SIGKILL');
      reject(new Error(`AppleScript timed out after ${APPLESCRIPT_TIMEOUT_MS / 1000}s`));
    }, APPLESCRIPT_TIMEOUT_MS);
    proc.stdout.on('data', (data: Buffer | string) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer | string) => { stderr += data.toString(); });
    proc.on('close', (code: number | null) => {
      if (settled) return;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Exit code ${code}`));
      }
    });
    proc.stdin.write(script);
    proc.stdin.end();
  });
}

// Newest cached transcript under the group-container TTML root. Used by
// play_podcast_episode to detect the fresh download; walks with fs only
// (find/cat exec broke on Group Containers before).
function newestCachedTranscript(): { path: string; mtimeMs: number } | null {
  const ttmlRoot = path.join(
    os.homedir(),
    'Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache/Assets/TTML'
  );
  let newest: { path: string; mtimeMs: number } | null = null;
  const walk = (dir: string, depth: number) => {
    if (depth > 8) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (/^transcript_\d+\.ttml-\d+\.ttml$/.test(entry.name)) {
        try {
          const mtimeMs = statSync(full).mtimeMs;
          if (!newest || mtimeMs > newest.mtimeMs) newest = { path: full, mtimeMs };
        } catch {
          // racing deletion — skip
        }
      }
    }
  };
  walk(ttmlRoot, 0);
  return newest;
}



// Initialize MCP Server
const server = new Server(
  {
    name: 'macos-companion-mcp',
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Fire once per connection when a client first lists tools (a real handshake).

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
    description: 'Lists podcast episodes from MTLibrary.sqlite, optionally filtered by release date range and/or title query. Returns pubDate, podcastTitle, title, playhead, duration, playState, transcriptId (path fragment), episodeId (Apple store track id). Pass a title to open_podcast_episode, and transcriptId to get_podcast_transcript once cached.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 10, description: 'Max episodes to return' },
        inProgressOnly: { type: 'boolean', default: false, description: 'Only return partially listened episodes' },
        fromDate: { type: 'string', description: 'Release date lower bound, inclusive, YYYY-MM-DD (episodes published on/after this date)' },
        toDate: { type: 'string', description: 'Release date upper bound, inclusive, YYYY-MM-DD (episodes published on/before this date)' },
        query: { type: 'string', description: 'Optional case-insensitive substring match on episode title' },
      },
    },
  },
  {
    name: 'get_podcast_transcript',
    description: 'Retrieves the full transcript for an episode from the local Apple Podcasts TTML cache. Returns speaker-attributed text with timestamps. Requires the episode to have been opened/played at least once so the transcript file was cached locally.',
    inputSchema: {
      type: 'object',
      properties: {
        transcriptId: { type: 'string', description: 'Transcript identifier from get_recent_podcast_episodes (transcriptId field). Path fragment like "PodcastContent221/v4/.../transcript_1000778999859.ttml"' },
        includeTimestamps: { type: 'boolean', default: true, description: 'Include begin/end timestamps in the output' },
      },
      required: ['transcriptId'],
    },
  },
  {
    name: 'open_podcast_episode',
    description: 'Searches Apple Podcasts for an episode title (from get_recent_podcast_episodes) and opens its episode page. Verified UI flow: Cmd+F, clipboard-paste the title (keystroke typing corrupts punctuation), open the top search result. Use before play_podcast_episode. The title should be fairly exact — the top search result is what gets opened.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Episode title from get_recent_podcast_episodes, e.g. "20VC: Jensen\'s Open-Weights Letter". Exact titles give exact results.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'play_podcast_episode',
    description: 'Plays the currently open episode page in Apple Podcasts (AX-discovers the play pill — position varies per page, so it is never hardcoded — and clicks it), then polls the TTML cache for up to ~15s for the transcript download. Returns the cached transcript path and transcriptId for get_podcast_transcript. Requires open_podcast_episode to have been called first.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pause_podcast_episode',
    description: 'Pauses Apple Podcasts playback via the Controls menu bar item. Note: the MTLibrary play_state column is unreliable (stays 1 while paused) — use the playhead field of get_recent_podcast_episodes to verify pause.',
    inputSchema: { type: 'object', properties: {} },
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

// Register list tools handler (v2: method string 'tools/list', not a schema).
// v2 types the result strictly (inputSchema.type is the literal 'object');
// our TOOLS literals widen to `string`, so we hand the SDK the list as-is via
// a cast. The JSON on the wire is byte-identical to what v1 emitted.
server.setRequestHandler('tools/list', async () => {
  return { tools: TOOLS } as any;
});

// Register call tool handler (v2: method string 'tools/call', not a schema).
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  // Inner dispatch keeps every existing `case` return byte-for-byte.
  const dispatch = async (): Promise<any> => {
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
        const { from, to } = args as { from: string; to: string };
        // accli must be installed
        const { stdout } = await execAsync(`/opt/homebrew/bin/accli export --from ${from} --to ${to} --json`);
        return {
          content: [{ type: 'text', text: stdout }],
        };
      }

      case 'create_calendar_event': {
        const { calendar, summary, start, end, description, location } = args as any;
        let cmd = `/opt/homebrew/bin/accli create "${calendar}" --summary "${summary}" --start "${start}" --end "${end}"`;
        if (description) cmd += ` --description "${description}"`;
        if (location) cmd += ` --location "${location}"`;
        const { stdout } = await execAsync(cmd);
        return {
          content: [{ type: 'text', text: stdout }],
        };
      }

      case 'get_reminders': {
        const filterList = (args as any)?.list;
        // Batched property fetch. Per-object `repeat` property access is
        // pathologically slow over iCloud (tested: ~2s per reminder for
        // `due date`). `X of every reminder of aList` is ONE AppleEvent.
        let script = `
          tell application "Reminders"
            set output to ""
            repeat with aList in every list
              set listName to name of aList
        `;
        if (filterList) {
          script += `if listName is "${filterList}" then`;
        }
        script += `
              set allReminders to every reminder of aList whose completed is false
              set rNames to name of every reminder of aList whose completed is false
              set rIds to id of every reminder of aList whose completed is false
              set rDues to due date of every reminder of aList whose completed is false
              repeat with i from 1 to count of allReminders
                set rDue to ""
                try
                  if item i of rDues is not missing value then
                    set rDue to (item i of rDues as string)
                  end if
                end try
                set output to output & listName & "|" & item i of rNames & "|" & item i of rIds & "|" & rDue & "\\n"
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
        const { title, notes, due, list } = args as any;
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
        const props: string[] = [`name:"${title}"`];
        if (notes) props.push(`body:"${notes}"`);
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
        const { id } = args as { id: string };
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
        // Batched property fetch — `name of every note` is ONE AppleEvent
        // (tested: 352 notes in ~0.5s); per-object access hangs.
        const stdout = await runAppleScript(`
          tell application "Notes"
            set allNotes to every note
            set nNames to name of every note
            set nIds to id of every note
            set nFolders to ""
            try
              set nFolders to name of folder of every note
            end try
            set output to ""
            repeat with i from 1 to count of allNotes
              set fname to ""
              try
                if nFolders is not "" then set fname to item i of nFolders
              end try
              set output to output & item i of nNames & "|" & item i of nIds & "|" & fname & "\\n"
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
        const { id } = args as { id: string };
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
        const { title, body, folder } = args as any;
        let script = `
          tell application "Notes"
        `;
        if (folder) {
          script += `
            set targetFolder to folder "${folder}"
            make new note in targetFolder with properties {name:"${title}", body:"${body}"}
          `;
        } else {
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
        const { id, content } = args as { id: string; content: string };
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
              text: JSON.stringify(
                {
                  running: state !== 'not running',
                  state,
                  volume: parseInt(volume) || 0,
                  track: track || null,
                  artist: artist || null,
                  album: album || null,
                  duration: parseFloat(duration) || null,
                  position: parseFloat(position) || null,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'play_playlist': {
        const { name: pName } = args as { name: string };
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
        const { direction } = args as { direction: string };
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
        const { volume } = args as { volume: number };
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
        const { to, subject, body } = args as any;
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
        const { to, message } = args as any;
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
        const { url } = args as { url: string };
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
        const { name: sName, input } = args as any;
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
        const stats: any = {};
        try {
          const { stdout: df } = await execAsync('df -h /System/Volumes/Data');
          stats.disk_usage = df.trim();
        } catch(e) {}
        try {
          const du = await cachedExec(`du -xh -d 1 -I node_modules -I .git -I .ollama "$HOME" | sort -rh | head -15`);
          stats.home_folders = du.trim();
        } catch(e) {}
        try {
          const { stdout: caches } = await execAsync(`du -xsh "$HOME/Library/Caches"`);
          stats.user_caches = caches.trim();
        } catch(e) {}
        try {
          const { stdout: tm } = await execAsync('tmutil listlocalsnapshots /');
          stats.local_snapshots = tm.trim();
        } catch(e) {}
        try {
          const { stdout: purgeable } = await execAsync(`diskutil info /System/Volumes/Data | grep -iE 'Container Free Space|Purgeable'`);
          stats.container_info = purgeable.trim();
        } catch(e) {}
        return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
      }

      case 'get_battery_health': {
        try {
          const { stdout: bat } = await execAsync(`system_profiler SPPowerDataType | grep -iE 'Cycle Count|Maximum Capacity|Condition|State of Charge|Fully Charged'`);
          return { content: [{ type: 'text', text: bat.trim() || '(no battery - desktop Mac)' }] };
        } catch(e) {
          return { content: [{ type: 'text', text: 'Error getting battery health' }] };
        }
      }

      case 'get_startup_items': {
        const stats: any = {};
        try {
          const { stdout: la } = await execAsync(`ls -1 "$HOME/Library/LaunchAgents" 2>/dev/null || echo ""`);
          stats.launch_agents = la.trim().split('\\n').filter(Boolean);
        } catch(e) {}
        try {
          const stdout = await runAppleScript(`tell application "System Events" to get the name of every login item`);
          stats.login_items = stdout.split(',').map(s => s.trim());
        } catch(e) {}
        return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
      }

      case 'run_health_audit': {
        const audit: any = {};
        
        // Machine Info
        try {
          const { stdout: sw } = await execAsync('sw_vers');
          const { stdout: hw } = await execAsync(`system_profiler SPHardwareDataType | grep -E 'Model Name|Chip|Processor Name|Total Number of Cores|Memory:'`);
          const { stdout: up } = await execAsync('uptime');
          audit.machine = { sw_vers: sw.trim(), hardware: hw.trim(), uptime: up.trim() };
        } catch(e) {}

        // Memory Pressure
        try {
          const { stdout: mem } = await execAsync(`memory_pressure -Q | grep -iE 'free percentage|pressure' | tail -3`);
          const { stdout: swap } = await execAsync(`sysctl vm.swapusage`);
          const { stdout: topMem } = await execAsync(`top -l 1 -o mem -n 8 -stats command,mem | tail -9`);
          audit.memory = { pressure: mem.trim(), swap: swap.trim(), top_consumers: topMem.trim() };
        } catch(e) {}

        // Storage
        try {
          const { stdout: df } = await execAsync('df -h /System/Volumes/Data | awk "NR==1 || NR==2"');
          const du = await cachedExec(`du -xh -d 1 -I node_modules -I .git -I .ollama "$HOME" | sort -rh | head -15`);
          audit.storage = { df: df.trim(), home_folders: du.trim() };
        } catch(e) {}

        // Compute / Thermals
        try {
          const { stdout: therm } = await execAsync(`pmset -g therm | grep -iE 'thermal|CPU_Speed_Limit' || echo "no thermal pressure recorded"`);
          const { stdout: topCpu } = await execAsync(`top -l 1 -o cpu -n 6 -stats command,cpu | tail -7`);
          audit.compute = { thermals: therm.trim(), top_consumers: topCpu.trim() };
        } catch(e) {}

        // Battery
        try {
          const { stdout: bat } = await execAsync(`system_profiler SPPowerDataType | grep -iE 'Cycle Count|Maximum Capacity|Condition|State of Charge|Fully Charged' || echo "(no battery)"`);
          audit.battery = bat.trim();
        } catch(e) {}

        // SSD Wear
        try {
          const { stdout: smart } = await execAsync(`smartctl -a /dev/disk0 | grep -iE 'SMART overall|Percentage Used|Available Spare|Data Units Written|Temperature:|Power On Hours' || echo "SMART read incomplete"`);
          audit.ssd_wear = smart.trim();
        } catch(e) {
          audit.ssd_wear = "smartctl not installed. Optional wear check: brew install smartmontools";
        }

        // Startup Load
        try {
          const { stdout: la } = await execAsync(`ls -1 "$HOME/Library/LaunchAgents" 2>/dev/null || echo "(none)"`);
          let loginItems = '';
          try {
            loginItems = await runAppleScript(`tell application "System Events" to get the name of every login item`);
          } catch (err) {}
          audit.startup_load = { launch_agents: la.trim(), login_items: loginItems.trim() || '(unavailable)' };
        } catch(e) {}

        return { content: [{ type: 'text', text: JSON.stringify(audit, null, 2) }] };
      }

      case 'run_disk_cleanup': {
        const { targets } = args as { targets: string[] };
        const results: string[] = [];

        for (const target of targets) {
          switch (target) {
            case 'derived_data': {
              const ddPath = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData');
              try {
                await execAsync(`rm -rf "${ddPath}"/*`);
                results.push(`Pruned Xcode DerivedData: ${ddPath}`);
              } catch (e) {
                results.push(`Skipped DerivedData (not found or permission denied)`);
              }
              break;
            }
            case 'trash': {
              const trashPath = path.join(os.homedir(), '.Trash');
              try {
                await execAsync(`rm -rf "${trashPath}"/*`);
                results.push(`Emptied Trash: ${trashPath}`);
              } catch (e) {
                results.push(`Failed to empty trash: ${(e as Error).message}`);
              }
              break;
            }
            case 'user_caches': {
              const cachePath = path.join(os.homedir(), 'Library/Caches');
              try {
                await execAsync(`rm -rf "${cachePath}"/*`);
                results.push(`Cleared user caches: ${cachePath}`);
              } catch (e) {
                results.push(`Cleared user caches partially: ${(e as Error).message}`);
              }
              break;
            }
            case 'package_caches': {
              try {
                await execAsync('npm cache clean --force');
                results.push('Cleared npm cache');
              } catch (e) {}
              break;
            }
          }
        }

        return {
          content: [{ type: 'text', text: results.join('\n') }],
        };
      }

      case 'get_system_stats': {
        const stats: any = {};

        // CPU / Uptime
        try {
          const { stdout: up } = await execAsync('uptime');
          stats.uptime = up.trim();
        } catch (e) {}

        // Memory Pressure
        try {
          const { stdout: vm } = await execAsync('vm_stat');
          stats.memory_pressure = vm.trim();
        } catch (e) {}

        // Battery
        try {
          const { stdout: bat } = await execAsync('pmset -g batt');
          stats.battery = bat.trim();
        } catch (e) {}

        // Thermal State
        try {
          const { stdout: therm } = await execAsync('sysctl -n kern.thermal_level');
          stats.thermal_level = parseInt(therm.trim()) || 0; // 0 = Normal, higher means throttled
        } catch (e) {}

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
        } catch (e) {
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
        const { pid, name: pName } = args as any;
        if (pid) {
          await execAsync(`kill -9 ${pid}`);
          return { content: [{ type: 'text', text: `Killed PID ${pid}` }] };
        } else if (pName) {
          await execAsync(`pkill -9 -f "${pName}"`);
          return { content: [{ type: 'text', text: `Killed process matching "${pName}"` }] };
        }
        throw new Error('Must provide either pid or name');
      }

      case 'restart_service': {
        const { service } = args as { service: string };
        await execAsync(`launchctl kickstart -k "gui/${process.getuid!()}/${service}"`);
        return {
          content: [{ type: 'text', text: `Restarted launchd service: ${service}` }],
        };
      }

      // 🎙️ Podcasts
      case 'get_recent_podcast_episodes': {
        const { limit = 10, inProgressOnly = false, fromDate, toDate, query } = args as {
          limit: number; inProgressOnly: boolean; fromDate?: string; toDate?: string; query?: string;
        };
        const dbPath = path.join(
          os.homedir(),
          'Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Documents/MTLibrary.sqlite'
        );

        let sql = `
          SELECT 
            datetime(e.ZPUBDATE + 978307200, 'unixepoch', 'localtime') as pub_date,
            p.ZTITLE as podcast_title,
            e.ZTITLE as episode_title,
            e.ZPLAYHEAD as playhead,
            e.ZDURATION as duration,
            e.ZPLAYSTATE as play_state,
            e.ZTRANSCRIPTIDENTIFIER as transcript_id,
            e.ZSTORETRACKID as episode_id,
            p.ZSTORECOLLECTIONID as podcast_id
          FROM ZMTEPISODE e 
          JOIN ZMTPODCAST p ON e.ZPODCAST = p.Z_PK
        `;
        // ponytail: date bounds via strftime('%s', ...) on the unix epoch — ZPUBDATE is Apple epoch (2001), +978307200 converts. Bounds are UTC midnight; good enough for daily granularity.
        const where: string[] = [];
        if (inProgressOnly) where.push(' e.ZPLAYSTATE = 1 ');
        // ponytail: unixepoch() (not strftime) — strftime returns TEXT and
        // INTEGER >= TEXT is always false in SQLite value comparisons.
        if (fromDate) where.push(` (e.ZPUBDATE + 978307200) >= unixepoch('${fromDate}') `);
        if (toDate) where.push(` (e.ZPUBDATE + 978307200) < unixepoch('${toDate}', '+1 day') `);
        if (query) where.push(` e.ZTITLE LIKE '%${query.replace(/'/g, "''")}%' `);
        if (where.length) sql += ` WHERE ${where.join(' AND ')} `;
        sql += ` ORDER BY e.ZPUBDATE DESC LIMIT ${limit}; `;

        const { stdout } = await execAsync(`sqlite3 "${dbPath}" "${sql}"`);
        const episodes = stdout.split('\n').filter(Boolean).map((line: string) => {
          const [pubDate, podcast, title, playhead, duration, playState, transcriptId, episodeId, podcastId] = line.split('|');
          return {
            pubDate,
            podcast,
            title,
            playhead: parseFloat(playhead) || 0,
            duration: parseFloat(duration) || 0,
            playState: parseInt(playState) || 0,
            transcriptId: transcriptId || null,
            episodeId: episodeId || null,
            podcastId: podcastId || null,
          };
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(episodes, null, 2) }],
        };
      }

      case 'open_podcast_episode': {
        const { title } = args as { title: string };
        if (!title) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Missing title. Pass the episode title from get_recent_podcast_episodes.' }) }], isError: true };
        }
        // Verified 2x (Ruby Thelot a16z, 20VC Jensen): Cmd+F → focus search
        // field → Cmd+A (clear stale text) → clipboard-paste title (keystroke
        // typing corrupts ":' spaces — "20VC: Jensen's…" → "20VC :Jensen
        // 'sOpen-Weigh tsLetter") → Return → click top search result row.
        const escaped = title.replace(/"/g, '\\"');
        const script = `
tell application "Podcasts" to activate
delay 1.5
do shell script "printf %s " & quoted form of "${escaped}" & " | pbcopy"
tell application "System Events"
  tell process "Podcasts"
    set frontmost to true
    keystroke "f" using command down
    delay 0.8
    try
      set focused of first text field of window 1 to true
    on error
      click at {820, 56}
    end try
    delay 0.3
    keystroke "a" using command down
    keystroke "v" using command down
    key code 36
  end tell
end tell
delay 3
tell application "System Events"
  click at {355, 199}
end tell
return "opened"`;
        await runAppleScript(script);
        return {
          content: [{ type: 'text', text: `Opened episode page for "${title}" (top search result). Next: play_podcast_episode to start playback and trigger the transcript download.` }],
        };
      }

      case 'play_podcast_episode': {
        // AX-discover the play pill: description begins "Play, Remaining
        // Time:" / "Replay," — position varies per episode page (209 vs 257
        // observed), so never hardcode. The bare mini-player "Play" button has
        // no comma, so this can't hit the wrong one.
        const discover = `
tell application "System Events"
  tell process "Podcasts"
    set frontmost to true
    set hits to {}
    set allElems to entire contents of window 1
    repeat with el in allElems
      try
        if class of el is button then
          set d to description of el
          if d begins with "Play," or d begins with "Replay," then
            set p to position of el
            set s to size of el
            set end of hits to (((item 1 of p) + ((item 1 of s) div 2)) as text) & "," & (((item 2 of p) + ((item 2 of s) div 2)) as text)
          end if
        end if
      end try
    end repeat
    if (count of hits) > 0 then return item 1 of hits
    return "NOT_FOUND"
  end tell
end tell`;
        const found = await runAppleScript(discover);
        if (found === 'NOT_FOUND') {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'No play button found on the open episode page. Run open_podcast_episode (title) first, then retry.' }) }],
            isError: true,
          };
        }
        const [x, y] = found.split(',').map(Number);
        const before = newestCachedTranscript();
        await runAppleScript(`tell application "System Events" to click at {${x}, ${y}}`);

        // Poll up to ~15s for the fresh TTML download (observed ~8s after play).
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const now = newestCachedTranscript();
          if (now && (!before || now.mtimeMs > before.mtimeMs)) {
            const id = now.path.match(/transcript_(\d+)\.ttml-\d+\.ttml$/)?.[1] || null;
            return {
              content: [{ type: 'text', text: JSON.stringify({ played: true, transcriptPath: now.path, transcriptId: id, waitedMs: (i + 1) * 1500 }) }],
            };
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ played: true, newTranscriptDownloaded: false, newestCached: before?.path ?? null, note: 'No new transcript within 15s. If this episode has a transcript, retry get_podcast_transcript — it may already be cached.' }) }],
        };
      }

      case 'pause_podcast_episode': {
        const script = `
tell application "System Events"
  tell process "Podcasts"
    set frontmost to true
    if exists menu item "Pause" of menu 1 of menu bar item "Controls" of menu bar 1 then
      click menu item "Pause" of menu 1 of menu bar item "Controls" of menu bar 1
      return "Paused"
    end if
    return "AlreadyPaused"
  end tell
end tell`;
        const state = await runAppleScript(script);
        return {
          content: [{ type: 'text', text: state }],
        };
      }

      case 'get_podcast_transcript': {
        const { transcriptId, includeTimestamps = true } = args as { transcriptId: string; includeTimestamps?: boolean };

        // DB stores paths like PodcastContent221/v4/f2/20/d8/.../transcript_1000778994481.ttml
        // Actual cache files: Assets/TTML/PodcastContent{XXX}/v4/<hex>/<uuid>/transcript_{id}.ttml-{id}.ttml
        // Directory structure differs from the DB path — search by numeric ID.
        const idMatch = String(transcriptId).match(/transcript_(\d+)\.ttml/);
        if (!idMatch) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Invalid transcript ID format: ${transcriptId}` }) }],
            isError: true,
          };
        }
        const numericId = idMatch[1];
        const ttmlRoot = path.join(
          os.homedir(),
          'Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache/Assets/TTML'
        );

        // Walk the cache with fs — no find/cat exec: `find` exits non-zero on
        // unreadable dirs (Group Containers), and `cat` blew the 1MB exec
        // buffer on large transcripts. Both were reported by the trace.
        const wanted = `transcript_${numericId}.ttml-${numericId}.ttml`;
        let fullPath = '';
        const walk = (dir: string, depth: number): boolean => {
          if (fullPath || depth > 8) return !!fullPath;
          let entries;
          try {
            entries = readdirSync(dir, { withFileTypes: true });
          } catch {
            return false; // unreadable dir — skip, don't fail the search
          }
          for (const entry of entries) {
            if (entry.name === wanted) { fullPath = path.join(dir, entry.name); return true; }
            if (entry.isDirectory() && walk(path.join(dir, entry.name), depth + 1)) return true;
          }
          return !!fullPath;
        };
        walk(ttmlRoot, 0);

        if (!fullPath) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Transcript not cached locally for ID ${numericId}. Run open_podcast_episode (title) then play_podcast_episode to trigger the download, then retry.` }) }],
            isError: true,
          };
        }

        const fileContent = readFileSync(fullPath, 'utf8');
        if (!fileContent.trim()) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Transcript file is empty. Play the episode in Apple Podcasts first to trigger download.' }) }],
            isError: true,
          };
        }

        // Parse TTML XML
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
          isArray: (name) => ['p', 'span'].includes(name),
        });
        const parsed = parser.parse(fileContent);

        // Extract speaker-attributed text from the parsed TTML
        const segments: Array<{ speaker: string; text: string; begin?: string; end?: string }> = [];

        const body = parsed?.tt?.body;
        if (!body) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Could not parse TTML structure' }) }], isError: true };
        }

        const divs = body.div;
        const paragraphs = divs ? (Array.isArray(divs) ? divs.flatMap((d: any) => (Array.isArray(d.p) ? d.p : d.p ? [d.p] : [])) : Array.isArray(divs.p) ? divs.p : divs.p ? [divs.p] : []) : [];

        for (const p of paragraphs) {
          if (!p) continue;
          const speaker = p['@_ttm:agent'] || p['@_ttm:Agent'] || 'SPEAKER_UNKNOWN';
          const rawBegin = p['@_begin'] || '';
          const rawEnd = p['@_end'] || '';

          // Extract text from sentence spans
          const spans = p.span;
          const sentences: string[] = [];
          if (spans) {
            const sentenceSpans = Array.isArray(spans) ? spans : [spans];
            for (const s of sentenceSpans) {
              if (typeof s === 'string') {
                sentences.push(s);
              } else if (typeof s === 'object') {
                // Could be word-level spans inside or just text
                if (s['#text']) {
                  sentences.push(s['#text']);
                } else if (s.span) {
                  // Word-level spans — join with a space (ponytail: joining
                  // with '' produced run-together text like "Allright,full...").
                  const words = Array.isArray(s.span) ? s.span : [s.span];
                  const sentence = words.map((w: any) => (typeof w === 'string' ? w : w['#text'] || '')).join(' ');
                  sentences.push(sentence);
                }
              }
            }
          }

          const text = sentences.join(' ').replace(/\s+/g, ' ').trim();
          if (text) {
            segments.push({
              speaker,
              text,
              begin: includeTimestamps ? rawBegin : undefined,
              end: includeTimestamps ? rawEnd : undefined,
            });
          }
        }

        // Format output as readable text with speaker labels
        const duration = parsed?.tt?.body?.['@_dur'] || '';
        const formatted = segments.map(s => {
          const time = includeTimestamps && s.begin ? ` [${s.begin}${s.end ? ` → ${s.end}` : ''}]` : '';
          const speakerLabel = s.speaker.replace('SPEAKER_', 'Speaker ');
          return `${speakerLabel}${time}: ${s.text}`;
        }).join('\n');

        const result = {
          transcript: formatted,
          segments: segments.map(s => ({
            speaker: s.speaker,
            text: s.text,
            begin: s.begin || '',
            end: s.end || '',
          })),
          duration,
          fileSize: fileContent.length,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // 📷 Ambient Sensing
      case 'capture_camera_snapshot': {
        const { delay = 1, quality = 'medium' } = args as { delay?: number; quality?: string };
        const outPath = `/tmp/macos-mcp-cam-${Date.now()}.jpg`;
        const qualityMap: Record<string, string> = { low: '50', medium: '75', high: '90' };
        await execAsync(`/opt/homebrew/bin/imagesnap -w ${delay} -q ${qualityMap[quality] || '75'} "${outPath}"`);
        const { stdout } = await execAsync(`base64 -i "${outPath}"`);
        await execAsync(`rm -f "${outPath}"`);
        return {
          content: [{ type: 'text', text: JSON.stringify({ image: `data:image/jpeg;base64,${stdout.trim()}`, size_kb: Math.round(stdout.length * 0.75 / 1024), captured_at: new Date().toISOString() }, null, 2) }],
        };
      }

      case 'get_ambient_noise': {
        const { duration = 3 } = args as { duration?: number };
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
        const { duration = 5 } = args as { duration?: number };
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
        throw new Error(`Tool not found: ${name}`);
    }
  };

  try {
    return await dispatch();
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error executing tool "${name}": ${(error as Error).message}` }],
      isError: true,
    };
  }
});

// Start the server using stdio transport
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('macOS Companion MCP Server running on stdio');

  // One-time install ping — fires only on the very first run ever
  trackFirstInstall(SERVER_VERSION);
  // Startup heartbeat ping with Schema v2 envelope
  trackMcpStarted(SERVER_VERSION);

  // ponytail: warm up slow-starting apps in background at init so first tool call isn't cold.
  // Notes, Reminders, Calendar, and Mail take 15-40s to launch headlessly; open them now, don't wait.
  const warmUp = (app: string) =>
    exec(`osascript -e 'tell application "${app}" to launch'`, () => {});
  warmUp('Notes');
  warmUp('Reminders');
  warmUp('Calendar');
  warmUp('Mail');
}

run().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});
