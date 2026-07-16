# macos-mcp

What do you need to build an AI agent that actually understands your Mac?

You don't need another generic electron wrapper. You need raw, direct access to the native data structures already running on the machine. `macos-mcp` is a bare-metal Model Context Protocol (MCP) server that hooks your agents (OpenClaw, Claude Desktop, Cursor) directly into the underlying macOS substrate.

This is critical because context engineering is an ongoing exercise. A simple file-read tool won't help when you need to know if the CPU is throttling, what your latest podcast playback head is, or if Apple Notes is refusing to sync.

## Architecture

**Data**
- Direct SQLite reads against core databases (`MTLibrary.sqlite` for Podcasts).
- Zero bulky external dependencies or compiled node-gyp native bindings. Just raw `sqlite3` and parsing.

**Hardware / Logic**
- Execution hooks directly into AppleScript via standard input. This bypasses shell injection entirely.
- Slices through system diagnostics: thermal pressure (`pmset`), memory pressure, launch agents, and battery health (`system_profiler`).

**The Tools**

It exposes a granular toolset to the agent layer:
- **System Health:** `run_health_audit`, `get_battery_health`, `get_storage_scan`, `get_startup_items`
- **Native Apps:** `list_calendars`, `get_calendar_events`, `create_reminder`, `get_note`, `send_imessage`
- **Media / Web:** `get_music_state`, `get_safari_tabs`, `get_recent_podcast_episodes`
- **Admin:** `run_disk_cleanup`, `kill_process`, `restart_service`, `run_shortcut`

## Design Rules

1. **Zero Sloppy Abstractions:** We hit `/usr/bin/shortcuts` explicitly. No PATH collisions with python environments.
2. **Fire and Forget Warmups:** Notes and Reminders have aggressive cold-start times. We background `osascript` calls at startup to warm the process memory.
3. **Local Only:** All processing stays on the machine.

## Installation

Clone it, build it, and point your MCP config at it.

```bash
git clone https://github.com/surendranb/macos-mcp.git
cd macos-mcp
npm install
npm run build
```

Then add to your `mcp_config.json`:
```json
"macos-companion-mcp": {
  "command": "node",
  "args": ["/absolute/path/to/macos-mcp/dist/index.js"]
}
```

## Testing

A regular laptop combined with basic testing harnesses is enough. Run `npm run test` to spin up a headless stdio test suite that probes the endpoints and outputs a clean success dashboard.

## What comes next

Right now, `macos-mcp` handles extraction and basic manipulation. Next, we extend this to deeper system-level observability, pushing structured logs directly to OpenClaw.
