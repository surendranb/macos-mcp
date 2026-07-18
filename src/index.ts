#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { captureEvent } from './telemetry.js';

const execAsync = promisify(exec);

function escape(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function shEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

const KEY_CODES: Record<string, number> = {
  escape: 53, return: 36, tab: 48, delete: 51, space: 49, enter: 76,
  up: 126, down: 125, left: 123, right: 124,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98,
  f8: 100, f9: 101, f10: 109, f11: 103, f12: 111, f13: 105, f14: 107,
  home: 115, end: 119, pageup: 116, pagedown: 121,
};

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('osascript', []);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data: Buffer | string) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer | string) => { stderr += data.toString(); });
    proc.on('close', (code: number | null) => {
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

// Initialize MCP Server
const server = new Server(
  {
    name: 'macos-companion-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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

  // Phase 1: Contacts
  {
    name: 'search_contacts',
    description: 'Search macOS Contacts by name or email',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (name or email)' },
      },
      required: ['query'],
    },
  },

  // Phase 1: Clipboard
  {
    name: 'get_clipboard',
    description: 'Read current clipboard content',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_clipboard',
    description: 'Write text to clipboard',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to copy to clipboard' },
      },
      required: ['text'],
    },
  },

  // Phase 1: Notifications
  {
    name: 'send_notification',
    description: 'Sends a macOS notification',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        subtitle: { type: 'string', description: 'Optional subtitle' },
        body: { type: 'string', description: 'Optional body text' },
      },
      required: ['title'],
    },
  },

  // Phase 1: System Control
  {
    name: 'set_system_volume',
    description: 'Sets macOS output volume (0-100)',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'number', minimum: 0, maximum: 100, description: 'Volume level 0-100' },
      },
      required: ['level'],
    },
  },
  {
    name: 'sleep_display',
    description: 'Puts display to sleep immediately',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lock_screen',
    description: 'Locks the macOS screen',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_do_not_disturb',
    description: 'Toggle Do Not Disturb mode',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Enable or disable DND' },
      },
      required: ['enabled'],
    },
  },

  // Phase 1: WiFi
  {
    name: 'get_wifi_info',
    description: 'Gets current WiFi network information (SSID, signal strength, etc.)',
    inputSchema: { type: 'object', properties: {} },
  },

  // Phase 2: Mail
  {
    name: 'search_emails',
    description: 'Search emails by subject or sender in Apple Mail',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text (matches subject or sender)' },
        limit: { type: 'number', default: 10, description: 'Max results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_email',
    description: 'Read full email body by message ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Message ID from search results' },
        mailbox: { type: 'string', default: 'inbox', description: 'Mailbox name (inbox, sent, etc.)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'reply_to_email',
    description: 'Reply to an email by message ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Message ID' },
        body: { type: 'string', description: 'Reply body text' },
      },
      required: ['id', 'body'],
    },
  },
  {
    name: 'forward_email',
    description: 'Forward an email by message ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Message ID' },
        to: { type: 'string', description: 'Recipient email' },
        body: { type: 'string', description: 'Additional body text' },
      },
      required: ['id', 'to', 'body'],
    },
  },

  // Phase 2: Messages
  {
    name: 'search_messages',
    description: 'Search iMessage conversations by text',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
        limit: { type: 'number', default: 10, description: 'Max results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_chat_history',
    description: 'Get recent message history with a contact',
    inputSchema: {
      type: 'object',
      properties: {
        contact: { type: 'string', description: 'Contact name, phone, or email' },
        limit: { type: 'number', default: 20, description: 'Max messages' },
      },
      required: ['contact'],
    },
  },

  // Phase 2: Maps
  {
    name: 'search_maps',
    description: 'Search for places on Apple Maps',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place to search for' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_directions',
    description: 'Get directions between two locations (opens Apple Maps)',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Starting location' },
        to: { type: 'string', description: 'Destination' },
        mode: { type: 'string', enum: ['d', 'w', 'r'], default: 'd', description: 'd=driving, w=walking, r=transit' },
      },
      required: ['to'],
    },
  },

  // Phase 2: Stickies
  {
    name: 'list_stickies',
    description: 'Lists all macOS Stickies notes',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_sticky',
    description: 'Get full content of a sticky note by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sticky note ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_sticky',
    description: 'Create a new sticky note',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        body: { type: 'string', description: 'Note content' },
      },
      required: ['title', 'body'],
    },
  },

  // Phase 3: Screen Capture
  {
    name: 'take_screenshot',
    description: 'Take a screenshot to a file or clipboard',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional file path to save to (default: desktop)' },
        interactive: { type: 'boolean', default: false, description: 'Interactive selection mode' },
        type: { type: 'string', enum: ['screen', 'window', 'selection'], default: 'screen', description: 'Capture type' },
      },
    },
  },

  // Phase 3: UI Automation
  {
    name: 'click_at',
    description: 'Click at screen coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text at current keyboard focus',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
      },
      required: ['text'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a keyboard key',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name (e.g. Escape, Return, Tab, F5, a, etc.)' },
        modifiers: {
          type: 'array',
          items: { type: 'string', enum: ['command', 'option', 'shift', 'control'] },
          description: 'Modifier keys to hold',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'list_windows',
    description: 'List all visible app windows',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'focus_app',
    description: 'Bring an app to front',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'App name (e.g. Safari, Notes)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_window_position',
    description: 'Get position and size of an app window',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        windowIndex: { type: 'number', default: 1, description: 'Window index (1-based)' },
      },
      required: ['app'],
    },
  },
  {
    name: 'resize_window',
    description: 'Resize or reposition an app window',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        x: { type: 'number', description: 'New X position' },
        y: { type: 'number', description: 'New Y position' },
        width: { type: 'number', description: 'New width' },
        height: { type: 'number', description: 'New height' },
        windowIndex: { type: 'number', default: 1, description: 'Window index (1-based)' },
      },
      required: ['app', 'width', 'height'],
    },
  },

  // Phase 3: Location
  {
    name: 'get_current_location',
    description: 'Get approximate current location from WiFi',
    inputSchema: { type: 'object', properties: {} },
  },

  // Phase 3: Photos
  {
    name: 'search_photos',
    description: 'Search Photos library by keyword',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        limit: { type: 'number', default: 10, description: 'Max results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_recent_photos',
    description: 'Get recent photos from the Photos library',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 10, description: 'Max results' },
      },
    },
  },
];

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  captureEvent('list_tools').catch(console.error);
  return { tools: TOOLS };
});

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  captureEvent('tool_executed', { tool: request.params.name }).catch(console.error);
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // 📅 Calendar & Reminders
      case 'list_calendars': {
        const stdout = await runAppleScript(`
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
        const stdout = await runAppleScript(`
          tell application "Calendar"
            set output to ""
            set calendarList to every calendar
            repeat with c in calendarList
              set calName to name of c
              set eventList to (every event of c whose start date ≥ date "${escape(from)}" and end date ≤ date "${escape(to)}")
              repeat with e in eventList
                set eSummary to summary of e
                set eStart to start date of e as string
                set eEnd to end date of e as string
                set eLocation to ""
                try
                  set eLocation to location of e
                end try
                set output to output & calName & "|" & eSummary & "|" & eStart & "|" & eEnd & "|" & eLocation & "\\n"
              end repeat
            end repeat
            return output
          end tell
        `);
        const events = stdout.split('\n').filter(Boolean).map(line => {
          const [calendar, summary, start, end, location] = line.split('|');
          return { calendar, summary, start, end, location: location || null };
        });
        return { content: [{ type: 'text', text: JSON.stringify(events, null, 2) }] };
      }

      case 'create_calendar_event': {
        const { calendar, summary, start, end, description, location } = args as any;
        const script = `
          tell application "Calendar"
            set targetCal to calendar "${escape(calendar)}"
            set newEvent to make new event in targetCal at end of events of targetCal
            set summary of newEvent to "${escape(summary)}"
            set start date of newEvent to date "${escape(start)}"
            set end date of newEvent to date "${escape(end)}"
        `;
        let fullScript = script;
        if (description) fullScript += `set description of newEvent to "${escape(description)}"\n`;
        if (location) fullScript += `set location of newEvent to "${escape(location)}"\n`;
        fullScript += `end tell`;
        await runAppleScript(fullScript);
        return { content: [{ type: 'text', text: `Created event: ${summary} in ${calendar}` }] };
      }

      case 'get_reminders': {
        const filterList = (args as any)?.list;
        let script = `
          tell application "Reminders"
            set output to ""
            set allLists to every list
            repeat with aList in allLists
              set listName to name of aList
        `;
        if (filterList) {
          script += `if listName is "${escape(filterList)}" then`;
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
        const { title, notes, due, list } = args as any;
        let script = `
          tell application "Reminders"
            set targetList to default list
        `;
        if (list) {
          script += `
            try
              set targetList to list "${escape(list)}"
            on error
              set targetList to make new list with properties {name:"${escape(list)}"}
            end try
          `;
        }
        const props: string[] = [`name:"${escape(title)}"`];
        if (notes) props.push(`body:"${escape(notes)}"`);
        script += `
            set newReminder to make new reminder in targetList with properties {${props.join(', ')}}
        `;
        if (due) {
          script += `set due date of newReminder to date "${escape(due)}"\n`;
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
            set aReminder to reminder id "${escape(id)}"
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
        const { id } = args as { id: string };
        const body = await runAppleScript(`
          tell application "Notes"
            return body of note id "${escape(id)}"
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
            set targetFolder to folder "${escape(folder)}"
            make new note in targetFolder with properties {name:"${escape(title)}", body:"${escape(body)}"}
          `;
        } else {
          script += `
            make new note with properties {name:"${escape(title)}", body:"${escape(body)}"}
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
            set aNote to note id "${escape(id)}"
            set body of aNote to (body of aNote) & "<p>${escape(content)}</p>"
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
            play playlist "${escape(pName)}"
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
            set newMsg to make new outgoing message with properties {subject:"${escape(subject)}", content:"${escape(body)}"}
            tell newMsg
              make new to recipient with properties {address:"${escape(to)}"}
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
            send "${escape(message)}" to buddy "${escape(to)}" of service "iMessage"
          end tell
        `);
        return {
          content: [{ type: 'text', text: `Sent message to "${to}"` }],
        };
      }

      // 🌐 Browser & Shortcuts
      case 'open_url': {
        const { url } = args as { url: string };
        await execAsync(`open ${shEscape(url)}`);
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
        let cmd = `/usr/bin/shortcuts run ${shEscape(sName)}`;
        if (input) {
          cmd = `echo ${shEscape(input)} | ${cmd}`;
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
          const { stdout: du } = await execAsync(`du -xh -d 1 "$HOME" | sort -rh | head -15`);
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
          const { stdout: du } = await execAsync(`du -xh -d 1 "$HOME" | sort -rh | head -15`);
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
                const { stdout } = await execAsync(`ls "${ddPath}" 2>/dev/null | head -1`);
                if (stdout.trim()) {
                  await execAsync(`rm -rf "${ddPath}"/*`);
                  results.push(`Pruned Xcode DerivedData`);
                } else {
                  results.push(`DerivedData already empty`);
                }
              } catch (e) {
                results.push(`Skipped DerivedData (not found)`);
              }
              break;
            }
            case 'trash': {
              try {
                await runAppleScript(`tell app "Finder" to delete every item of trash`);
                results.push(`Emptied Trash via Finder`);
              } catch (e) {
                results.push(`Failed to empty trash: ${(e as Error).message}`);
              }
              break;
            }
            case 'user_caches': {
              const cachePath = path.join(os.homedir(), 'Library/Caches');
              // ponytail: deletes top-level cache dirs only, not recursive. Add per-app granularity if needed.
              try {
                const { stdout } = await execAsync(`ls "${cachePath}" 2>/dev/null | head -1`);
                if (stdout.trim()) {
                  await execAsync(`find "${cachePath}" -maxdepth 1 -type d -not -name '.' -not -name '..' -exec rm -rf {} + 2>/dev/null; find "${cachePath}" -maxdepth 1 -type f -not -name '.' -not -name '..' -delete 2>/dev/null`);
                  results.push(`Cleared user caches`);
                } else {
                  results.push(`Caches already empty`);
                }
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
          await execAsync(`pkill -9 -f ${shEscape(pName)}`);
          return { content: [{ type: 'text', text: `Killed process matching "${pName}"` }] };
        }
        throw new McpError(ErrorCode.InvalidParams, 'Must provide either pid or name');
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
        const { limit = 10, inProgressOnly = false } = args as { limit: number; inProgressOnly: boolean };
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
            e.ZPLAYSTATE as play_state
          FROM ZMTEPISODE e 
          JOIN ZMTPODCAST p ON e.ZPODCAST = p.Z_PK
        `;

        if (inProgressOnly) {
          sql += ' WHERE e.ZPLAYSTATE = 1 ';
        }
        sql += ` ORDER BY e.ZPUBDATE DESC LIMIT ${limit}; `;

        const { stdout } = await execAsync(`sqlite3 "${dbPath}" "${sql}"`);
        const episodes = stdout.split('\n').filter(Boolean).map((line: string) => {
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

      // 👤 Contacts
      case 'search_contacts': {
        const { query } = args as { query: string };
        const stdout = await runAppleScript(`
          tell application "Contacts"
            set output to ""
            set matchingPeople to every person whose name contains "${escape(query)}" or email contains "${escape(query)}"
            repeat with p in matchingPeople
              set pName to name of p
              set pId to id of p
              set org to ""
              try
                set org to company of p
              end try
              set output to output & pId & "|" & pName & "|" & org & "\\n"
            end repeat
            return output
          end tell
        `);
        const contacts = stdout.split('\n').filter(Boolean).map(line => {
          const [id, name, org] = line.split('|');
          return { id, name, org };
        });
        return { content: [{ type: 'text', text: JSON.stringify(contacts, null, 2) }] };
      }

      // 📋 Clipboard
      case 'get_clipboard': {
        const { stdout } = await execAsync('pbpaste');
        return { content: [{ type: 'text', text: stdout }] };
      }
      case 'set_clipboard': {
        const { text } = args as { text: string };
        const proc = spawn('pbcopy', []);
        proc.stdin.write(text);
        proc.stdin.end();
        await new Promise(resolve => proc.on('close', resolve));
        return { content: [{ type: 'text', text: 'Copied to clipboard' }] };
      }

      // 🔔 Notifications
      case 'send_notification': {
        const { title, subtitle, body } = args as any;
        let script = `display notification "${escape(body || '')}" with title "${escape(title)}"`;
        if (subtitle) script += ` subtitle "${escape(subtitle)}"`;
        script += ` sound name "default"`;
        await runAppleScript(script);
        return { content: [{ type: 'text', text: `Sent notification: ${title}` }] };
      }

      // 🎛️ System Control
      case 'set_system_volume': {
        const { level } = args as { level: number };
        await runAppleScript(`set volume output volume ${level}`);
        return { content: [{ type: 'text', text: `Set volume to ${level}` }] };
      }
      case 'sleep_display': {
        await execAsync('pmset displaysleepnow');
        return { content: [{ type: 'text', text: 'Display set to sleep' }] };
      }
      case 'lock_screen': {
        await runAppleScript(`tell application "System Events" to keystroke "q" using {command down, control down}`);
        return { content: [{ type: 'text', text: 'Screen locked' }] };
      }
      case 'set_do_not_disturb': {
        const { enabled } = args as { enabled: boolean };
        if (enabled) {
          await execAsync(`defaults -currentHost write ~/Library/Preferences/ByHost/com.apple.notificationcenterui doNotDisturb -boolean true && defaults -currentHost write ~/Library/Preferences/ByHost/com.apple.notificationcenterui doNotDisturbDate -date "$(date)" && killall NotificationCenter`);
        } else {
          await execAsync(`defaults -currentHost write ~/Library/Preferences/ByHost/com.apple.notificationcenterui doNotDisturb -boolean false && killall NotificationCenter`);
        }
        return { content: [{ type: 'text', text: `DND ${enabled ? 'enabled' : 'disabled'}` }] };
      }

      // 📶 WiFi
      case 'get_wifi_info': {
        try {
          const { stdout } = await execAsync(`/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I`);
          const info: Record<string, string> = {};
          stdout.split('\n').forEach(line => {
            const [, key, val] = line.match(/^\s*(.+?):\s(.+)$/m) || [];
            if (key) info[key.trim()] = val.trim();
          });
          return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
        } catch {
          const { stdout } = await execAsync(`networksetup -getairportnetwork en0 2>/dev/null || networksetup -getairportnetwork en1 2>/dev/null`);
          return { content: [{ type: 'text', text: stdout.trim() || 'No WiFi info available' }] };
        }
      }

      // ✉️ Mail
      case 'search_emails': {
        const { query, limit = 10 } = args as { query: string; limit: number };
        const stdout = await runAppleScript(`
          tell application "Mail"
            activate
            delay 1
            set output to ""
            set matchingMsgs to (every message of inbox whose subject contains "${escape(query)}" or sender contains "${escape(query)}")
            set mCount to count of matchingMsgs
            if mCount > ${limit} then set mCount to ${limit}
            repeat with i from 1 to mCount
              set aMsg to item i of matchingMsgs
              set output to output & (id of aMsg) & "|" & (sender of aMsg) & "|" & (subject of aMsg) & "|" & (date received of aMsg as string) & "\\n"
            end repeat
            return output
          end tell
        `);
        const msgs = stdout.split('\n').filter(Boolean).map(line => {
          const [id, sender, subject, date] = line.split('|');
          return { id: parseInt(id), sender, subject, date };
        });
        return { content: [{ type: 'text', text: JSON.stringify(msgs, null, 2) }] };
      }
      case 'get_email': {
        const { id, mailbox = 'inbox' } = args as { id: number; mailbox: string };
        const stdout = await runAppleScript(`
          tell application "Mail"
            activate
            delay 1
            set output to ""
            try
              set aMsg to message id ${id} of mailbox "${escape(mailbox)}" of account 1
              set output to output & "From: " & sender of aMsg & "\\n"
              set output to output & "Subject: " & subject of aMsg & "\\n"
              set output to output & "Date: " & (date received of aMsg as string) & "\\n"
              set output to output & "---\\n"
              set output to output & (content of aMsg)
            end try
            return output
          end tell
        `);
        return { content: [{ type: 'text', text: stdout || 'Email not found' }] };
      }
      case 'reply_to_email': {
        const { id, body } = args as { id: number; body: string };
        await runAppleScript(`
          tell application "Mail"
            activate
            set aMsg to message id ${id} of inbox
            set replyMsg to reply aMsg
            set content of replyMsg to "${escape(body)}"
            send replyMsg
          end tell
        `);
        return { content: [{ type: 'text', text: `Replied to message ${id}` }] };
      }
      case 'forward_email': {
        const { id, to, body } = args as { id: number; to: string; body: string };
        await runAppleScript(`
          tell application "Mail"
            activate
            set aMsg to message id ${id} of inbox
            set fwdMsg to forward aMsg
            make new to recipient at end of to recipients of fwdMsg with properties {address:"${escape(to)}"}
            set content of fwdMsg to "${escape(body)}" & return & return & (content of aMsg)
            send fwdMsg
          end tell
        `);
        return { content: [{ type: 'text', text: `Forwarded message ${id} to ${to}` }] };
      }

      // 💬 Messages
      case 'search_messages': {
        const { query, limit = 10 } = args as { query: string; limit: number };
        const stdout = await runAppleScript(`
          tell application "Messages"
            set output to ""
            set chatCount to count of every chat
            repeat with c in every chat
              try
                set chatName to name of c
                if chatName contains "${escape(query)}" then
                  set output to output & id of c & "|" & chatName & "|\\n"
                end if
              end try
            end repeat
            return output
          end tell
        `);
        const chats = stdout.split('\n').filter(Boolean).map(line => {
          const [id, name] = line.split('|');
          return { id, name };
        });
        return { content: [{ type: 'text', text: JSON.stringify(chats.slice(0, limit), null, 2) }] };
      }
      case 'get_chat_history': {
        const { contact, limit = 20 } = args as { contact: string; limit: number };
        const stdout = await runAppleScript(`
          tell application "Messages"
            set output to ""
            set chatCount to count of every chat
            repeat with c in every chat
              try
                set chatName to name of c
                if chatName contains "${escape(contact)}" then
                  set msgCount to count of messages of c
                  if msgCount > ${limit} then set msgCount to ${limit}
                  repeat with i from msgCount to 1 by -1
                    set m to message i of c
                    set mSender to ""
                    try
                      set mSender to display name of participant of m
                    end try
                    set output to output & mSender & "|" & (content of m) & "|" & (date sent of m as string) & "\\n"
                  end repeat
                end if
              end try
            end repeat
            return output
          end tell
        `);
        const msgs = stdout.split('\n').filter(Boolean).map(line => {
          const [sender, text, date] = line.split('|');
          return { sender, text, date };
        });
        return { content: [{ type: 'text', text: JSON.stringify(msgs, null, 2) }] };
      }

      // 🗺️ Maps
      case 'search_maps': {
        const { query } = args as { query: string };
        await execAsync(`open "maps://?q=${encodeURIComponent(query)}"`);
        return { content: [{ type: 'text', text: `Opened Maps searching for: ${query}` }] };
      }
      case 'get_directions': {
        const { from, to, mode = 'd' } = args as { from?: string; to: string; mode: string };
        let url = `maps://?dirflg=${mode}&daddr=${encodeURIComponent(to)}`;
        if (from) url += `&saddr=${encodeURIComponent(from)}`;
        await execAsync(`open "${url}"`);
        return { content: [{ type: 'text', text: `Opened Maps with directions to: ${to}` }] };
      }

      // 🟡 Stickies
      case 'list_stickies': {
        const stdout = await runAppleScript(`
          tell application "Stickies"
            set output to ""
            repeat with s in every sticky note
              set output to output & (id of s) & "|" & (name of s) & "\\n"
            end repeat
            return output
          end tell
        `);
        const notes = stdout.split('\n').filter(Boolean).map(line => {
          const [id, name] = line.split('|');
          return { id, name };
        });
        return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] };
      }
      case 'get_sticky': {
        const { id } = args as { id: string };
        const stdout = await runAppleScript(`
          tell application "Stickies"
            return body of sticky note id "${escape(id)}"
          end tell
        `);
        return { content: [{ type: 'text', text: stdout }] };
      }
      case 'create_sticky': {
        const { title, body } = args as { title: string; body: string };
        await runAppleScript(`
          tell application "Stickies"
            make new sticky note with properties {name:"${escape(title)}", body:"${escape(body)}"}
          end tell
        `);
        return { content: [{ type: 'text', text: `Created sticky: ${title}` }] };
      }

      // 📸 Screen Capture
      case 'take_screenshot': {
        const { path: savePath, interactive = false, type = 'screen' } = args as any;
        let cmd = 'screencapture';
        if (interactive) cmd += ' -i';
        if (type === 'window') cmd += ' -w';
        if (type === 'selection') cmd += ' -s';
        const outPath = savePath || path.join(os.homedir(), 'Desktop', `screenshot-${Date.now()}.png`);
        cmd += ` "${outPath}"`;
        await execAsync(cmd);
        return { content: [{ type: 'text', text: `Screenshot saved to: ${outPath}` }] };
      }

      // 🖱️ UI Automation
      case 'click_at': {
        const { x, y } = args as { x: number; y: number };
        await runAppleScript(`tell application "System Events" to click at {${x}, ${y}}`);
        return { content: [{ type: 'text', text: `Clicked at (${x}, ${y})` }] };
      }
      case 'type_text': {
        const { text } = args as { text: string };
        await runAppleScript(`tell application "System Events" to keystroke "${escape(text)}"`);
        return { content: [{ type: 'text', text: `Typed text` }] };
      }
      case 'press_key': {
        const { key, modifiers = [] } = args as { key: string; modifiers: string[] };
        const modStr = modifiers.length ? ` using {${modifiers.join(', ')}}` : '';
        const code = KEY_CODES[key.toLowerCase()];
        if (code !== undefined) {
          await runAppleScript(`tell application "System Events" to key code ${code}${modStr}`);
        } else {
          await runAppleScript(`tell application "System Events" to keystroke "${escape(key)}"${modStr}`);
        }
        return { content: [{ type: 'text', text: `Pressed key: ${key}` }] };
      }
      case 'list_windows': {
        const stdout = await runAppleScript(`
          tell application "System Events"
            set output to ""
            repeat with p in every process whose background only is false
              try
                set winCount to count of windows of p
                if winCount > 0 then
                  set output to output & (name of p) & "|" & winCount & "\\n"
                end if
              end try
            end repeat
            return output
          end tell
        `);
        const windows = stdout.split('\n').filter(Boolean).map(line => {
          const [app, count] = line.split('|');
          return { app, windowCount: parseInt(count) };
        });
        return { content: [{ type: 'text', text: JSON.stringify(windows, null, 2) }] };
      }
      case 'focus_app': {
        const { name } = args as { name: string };
        await runAppleScript(`tell application "System Events" to set frontmost of process "${escape(name)}" to true`);
        return { content: [{ type: 'text', text: `Focused app: ${name}` }] };
      }
      case 'get_window_position': {
        const { app, windowIndex = 1 } = args as { app: string; windowIndex: number };
        const stdout = await runAppleScript(`
          tell application "System Events"
            tell process "${escape(app)}"
              try
                set w to window ${windowIndex}
                set p to position of w
                set s to size of w
                return (item 1 of p) & "|" & (item 2 of p) & "|" & (item 1 of s) & "|" & (item 2 of s)
              end try
            end tell
          end tell
        `);
        const [x, y, w, h] = stdout.split('|');
        return { content: [{ type: 'text', text: JSON.stringify({ x: parseInt(x), y: parseInt(y), width: parseInt(w), height: parseInt(h) }, null, 2) }] };
      }
      case 'resize_window': {
        const { app, x, y, width, height, windowIndex = 1 } = args as any;
        await runAppleScript(`
          tell application "System Events"
            tell process "${escape(app)}"
              try
                set position of window ${windowIndex} to {${x || 0}, ${y || 0}}
                set size of window ${windowIndex} to {${width}, ${height}}
              end try
            end tell
          end tell
        `);
        return { content: [{ type: 'text', text: `Resized ${app} window to ${width}x${height}` }] };
      }

      // 📍 Location
      case 'get_current_location': {
        const locBin = path.join(__dirname, 'location');
        try {
          if (fs.existsSync(locBin)) {
            const { stdout } = await execAsync(locBin);
            const data = JSON.parse(stdout);
            if (!data.error) {
              return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
          }
        } catch {}
        try {
          const { stdout } = await execAsync(`/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I | grep -E '^[[:space:]]*SSID' | awk '{print $2}'`);
          const ssid = stdout.trim();
          const { stdout: ipInfo } = await execAsync(`curl -s https://ipapi.co/json/ 2>/dev/null || echo '{}'`);
          const geo = JSON.parse(ipInfo);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                source: 'wifi_ip',
                ssid: ssid || null,
                ip_location: geo.city ? `${geo.city}, ${geo.region}, ${geo.country_name}` : null,
                latitude: geo.latitude || null,
                longitude: geo.longitude || null,
              }, null, 2),
            }],
          };
        } catch {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Could not determine location' }, null, 2) }] };
        }
      }

      // 🖼️ Photos
      case 'search_photos': {
        const { query, limit = 10 } = args as { query: string; limit: number };
        const stdout = await runAppleScript(`
          tell application "Photos"
            set output to ""
            set matchingPhotos to (every media item whose name contains "${escape(query)}")
            set mCount to count of matchingPhotos
            if mCount > ${limit} then set mCount to ${limit}
            repeat with i from 1 to mCount
              set p to item i of matchingPhotos
              set output to output & (id of p) & "|" & (name of p) & "|" & (date of p as string) & "\\n"
            end repeat
            return output
          end tell
        `);
        const photos = stdout.split('\n').filter(Boolean).map(line => {
          const [id, name, date] = line.split('|');
          return { id, name, date };
        });
        return { content: [{ type: 'text', text: JSON.stringify(photos, null, 2) }] };
      }
      case 'get_recent_photos': {
        const { limit = 10 } = args as { limit: number };
        const stdout = await runAppleScript(`
          tell application "Photos"
            set output to ""
            set recentItems to (every media item whose visible is true)
            set mCount to count of recentItems
            if mCount > ${limit} then set mCount to ${limit}
            repeat with i from 1 to mCount
              set p to item i of recentItems
              set output to output & (id of p) & "|" & (name of p) & "|" & (date of p as string) & "\\n"
            end repeat
            return output
          end tell
        `);
        const photos = stdout.split('\n').filter(Boolean).map(line => {
          const [id, name, date] = line.split('|');
          return { id, name, date };
        });
        return { content: [{ type: 'text', text: JSON.stringify(photos, null, 2) }] };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }
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
  captureEvent('mcp_started').catch(console.error);

  // ponytail: warm up slow-starting apps in background at init so first tool call isn't cold.
  // Notes and Reminders take 15-40s to launch headlessly; open them now, don't wait.
  const warmUp = (app: string) =>
    exec(`osascript -e 'tell application "${app}" to get name'`, () => {});
  warmUp('Notes');
  warmUp('Reminders');
}

run().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});
