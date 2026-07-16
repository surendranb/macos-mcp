# macOS Companion MCP Server (`macos-companion-mcp`)

A unified, comprehensive, and highly granular Model Context Protocol (MCP) server for macOS. It acts as a local bridge between AI agents (such as OpenClaw, Claude Desktop, Cursor, and Windsurf) and native macOS services, media, and system administration utilities.

By packaging these functionalities into a single-process local server, it eliminates context bloat (exposing only what is needed) and bypasses command-line execution approval prompts in agents.

---

## 🚀 Features & Tools

### 📅 Calendar & Reminders
*   `list_calendars`: List all calendar names in Apple Calendar.
*   `get_calendar_events`: Query calendar events for a range (wraps `accli`).
*   `create_calendar_event`: Create an event (wraps `accli`).
*   `get_reminders`: Fetch active reminders, optionally filtering by list.
*   `create_reminder`: Create a reminder with notes and due dates.
*   `complete_reminder`: Mark a reminder as completed.

### 📝 Apple Notes
*   `list_notes`: List titles, IDs, and folders of notes.
*   `get_note`: Fetch a note's HTML/text body by ID.
*   `create_note`: Create a note.
*   `update_note`: Append text to an existing note.

### 🎙️ Apple Podcasts
*   `get_recent_podcast_episodes`: Queries the local Podcasts sqlite database (`MTLibrary.sqlite`) directly to extract show subscriptions, release dates, and exact listening playback heads (`ZPLAYHEAD` and `ZDURATION`).

### 🎵 Apple Music
*   `get_music_state`: Get volume, playback state, and current track metadata (name, artist, album, duration, play position).
*   `play_playlist`: Play a playlist by name.
*   `play_pause_music`: Play/pause track.
*   `skip_music_track`: Next/previous track.
*   `set_music_volume`: Adjust volume (0–100).

### ✉️ Mail & Messages
*   `send_email`: Send an email via Apple Mail.
*   `get_unread_emails`: Retrieve unread email details from your inbox.
*   `send_imessage`: Send text/SMS via Apple Messages.

### 🌐 Safari & Shortcuts
*   `open_url`: Open a link in your default browser.
*   `get_safari_tabs`: List active Safari tab URLs and titles.
*   `list_shortcuts`: Lists your Siri Shortcuts (using native `/usr/bin/shortcuts`).
*   `run_shortcut`: Run any native Siri Shortcut by name.

### 💾 System Diagnostics & Maintenance
*   `get_disk_usage`: Fetch disk space stats (`df -h`).
*   `run_disk_cleanup`: Safely empty trash, clean Xcode DerivedData, and wipe caches.
*   `get_system_stats`: Read CPU load, memory pressure, battery cycle health, thermal state, and frozen processes.
*   `get_process_list`: List top active processes.
*   `kill_process`: Kill a process by name or PID.
*   `restart_service`: Restart a macOS `launchd` service using `launchctl`.

---

## ⚙️ Design Decisions (Ponytail Style)
1.  **No Bulky SQLite Bindings:** The server executes queries against the Podcasts database `MTLibrary.sqlite` using macOS's built-in `sqlite3` command-line utility via `child_process.exec`. This prevents heavy native compilation failures of node-sqlite packages on macOS M-series chips.
2.  **Absolute Paths for Siri Shortcuts:** The code explicitly calls `/usr/bin/shortcuts` instead of `shortcuts` to prevent path collisions with Python package managers that may override the command name.
3.  **Clean Stdio Communication:** Built entirely using Node's standard Objective-C/AppleScript capabilities via `osascript` fed directly to standard input to eliminate character escaping/shell injection vulnerabilities.

---

## 🔧 Installation & Build

1.  **Clone/Initialize Workspace:**
    ```bash
    cd /Users/surendran/Projects/macos-mcp
    npm install
    ```
2.  **Build TypeScript:**
    ```bash
    npm run build # compiles to dist/
    ```

To add this script to your `package.json`:
```json
"scripts": {
  "build": "tsc",
  "test": "node dist/test.js"
}
```

---

## 🧪 Testing

The repository contains an automated integration test suite that spawns the compiled server, initiates an MCP Stdio session, feeds it JSON-RPC tool calls, and validates the outputs in a **Success Dashboard**.

Run the tests:
```bash
npm run build && npm run test
```

### Dashboard Sample:
```
┌────────────────────────────────────────────────────────┐
│           macOS Companion MCP Test Suite               │
└────────────────────────────────────────────────────────┘

 Running: List Available Tools               ... [PASS]
 Running: Get System Diagnostics             ... [PASS]
 Running: Get Disk Usage                     ... [PASS]
 Running: Get Recent Podcasts                ... [PASS]
 Running: List Siri Shortcuts                 ... [PASS]

┌────────────────────────────────────────────────────────┐
│                 TEST SUCCESS DASHBOARD                 │
├──────────────────────────────────────┬──────────┬──────┤
│ ✓ List Available Tools                │     52ms │ Passed │
│ ✓ Get System Diagnostics              │    563ms │ Passed │
│ ✓ Get Disk Usage                      │     52ms │ Passed │
│ ✓ Get Recent Podcasts                 │    103ms │ Passed │
│ ✓ List Siri Shortcuts                 │     51ms │ Passed │
├──────────────────────────────────────┴──────────┴──────┤
│ Score: 5/5 Tests Passed (100%)                           │
└────────────────────────────────────────────────────────┘
```
