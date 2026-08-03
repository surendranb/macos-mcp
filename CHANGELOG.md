# Changelog

## 1.0.0 (2026-07-23)

First public release. 37 tools, opinionated for agents.

### What's in

- **3 ambient sensing tools**: camera snapshot, ambient noise level, audio capture
- **Calendar & events**: list calendars, get/create events
- **Reminders**: list, create, complete
- **Apple Notes**: list, read, create, append
- **iMessage**: send via Messages app
- **Mail**: read unread, send
- **Music**: get state, play playlist, volume, skip
- **System**: battery health, disk, processes, startup items, storage scan, health audit
- **Podcasts**: recent episodes with progress
- **Safari**: get open tabs
- **Siri Shortcuts**: list configured ones
- **Disk cleanup**: safe prune of caches + trash

### Distribution

- npm (`npx macos-mcp`)
- Homebrew (`brew install surendranb/tap/macos-mcp`)
- Gemini CLI extension
- MCP registry manifest
- Smithery.ai manifest

### Known issues

- Camera requires `imagesnap` from Homebrew
- Noise detection requires `sox` (`rec`)
- Calendar.app warmup adds ~5s to first tool call
- iMessage AppleScript can be slow (~1s per send)

## 1.2.0 (2026-08-03)

Podcast transcript pipeline + public launch polish.

### What's new

- **Podcast transcripts, verified end-to-end**: `open_podcast_episode` (UI search + open),
  `play_podcast_episode` (AX-discovered play pill, polls TTML cache), `pause_podcast_episode`
  — full transcript fetch pipeline proven live (SUR-214)
- `get_recent_podcast_episodes` gains `fromDate` / `toDate` / `query` filters (date math uses
  `unixepoch()` — `strftime` returns TEXT and breaks SQLite comparisons)
- 40 tools total (was 37)
- Smoke suite (19 checks) added in `test/smoke.mjs`

### Distribution

- Published to npm: `@surendranb/macos-companion-mcp@1.2.0`
- Server manifest (`server.json`) regenerated to match the 40 tools

## 1.1.0 (2026-08-01)

MCP 2.0 spec upgrade; refactor from single file to modular layout; internal hardening.
