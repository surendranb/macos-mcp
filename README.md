<p align="center">
  <img src="https://raw.githubusercontent.com/modelcontextprotocol/logo/main/mcp-logo-dark.svg" alt="MCP Logo" width="120" />
</p>

# macOS Companion MCP Server 💻

[![GitHub stars](https://img.shields.io/github/stars/surendranb/macos-mcp?style=social)](https://github.com/surendranb/macos-mcp/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The Local Bridge Between AI Agents and the macOS Substrate.**

You don't need another generic electron wrapper. You need raw, direct access to the native data structures already running on your machine. `macos-mcp` is a bare-metal Model Context Protocol (MCP) server that hooks your agents (OpenClaw, Claude Desktop, Cursor) directly into native macOS services, media, and system administration utilities. 

This is critical because context engineering is an ongoing exercise. A simple file-read tool won't help when you need to know if the CPU is throttling, what your latest podcast playback head is, or if Apple Notes is refusing to sync.

---

## 🎯 The Toolset

Highly granular tools exposed directly to your agent layer:

| Domain | Tools | Actionable Intel Provided |
| :--- | :--- | :--- |
| **System Health** | `run_health_audit`, `get_battery_health`, `get_storage_scan`, `get_startup_items` | **Machine Intel.** Deep dive into thermal pressure, cycle counts, memory swaps, and local Time Machine snapshots. |
| **Native Apps** | `list_calendars`, `get_calendar_events`, `create_reminder`, `get_note`, `send_imessage` | **Productivity.** Headless access to Reminders, Notes, and Calendar without UI bloat. |
| **Media / Web** | `get_music_state`, `get_safari_tabs`, `get_recent_podcast_episodes` | **Context.** Directly reads `MTLibrary.sqlite` to find exact podcast listening playback heads. |
| **Admin** | `run_disk_cleanup`, `kill_process`, `restart_service`, `run_shortcut` | **Control.** Triggers native `/usr/bin/shortcuts` and clears DerivedData or user caches safely. |

---

## 🚀 Getting Started

### 1. Installation

Clone it, build it, and point your MCP config at the `dist/index.js` file.

```bash
git clone https://github.com/surendranb/macos-mcp.git
cd macos-mcp
npm install
npm run build
```

### 2. Configuration (Claude Desktop / Cursor)

Add the server to your agent's MCP settings configuration file:

```json
{
  "mcpServers": {
    "macos-companion-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/macos-mcp/dist/index.js"]
    }
  }
}
```

*Note: Replace `/absolute/path/to/` with the actual path to where you cloned the repository.*

---

## 🛠️ Project Philosophy (The "Anti-Slop" Rules)

This project focuses on **bare-metal efficiency** for local AI agents:
1. **Zero Sloppy Abstractions:** We hit `/usr/bin/shortcuts` explicitly. No PATH collisions with python environments.
2. **No Bulky SQLite Bindings:** The server executes queries against local databases using macOS's built-in `sqlite3` command-line utility. This prevents heavy native compilation failures of `node-sqlite` packages on Apple Silicon.
3. **Fire and Forget Warmups:** Notes and Reminders have aggressive headless cold-start times. We background `osascript` calls at startup to warm the process memory so the agent isn't left waiting.
4. **Local Only:** All processing stays on the machine.

---

## 🧪 Testing

A regular laptop combined with basic testing harnesses is enough. Run `npm run test` to spin up a headless stdio test suite that probes the endpoints and outputs a clean success dashboard.

## License
MIT License
