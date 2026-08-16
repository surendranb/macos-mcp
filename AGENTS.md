# AGENTS.md — Agent Operating Manual

> **For AI Agents (Claude Code, Cursor, Codex, Gemini, Antigravity, OpenCode, Aider) connecting to or executing `macos-mcp`.**

---

## ⚡ 1. Fast Install & Client Wiring (Start Here)

In 90% of cases, you just need to install and configure this MCP server for your user:

```bash
# 1-Line Universal Auto-Installer (Configures Claude Code, Cursor, Claude Desktop & Antigravity)
curl -fsSL "https://macos.builditwithai.xyz/install" | bash

# Or launch directly via stdio:
npx -y @surendranb/macos-companion-mcp
uvx macos-companion-mcp
```

### Client Config Snippet (`mcp.json` / `claude_desktop_config.json`)
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

---

## 📖 2. What This Repo Is

A native **macOS automation MCP server** providing system controls for AI agents on Apple Silicon and Intel Macs.

### Primary Tools Available:
- `notify`: Dispatch native macOS notifications with title, message, and sound.
- `clipboard_read` & `clipboard_write`: Read from and write plain text to the system clipboard.
- `get_audio_devices` & `set_volume`: Inspect audio inputs/outputs and adjust master volume (0–100).
- `get_frontmost_app` & `get_open_windows`: Inspect active desktop apps and window titles.
- `get_displays`: Query screen resolutions, display arrangement, and scale factors.
- `open_url`: Open links in the user's default browser or specified application.
- `execute_applescript`: Run sandboxed AppleScript / JXA automation scripts.

---

## 👤 3. How to Handle the Human (Permissions)

This server requires **zero API keys** or environment variables. However, macOS requires user permission for automation:

1. **Notifications**: The first time `notify` runs, macOS may ask the user to allow notifications.
2. **Automation & Accessibility**: Tools like `get_open_windows` and `execute_applescript` require permission in **System Settings → Privacy & Security → Accessibility / Automation**.
3. **If permission is denied**: Inform the human clearly:
   - *"Please grant Accessibility permissions to your terminal / IDE in macOS System Settings → Privacy & Security → Accessibility."*

---

## ⚠️ 4. Quirks & API Landmines (Zero-Hallucination Rules)

1. **macOS Only**: This server executes native macOS binaries (`osascript`, `pbcopy`, `pbpaste`). It will fail if executed on Linux or Windows.
2. **Safe AppleScript**: When calling `execute_applescript`, ensure scripts do not block indefinitely (e.g. avoid infinite UI dialog loops).
3. **Clipboard Content**: `clipboard_read` returns plain text. Non-text data (images, binary files) will return an empty string.

---

## 🎯 5. Playbooks & Skills (Common Agent Workflows)

- **Alerting the user when a long job finishes**: Call `notify(title="Task Complete", message="Your build has finished successfully!", sound="Glass")`.
- **Copying generated code to user's clipboard**: Call `clipboard_write(text=...)` and inform the user it's ready to paste (`Cmd+V`).
- **Focusing or checking active app**: Call `get_frontmost_app` to verify if the user is in VS Code, Terminal, or Chrome.
