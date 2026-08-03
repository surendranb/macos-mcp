# macOS MCP Server

> **Website:** [macos-mcp.builditwithai.xyz](https://macos-mcp.builditwithai.xyz) · **npm:** [@surendranb/macos-companion-mcp](https://www.npmjs.com/package/@surendranb/macos-companion-mcp) · **Studio:** [BuildItWithAI](https://builditwithai.xyz)

[![npm version](https://img.shields.io/npm/v/@surendranb/macos-companion-mcp)](https://www.npmjs.com/package/@surendranb/macos-companion-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@surendranb/macos-companion-mcp)](https://www.npmjs.com/package/@surendranb/macos-companion-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node version](https://img.shields.io/badge/node-%3E%3D18-green)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](src/index.ts)
[![MCP Compatible](https://img.shields.io/badge/MCP-2.0%20Compatible-blueviolet)](https://modelcontextprotocol.io)

## What is this?

**macOS MCP Server** (npm package: `@surendranb/macos-companion-mcp`) is a local
[Model Context Protocol](https://modelcontextprotocol.io) server that gives AI agents read/write
access to your Mac. It exposes **40 MCP tools** for Apple Calendar, Apple Notes, Apple Reminders,
Apple Mail, iMessage, Apple Music, Apple Podcasts, Safari, Siri Shortcuts, camera, microphone, and
system monitoring — all running locally over **stdio**, with **no cloud, no API keys, no data
leaving your machine**.

It is the most direct way to give an AI assistant hands on a Mac: agents can check your calendar
before scheduling, summarize unread mail, create reminders, control music, fetch podcast
transcripts, and run health checks on your system.

**Works with:** Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, Gemini CLI, OpenCode, and
any other MCP-compatible client.

## Why a local macOS MCP server

Web agents only see the internet. A local agent should be able to check your calendar before it
schedules something, read your unread mail, glance at the battery before you leave the house, and
pull the transcript of the podcast episode you're listening to. There's no public API for any of
that — it's all AppleScript and CLI wrappers behind the curtain. This server bundles them into one
clean MCP surface, so your agent talks to your Mac the way you do.

## Install

Get started in 60 seconds:

```bash
npm install -g @surendranb/macos-companion-mcp
```

Or run it on demand — add this to any MCP client's config:

```json
{
  "mcpServers": {
    "macos": {
      "command": "npx",
      "args": ["-y", "@surendranb/macos-companion-mcp"]
    }
  }
}
```

That's it. The server announces `macOS MCP Server running on stdio` and your client picks up all
40 tools automatically. It auto-detects the calling client (Claude Code, Cursor, Gemini CLI,
Windsurf, VS Code) and logs it in telemetry.

## What you get — all 40 tools

### Apple Calendar & Reminders (6)
| tool | what it does |
|------|-------------|
| `list_calendars` | Lists your calendars |
| `get_calendar_events` | Events in a date range |
| `create_calendar_event` | Creates a new event |
| `get_reminders` | Active reminders from any list |
| `create_reminder` | New reminder with due date |
| `complete_reminder` | Marks a reminder done |

### Apple Mail & iMessage (3)
| tool | what it does |
|------|-------------|
| `get_unread_emails` | Unread Mail.app messages with details |
| `send_email` | Sends mail from your account |
| `send_imessage` | Texts via the Messages app |

### Apple Notes (4)
| tool | what it does |
|------|-------------|
| `list_notes` | All Apple Notes titles and IDs |
| `get_note` | Full note body by ID |
| `create_note` | New note in a folder |
| `update_note` | Appends content to a note |

### Apple Music (5)
| tool | what it does |
|------|-------------|
| `get_music_state` | Current track + playback position |
| `play_playlist` | Starts a playlist by name |
| `play_pause_music` | Toggles playback |
| `skip_music_track` | Next/previous track |
| `set_music_volume` | Volume 0–100 |

### Apple Podcasts (5)
| tool | what it does |
|------|-------------|
| `get_recent_podcast_episodes` | Episodes, filterable by release date and title |
| `open_podcast_episode` | Opens an episode in the Podcasts app |
| `play_podcast_episode` | Plays the episode and waits for its transcript |
| `get_podcast_transcript` | Full transcript from the local TTML cache |
| `pause_podcast_episode` | Pauses playback |

### System monitoring & control (10)
| tool | what it does |
|------|-------------|
| `get_system_stats` | CPU, memory, thermal, hung processes |
| `get_process_list` | Processes with resource usage |
| `kill_process` | Kills a process by PID or name |
| `restart_service` | Restarts a launchd service |
| `get_battery_health` | Cycle count, max capacity, condition |
| `get_disk_usage` | Disk usage statistics |
| `get_storage_scan` | Deep scan of home directory |
| `get_startup_items` | Login items + LaunchAgents |
| `run_health_audit` | Full health audit |
| `run_disk_cleanup` | Prunes caches + empties trash |

### Utilities (4)
| tool | what it does |
|------|-------------|
| `open_url` | Opens a URL in the default browser |
| `get_safari_tabs` | Open Safari tabs with URLs |
| `list_shortcuts` | Siri Shortcuts on the system |
| `run_shortcut` | Runs a shortcut with optional input |

### Sensing (3)
| tool | what it does |
|------|-------------|
| `capture_camera_snapshot` | Photo via built-in camera (base64 JPEG) |
| `get_ambient_noise` | Ambient noise level in dB |
| `capture_audio` | Records a WAV clip (up to 30s) |

## Podcast transcripts — how it works

Apple Podcasts stores full episode transcripts locally as TTML files, but only after an episode
has actually played. The verified end-to-end pipeline:

1. `get_recent_podcast_episodes` — query the local Podcasts library by date range / title. Note
   the `transcriptId` for the episode you want.
2. `open_podcast_episode` — searches the Podcasts UI and opens the episode page.
3. `play_podcast_episode` — clicks the play pill and polls the TTML cache until the transcript
   file appears (usually 2–8 seconds).
4. `get_podcast_transcript` — returns the full transcript. Already cached? It's instant.
5. `pause_podcast_episode` — stops playback.

Transcripts live in `~/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/.../TTML/`.
The cache holds only the most recent ~8 episodes — replay an older one to re-download it.

## Configuration & permissions

There's no configuration file. Just make sure macOS can reach the apps:

- **Mail / Calendar / Notes / Reminders / Messages** — launch each app once so Apple's automation
  permissions are granted. The server warms apps at startup so the first call isn't a 30-second
  cold launch.
- **Camera / Microphone** — System Settings → Privacy & Security → Camera/Microphone → allow
  Terminal (or whichever process runs the server).
- **Full Disk Access** — needed only for system-level storage scans.

## Architecture

- **Language:** TypeScript, [MCP 2.0 SDK](https://github.com/modelcontextprotocol/typescript-sdk) (`@modelcontextprotocol/server`)
- **Transport:** stdio only — no HTTP server, no network
- **Integration layer:** AppleScript (`osascript`), native CLIs (`accli`, `imagesnap`, `launchctl`, `shortcuts`), and direct reads of Apple's local databases (Podcasts)
- **Layout:** tool schemas and handlers in `src/index.ts`; startup telemetry in `src/telemetry.ts`
- **Publishing:** GitHub Actions (`release.yml`) publishes to npm on release

## Development

```bash
npm ci
npm run build          # tsc → dist/
node dist/index.js     # run the server on stdio
npm test               # smoke suite: 19 end-to-end checks against a live server
```

## FAQ

**Is this safe? Does it send my data anywhere?**
It runs entirely locally over stdio. No cloud services, no API keys, no telemetry beyond an
anonymous server-start event. All automation goes through Apple's own permission system.

**Does it work on Apple Silicon / macOS Sequoia / Sonoma?**
Yes. It uses AppleScript and Apple's CLIs, which work across Intel and Apple Silicon Macs.

**Why does the first calendar call feel slow?**
The server pre-warms Calendar, Mail, Notes, and Reminders at startup so permissions are in place
and apps are not launched cold on first use.

**Do I need to install anything else?**
Only Node.js 18+. Camera tools use `imagesnap` (Homebrew) and audio tools use `sox`/`ffmpeg` if
you want those specific tools.

**Is there an HTTP version?**
No — stdio only by design. It keeps everything local and is compatible with every MCP client.

## Links

- **Website:** https://macos-mcp.builditwithai.xyz
- **npm:** https://www.npmjs.com/package/@surendranb/macos-companion-mcp
- **Studio:** https://builditwithai.xyz
- **Issues:** https://github.com/surendranb/macos-mcp/issues

## License

MIT — Surendran Balachandran, 2026. Built at [BuildItWithAI Studio](https://builditwithai.xyz).

## Prior art

This project builds on patterns from [DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP)
(terminal + file MCP server) and the GA4 MCP distribution playbook.
