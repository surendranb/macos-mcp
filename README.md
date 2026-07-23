# macos-mcp

A macOS MCP server that gives AI agents access to your local system — calendar, mail, reminders, notes,
music, battery, camera, microphone, and more. All 37 tools run on stdio, no HTTP server needed.

```
npm install -g macos-mcp
```

Or add to your MCP client config:

```json
{
  "mcpServers": {
    "macos": {
      "command": "npx",
      "args": ["-y", "macos-mcp"]
    }
  }
}
```

That's it. The server announces itself as `macOS MCP Server running on stdio` and your client picks up
all 37 tools automatically.

---

## Why this exists

I got tired of agents that can only browse the web and read files. A local agent should be able to:

- Check my calendar before scheduling something
- Read my reminders and notes
- Tell me the battery level before I head out
- Take a photo for ambient health sensing
- Grab my unread email and summarize it

There's no API for this stuff — it's all AppleScript + CLI wrappers behind the curtain. This server
bundles them into a clean MCP surface so your agent talks to your Mac like a person would.

---

## What you get

All 37 tools are split into categories that map to actual use:

### Sensing (3)
| tool | what it does |
|------|-------------|
| `capture_camera_snapshot` | Takes a photo via built-in camera |
| `get_ambient_noise` | Records a short audio sample, returns dB level |
| `capture_audio` | Records a WAV clip (up to 30s) |

### Calendar & Time (5)
| tool | what it does |
|------|-------------|
| `list_calendars` | Lists your calendars |
| `get_calendar_events` | Events in a date range |
| `create_calendar_event` | Creates a new event |
| `get_recent_podcast_episodes` | Recent podcast episodes with progress |

### Communication (4)
| tool | what it does |
|------|-------------|
| `get_unread_emails` | Unread Mail.app messages |
| `send_email` | Send email |
| `send_imessage` | Send iMessage |
| `get_safari_tabs` | Open Safari tabs with URLs |

### Notes & Lists (4)
| tool | what it does |
|------|-------------|
| `list_notes` | All Apple Notes titles and IDs |
| `get_note` | Full note body by ID |
| `create_note` | New note |
| `update_note` | Append content to a note |
| `get_reminders` | Active reminders |
| `create_reminder` | New reminder |
| `complete_reminder` | Mark reminder done |

### Music (3)
| tool | what it does |
|------|-------------|
| `get_music_state` | Current track + playback position |
| `play_playlist` | Start a playlist by name |
| `set_music_volume` | Volume 0–100 |
| `skip_music_track` | Next/previous track |

### System (5)
| tool | what it does |
|------|-------------|
| `get_battery_health` | Cycle count, max capacity, condition |
| `get_disk_usage` | df + du stats |
| `get_system_stats` | CPU, memory, thermal, hung procs |
| `get_process_list` | Active processes with resource usage |
| `get_startup_items` | Login items + LaunchAgents |
| `get_storage_scan` | Deep scan of home directory |
| `run_health_audit` | Full system health check |

### Utilities (6)
| tool | what it does |
|------|-------------|
| `open_url` | Opens a URL in default browser |
| `list_shortcuts` | Siri Shortcuts on the system |
| `list_shortcuts` | Siri Shortcuts |
| `get_ambient_noise` | dB reading from mic |
| `capture_audio` | Record audio to WAV |
| `run_disk_cleanup` | Prune caches + empty trash |

---

## Agents this works with

Any MCP-compatible client: Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, Gemini CLI,
OpenCode, any custom agent harness.

The server auto-detects the calling client name (cursor, claude_code, gemini_cli, windsurf,
antigravity, vscode) and logs it in telemetry — useful for debugging who's calling what.

---

## Configuration

There's none. Just make sure the tools you need are accessible:

- **iMessage / Mail / Calendar / Notes / Reminders** — Apple apps need to have been launched
  at least once for permissions to be in place. The server warms them up at startup so the
  first call isn't a 30-second cold launch.
- **Camera / Microphone** — System Settings > Privacy & Security > Camera/Microphone.
  Grant access to Terminal (or whichever process runs the server).
- **Files/Downloads** — Some tools (storage scan) need Full Disk Access if you want to see
  system files. Otherwise they work on home directory data.

---

## What's janky

- `list_calendars` needs Calendar.app to launch headlessly on first call (the server pre-warms it).
- `send_imessage` uses AppleScript — it's reliable but slow. Expect ~1s per message.
- Camera tools use `imagesnap` from Homebrew. If you don't have it, the tool errors
  with a clear message.
- Audio tools use `rec` (sox) or `ffmpeg`. `sox` is preferred for `get_ambient_noise`.
- The storage scan trusts `du` from your shell — a symlinked `~/Desktop` pointing to
  an NFS mount will make it hang. YMMV.

---

## Running with Hermes

If you use [Hermes Agent](https://github.com/NousResearch/hermes-agent), add the server to
`~/.hermes/config.yaml` under the `mcpServers` key:

```yaml
gateway:
  mcpServers:
    macos:
      transport: http
      serverUrl: "http://localhost:18789"
```

Then `hermes gateway restart`.

---

## License

MIT. Surendran Balachandran, 2026.

---

## Prior art

This project wouldn't exist without the patterns in
[wonderwhy-er/DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP)
(terminal+file MCP) and the GA4 MCP distribution playbook.
