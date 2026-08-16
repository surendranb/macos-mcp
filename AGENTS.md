# AGENTS.md — Agent Operational Manual

> **Canonical context and operating procedures for AI agents (Claude Code, Cursor, Codex, Gemini, Antigravity, OpenCode, Aider) operating on or integrating `macos-mcp`.**

---

## 1. System Identity & Mission

- **Repository**: `surendranb/macos-mcp`
- **Package Name**: `macos-companion-mcp` (PyPI) / `@surendranb/macos-companion-mcp` (NPM)
- **Live Portal**: [https://macos.builditwithai.xyz](https://macos.builditwithai.xyz)
- **Purpose**: Native macOS Companion MCP server for AI agents: system control, clipboard, notifications, audio devices, and automation.

---

## 2. Quickstart & Invocation for Agents

Agents integrating or executing this server should use stdio transport via either runtime:

```bash
# Python runtime (FastMCP / stdio)
npx -y @surendranb/macos-companion-mcp

# Universal 1-line auto-installer
curl -fsSL "https://macos.builditwithai.xyz/install" | bash
```

### Environment Variables
- None required (Zero configuration needed).


---

## 3. Tool Reference & Capabilities

| Tool | Capability Summary |
|---|---|
| `notify` | Dispatches native macOS desktop notifications with alert sounds. |
| `clipboard_read` | Reads current plain text from clipboard. |
| `clipboard_write` | Writes text to macOS clipboard. |
| `get_audio_devices` | Lists audio devices and volume. |
| `set_volume` | Adjusts output volume. |
| `get_frontmost_app` | Returns active desktop app. |
| `get_open_windows` | Lists visible application window titles. |
| `get_displays` | Returns display resolutions and scaling. |
| `open_url` | Opens URL in browser. |
| `execute_applescript` | Runs AppleScript automation commands. |
| `skill_read` | Loads automation playbooks dynamically from GitHub. |
| `skills_list` | Lists all available macOS automation skills. |

---

## 4. Agent Working Laws (Operational Rules)

When contributing code, diagnosing bugs, or modifying this repository, all visiting agents must adhere strictly to these rules:

1. **Truth Over Guessing**: Never fabricate responses, schema types, or error reasons. Run native verification scripts before asserting completion.
2. **Shortest Working Diff (Lazy Senior Dev)**: Do not introduce unrequested abstractions, extra dependencies, or architectural bloat. Standard library and native platform features first.
3. **Preserve Schema Stability**: Never remove or rename existing MCP tool parameters without strict backwards-compatibility layers.
4. **Strict Telemetry Boundaries**: Diagnostic telemetry is non-PII and strictly opt-out. Never log user queries, credentials, file contents, or environment variables. Honor `DO_NOT_TRACK=1` and `MCP_TELEMETRY_OPT_OUT=1`.
5. **No Direct Main Commits**: Always create a feature or fix branch before modifying code.

---

## 5. Verification & Test Protocol

Before marking any task as complete in this repository, run the test suite:

```bash
# Run automated verification suite
npm test
```

---

## 6. Plugin & Marketplace Discovery Pointers

- **Claude Code**: `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
- **Gemini CLI / Antigravity**: `gemini-extension.json`
- **Smithery.ai**: `smithery.yaml`
- **Official MCP Registry & Glama**: `server.json`
- **OpenAI / ChatGPT Actions**: `.well-known/ai-plugin.json`
- **AI Search Crawlers (GEO)**: `llms.txt`
