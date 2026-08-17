---
layout: layout.njk
title: "macOS Companion MCP Server"
description: "Native macOS companion MCP server for AI agents: system control, clipboard management, notifications, audio devices, and workspace automation."
kicker: "NATIVE SYSTEM CONTROL MCP"
subkicker: "macOS Automation Bridge"
header_badge: "Native macOS Bridge · 40+ Tools · AppleScript/JXA · Zero Cloud"
lede: "Why should an AI agent running on your Mac be trapped in a text box? macOS Companion connects Claude, Cursor, and terminal agents directly to the native macOS operating system—allowing them to read the clipboard, dispatch system alerts, control audio, inspect active windows, and execute sandboxed AppleScript/JXA automations."
chips:
  - "MCP 2.0"
  - "TypeScript & Node"
  - "AppleScript & JXA"
  - "PyPI & npm"
  - "Zero Cloud Leakage"
toc:
  - id: "quickstart"
    title: "1. Universal 1-Line Quickstart"
  - id: "the-bridge"
    title: "2. The Native macOS Bridge"
  - id: "agent-setup"
    title: "3. Agent & IDE Configuration"
  - id: "tools-reference"
    title: "4. Tool & Parameter Reference"
  - id: "automation-examples"
    title: "5. Real-World Automations"
---

<section id="quickstart" class="space-y-6">
<div class="kicker">01 / Getting Started</div>

## Universal 1-Line Quickstart

Install and run `macos-companion` across any modern agent runtime:

```bash
# ⚡ 1-Line Universal Installer (Auto-configures Claude Code, Cursor & Claude Desktop)
curl -fsSL https://macos-mcp.builditwithai.xyz/install | bash

# 📦 Run directly via Node (npx)
npx -y @surendranb/macos-companion-mcp

# 🐍 Run directly via Python (uvx)
uvx macos-companion-mcp
```

</section>

---

<section id="the-bridge" class="space-y-6">
<div class="kicker">02 / Architecture</div>

## The Native macOS Bridge

Instead of brittle UI accessibility scraping, `macos-companion` interfaces directly with core macOS frameworks and runtime bridges:

<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
<div class="p-4 bg-[#fbfbfa] rounded-lg border border-[#e5e6e4] space-y-1.5">
<b>1. 📋 Clipboard &amp; Notification Daemon</b>
<p class="text-[#747982] leading-relaxed !mb-0">Direct <code>pbcopy</code>/<code>pbpaste</code> system integration and native <code>UserNotifications</code> alerts with custom sound cues and action titles.</p>
</div>
<div class="p-4 bg-[#fbfbfa] rounded-lg border border-[#e5e6e4] space-y-1.5">
<b>2. 🪟 Window &amp; Workspace Inspector</b>
<p class="text-[#747982] leading-relaxed !mb-0">Queries active frontmost application bundle IDs, visible window coordinates, and multi-monitor display resolutions via Quartz Window Services.</p>
</div>
<div class="p-4 bg-[#fbfbfa] rounded-lg border border-[#e5e6e4] space-y-1.5">
<b>3. 🔊 CoreAudio Device Control</b>
<p class="text-[#747982] leading-relaxed !mb-0">Inspects connected microphones, audio outputs, and adjusts hardware output volumes programmatically.</p>
</div>
<div class="p-4 bg-[#fbfbfa] rounded-lg border border-[#e5e6e4] space-y-1.5">
<b>4. ⚡ AppleScript &amp; JXA Runtime</b>
<p class="text-[#747982] leading-relaxed !mb-0">Executes arbitrary sandboxed AppleScript and JavaScript for Automation (JXA) to control Mail, Calendar, Notes, and Finder.</p>
</div>
</div>

</section>

---

<section id="agent-setup" class="space-y-6">
<div class="kicker">03 / Agent Integration</div>

## Agent &amp; IDE Configuration

### Claude Code CLI
```bash
claude mcp add macos-companion -- npx -y @surendranb/macos-companion-mcp
```

### Cursor &amp; Google Antigravity (`mcp.json`)
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

### Claude Desktop (`claude_desktop_config.json`)
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

</section>

---

<section id="tools-reference" class="space-y-6">
<div class="kicker">04 / API Reference</div>

## Tool &amp; Parameter Reference

| Tool Name | Parameters | Description | Return Type |
|:---|:---|:---|:---|
| `notify` | `title`, `message`, `sound` | Dispatches native macOS desktop notifications with alert sounds. | `JSON` |
| `clipboard_read` | *(none)* | Reads current plain text contents from the system clipboard. | `string` |
| `clipboard_write` | `text` | Writes text directly to the macOS system clipboard. | `JSON` |
| `get_audio_devices` | *(none)* | Lists available audio input/output devices and current volume level. | `JSON` |
| `set_volume` | `volume` (0-100) | Adjusts macOS system output volume. | `JSON` |
| `get_frontmost_app` | *(none)* | Returns the active, focused desktop application name and bundle ID. | `JSON` |
| `get_open_windows` | *(none)* | Lists visible application window titles and coordinates. | `JSON` |
| `get_displays` | *(none)* | Returns connected monitor resolutions, scaling, and display arrangements. | `JSON` |
| `open_url` | `url` | Opens a URL in the user's default browser or specific application. | `JSON` |
| `execute_applescript` | `script` | Runs sandboxed AppleScript / JXA automation commands safely. | `JSON` |

</section>

---

<section id="automation-examples" class="space-y-6">
<div class="kicker">05 / Real-World Flows</div>

## Real-World Automations

Agents can orchestrate desktop workflows seamlessly in a single conversation turn:

```bash
# 1. Inspect focused editor context
macos.get_frontmost_app()

# 2. Copy refactored code directly to system clipboard
macos.clipboard_write(text="export const config = { ... };")

# 3. Fire sound-enabled desktop notification when background build finishes
macos.notify(
  title="Build Complete",
  message="All unit tests passed on Apple Silicon.",
  sound="Hero"
)
```

</section>
