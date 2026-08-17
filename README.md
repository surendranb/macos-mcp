# macOS Companion MCP Server 🍏

> **Native macOS Companion MCP server for AI agents: system control, clipboard management, desktop notifications, audio devices, and workspace automation.**

[![CI](https://github.com/surendranb/macos-companion-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/surendranb/macos-companion-mcp/actions)
[![npm version](https://img.shields.io/npm/v/@surendranb/macos-companion-mcp.svg?style=flat-square&color=red)](https://www.npmjs.com/package/@surendranb/macos-companion-mcp)
[![PyPI version](https://img.shields.io/pypi/v/macos-companion-mcp.svg?style=flat-square&color=blue)](https://pypi.org/project/macos-companion-mcp/)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/surendranb/macos-companion-mcp/badge)](https://scorecard.dev/viewer/?site=github.com/surendranb/macos-companion-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

🌐 **Live Documentation & Web Portal**: [https://macos.builditwithai.xyz](https://macos.builditwithai.xyz)

---

## ⚡ Quickstart

```bash
# 1-Line Universal Installer (Auto-configures Claude Code, Cursor, Claude Desktop & Antigravity)
curl -fsSL "https://macos.builditwithai.xyz/install" | bash

# Or run directly via your preferred runtime:
npx -y @surendranb/macos-companion-mcp
uvx macos-companion-mcp
```

---

## 🤖 Client Setup

### A. Claude Code (CLI)
```bash
claude mcp add macos-companion -- npx -y @surendranb/macos-companion-mcp
```

### B. Cursor & Google Antigravity (`mcp.json`)
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

### C. Claude Desktop (`claude_desktop_config.json`)
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

### D. Python UVX Alternative
```json
{
  "mcpServers": {
    "macos-companion": {
      "command": "uvx",
      "args": ["macos-companion-mcp"]
    }
  }
}
```

---

## 🛠️ Tools & Capabilities

| Tool Name | Parameters | Description | Return Type |
|---|---|---|---|
| `notify` | `title` (string), `message` (string), `sound` (optional) | Dispatches native macOS desktop notifications with alert sounds. | `JSON` |
| `clipboard_read` | *(none)* | Reads current plain text contents from the system clipboard. | `string` |
| `clipboard_write` | `text` (string) | Writes text directly to the macOS system clipboard. | `JSON` |
| `get_audio_devices` | *(none)* | Lists available audio input/output devices and current volume level. | `JSON` |
| `set_volume` | `volume` (0-100) | Adjusts macOS system output volume. | `JSON` |
| `get_frontmost_app` | *(none)* | Returns the active, focused desktop application name and bundle ID. | `JSON` |
| `get_open_windows` | *(none)* | Lists visible application window titles and coordinates. | `JSON` |
| `get_displays` | *(none)* | Returns connected monitor resolutions, scaling, and display arrangements. | `JSON` |
| `open_url` | `url` (string) | Opens a URL in the user's default browser or specific application. | `JSON` |
| `execute_applescript` | `script` (string) | Runs sandboxed AppleScript / JXA automation commands safely. | `JSON` |
| `skill_read` | `skill_name` (string) | Loads macOS automation playbooks dynamically from GitHub. | `Markdown` |
| `skills_list` | *(none)* | Lists all available macOS automation skills. | `JSON` |

---

## 🔒 Telemetry & Privacy

This package collects anonymous, non-PII diagnostic telemetry (command executions, latency, error codes) to improve tool reliability. No clipboard contents, notification text, personal data, source code, or environment variables are ever collected or stored.

You can opt out anytime by setting either of the following environment variables:
```bash
export DO_NOT_TRACK=1
# or
export MCP_TELEMETRY_OPT_OUT=1
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
