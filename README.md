# macOS Companion MCP Server

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/surendranb/macos-companion-mcp)
[![npm version](https://img.shields.io/npm/v/@surendranb/macos-companion-mcp)](https://www.npmjs.com/package/@surendranb/macos-companion-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes granular macOS system, media, and application tools for AI agents. Control your Mac through AppleScript, shell commands, and native macOS APIs — all over a standard MCP interface.

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **macOS** (Apple Silicon or Intel)
- macOS **full disk access** for Terminal/IDE (System Settings → Privacy & Security → Full Disk Access)

### Install via npm

```bash
npm install -g @surendranb/macos-companion-mcp
```

### Or from source

```bash
git clone https://github.com/surendranb/macos-companion-mcp.git
cd macos-companion-mcp
npm install
npm run build
```

### MCP Client Configuration

Add to your MCP client config (e.g., `claude_desktop_config.json` or OpenCode `opencode.json`):

```json
{
  "mcpServers": {
    "macos-companion": {
      "command": "npx",
      "args": ["-y", "@surendranb/macos-companion-mcp"]
    }
  }
}
```

For a local build:

```json
{
  "mcpServers": {
    "macos-companion": {
      "command": "node",
      "args": ["/path/to/macos-companion-mcp/dist/index.js"]
    }
  }
}
```

---

## Features

| Category | Tools | Description |
|---|---|---|
| Calendar & Reminders | 5 | List calendars, fetch/create events, manage reminders |
| Notes | 4 | List, read, create, and update Apple Notes |
| Apple Music | 5 | Playback control, volume, track info, playlist selection |
| Mail | 6 | Send, search, read, reply, forward emails |
| Messages | 3 | Send iMessages, search conversations, read chat history |
| Browser & Shortcuts | 4 | Open URLs, list Safari tabs, run Siri Shortcuts |
| System Diagnostics | 5 | Disk usage, storage scan, battery health, startup items, health audit |
| System Maintenance | 5 | Disk cleanup, system stats, process list, kill process, restart services |
| Podcasts | 1 | Recent episodes with listening progress |
| Contacts | 1 | Search contacts by name or email |
| Clipboard | 2 | Read and write clipboard |
| Notifications | 1 | Send macOS notifications |
| System Control | 4 | Volume, sleep display, lock screen, Do Not Disturb |
| WiFi | 1 | Current SSID, signal strength, channel info |
| Maps | 2 | Search places, get directions |
| Stickies | 3 | List, read, and create Stickies notes |
| Screen Capture | 1 | Screenshots (screen, window, selection) |
| UI Automation | 7 | Click, type, press keys, list/focus/resize windows |
| Location | 1 | Approximate location from WiFi + IP geolocation |
| Photos | 2 | Search and list recent Photos library items |

**Total: 64 tools**

---

## Complete Tool Reference

### Calendar & Reminders

| Tool | Description | Required | Optional |
|---|---|---|---|
| `list_calendars` | List all calendar names | — | — |
| `get_calendar_events` | Fetch events in a time range | `from`, `to` | — |
| `create_calendar_event` | Create a new event | `calendar`, `summary`, `start`, `end` | `description`, `location` |
| `get_reminders` | Fetch active reminders | — | `list` |
| `create_reminder` | Create a new reminder | `title` | `notes`, `due`, `list` |
| `complete_reminder` | Mark a reminder completed | `id` | — |

### Notes

| Tool | Description | Required | Optional |
|---|---|---|---|
| `list_notes` | List all notes with IDs and folders | — | — |
| `get_note` | Read note body by ID | `id` | — |
| `create_note` | Create a new note | `title`, `body` | `folder` |
| `update_note` | Append content to a note | `id`, `content` | — |

### Apple Music

| Tool | Description | Required | Optional |
|---|---|---|---|
| `get_music_state` | Current playback state and track metadata | — | — |
| `play_playlist` | Play a playlist by name | `name` | — |
| `play_pause_music` | Toggle play/pause | — | — |
| `skip_music_track` | Skip to next or previous track | `direction` | — |
| `set_music_volume` | Set Music volume (0–100) | `volume` | — |

### Mail

| Tool | Description | Required | Optional |
|---|---|---|---|
| `send_email` | Compose and send via Apple Mail | `to`, `subject`, `body` | — |
| `get_unread_emails` | List recent unread emails | — | — |
| `search_emails` | Search inbox by subject or sender | `query` | `limit` |
| `get_email` | Read full email body by ID | `id` | `mailbox` |
| `reply_to_email` | Reply to a message | `id`, `body` | — |
| `forward_email` | Forward a message | `id`, `to`, `body` | — |

### Messages

| Tool | Description | Required | Optional |
|---|---|---|---|
| `send_imessage` | Send iMessage/SMS | `to`, `message` | — |
| `search_messages` | Search conversation names | `query` | `limit` |
| `get_chat_history` | Get recent messages with a contact | `contact` | `limit` |

### Browser & Shortcuts

| Tool | Description | Required | Optional |
|---|---|---|---|
| `open_url` | Open URL in default browser | `url` | — |
| `get_safari_tabs` | List all Safari tabs and URLs | — | — |
| `list_shortcuts` | List configured Siri Shortcuts | — | — |
| `run_shortcut` | Run a Siri Shortcut | `name` | `input` |

### System Diagnostics

| Tool | Description | Required | Optional |
|---|---|---|---|
| `get_disk_usage` | Disk usage statistics (`df -h`) | — | — |
| `get_storage_scan` | Deep scan: home dir sizes, caches, snapshots | — | — |
| `get_battery_health` | Cycle count, max capacity, condition | — | — |
| `get_startup_items` | LaunchAgents and login items | — | — |
| `run_health_audit` | Full audit: machine, memory, storage, thermals, battery, SSD wear, startup load | — | — |

### System Maintenance

| Tool | Description | Required | Optional |
|---|---|---|---|
| `run_disk_cleanup` | Prune caches and empty trash | `targets[]` | — |
| `get_system_stats` | CPU, memory, battery, thermals, frozen processes | — | — |
| `get_process_list` | Top processes by CPU | — | — |
| `kill_process` | Kill a process by PID or name | `pid` or `name` | — |
| `restart_service` | Restart a launchd service | `service` | — |

### Podcasts

| Tool | Description | Required | Optional |
|---|---|---|---|
| `get_recent_podcast_episodes` | Recent episodes with progress | — | `limit`, `inProgressOnly` |

### Contacts, Clipboard, Notifications

| Tool | Description | Required | Optional |
|---|---|---|---|
| `search_contacts` | Search Contacts by name or email | `query` | — |
| `get_clipboard` | Read clipboard content | — | — |
| `set_clipboard` | Write text to clipboard | `text` | — |
| `send_notification` | Send a macOS notification | `title` | `subtitle`, `body` |

### System Control

| Tool | Description | Required | Optional |
|---|---|---|---|
| `set_system_volume` | Set output volume (0–100) | `level` | — |
| `sleep_display` | Put display to sleep instantly | — | — |
| `lock_screen` | Lock the screen | — | — |
| `set_do_not_disturb` | Toggle Do Not Disturb | `enabled` | — |

### WiFi & Maps

| Tool | Description | Required | Optional |
|---|---|---|---|
| `get_wifi_info` | SSID, signal strength, channel, BSSID | — | — |
| `search_maps` | Open Apple Maps search | `query` | — |
| `get_directions` | Open directions in Apple Maps | `to` | `from`, `mode` |

### Stickies

| Tool | Description | Required | Optional |
|---|---|---|---|
| `list_stickies` | List all Stickies notes | — | — |
| `get_sticky` | Read a sticky note body | `id` | — |
| `create_sticky` | Create a new sticky note | `title`, `body` | — |

### Screen Capture

| Tool | Description | Required | Optional |
|---|---|---|---|
| `take_screenshot` | Capture screen/window/selection | — | `path`, `interactive`, `type` |

### UI Automation

| Tool | Description | Required | Optional |
|---|---|---|---|
| `click_at` | Click at screen coordinates | `x`, `y` | — |
| `type_text` | Type text at keyboard focus | `text` | — |
| `press_key` | Press a keyboard key with optional modifiers | `key` | `modifiers[]` |
| `list_windows` | List visible app windows | — | — |
| `focus_app` | Bring an app to front | `name` | — |
| `get_window_position` | Get window position and size | `app` | `windowIndex` |
| `resize_window` | Resize or reposition a window | `app`, `width`, `height` | `x`, `y`, `windowIndex` |

### Location & Photos

| Tool | Description | Required | Optional |
|---|---|---|---|
| `get_current_location` | Approximate location from WiFi + IP | — | — |
| `search_photos` | Search Photos library by keyword | `query` | `limit` |
| `get_recent_photos` | List recent photos | — | `limit` |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MACOS_MCP_TELEMETRY_OPT_IN` | (not set) | Set to `1` to enable anonymous usage telemetry |
| `POSTHOG_API_KEY` | `phc_placeholder_key` | PostHog API key for telemetry |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog host URL |

### Telemetry

Telemetry is **opt-in** and **disabled by default**. When enabled, it captures anonymous event data (tool names, agent type, OS version) to help improve the project. No personal data, file contents, or identifiable information is transmitted.

---

## Development

```bash
# Build
npm run build

# Test (spawns server, runs integration tests via MCP protocol)
npm test

# Run directly
node dist/index.js
```

### Project Structure

```
macos-companion-mcp/
├── src/
│   ├── index.ts        # MCP server + all tool definitions and handlers
│   ├── telemetry.ts    # Anonymous usage telemetry (opt-in)
│   ├── test.ts         # Integration test suite
│   └── run-once.ts     # One-shot execution helper
├── dist/               # Compiled JS output
├── package.json
├── tsconfig.json
└── README.md
```

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT © 2024 [Surendran Balachandran](https://github.com/surendranb)
