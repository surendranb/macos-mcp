# AGENTS.md — Codebase Operational Guide for AI Agents

> **Context, architecture, file map, and execution commands for AI coding agents (Claude Code, Cursor, Codex, Gemini, Antigravity, OpenCode, Aider) working on `macos-mcp`.**

---

## 1. Codebase Overview

- **Language & Runtime**: TypeScript / Node.js 18+ (`@modelcontextprotocol/sdk`) + Python PyPI distribution bridge.
- **Package Name**: `@surendranb/macos-companion-mcp` (NPM) / `macos-companion-mcp` (PyPI binary wheel wrapper).
- **Core Function**: Provides native macOS system automation tools for AI agents: notifications, clipboard I/O, audio control, display geometry, frontmost app/window inspection, and sandboxed AppleScript/JXA execution.

---

## 2. Directory & File Map

```
macos-mcp/
├── src/
│   ├── index.ts               # Core MCP server, tool definitions, AppleScript subprocess runners
│   ├── telemetry.ts           # Non-PII Edge Schema v2 telemetry client
│   ├── run-once.ts            # CLI execution utility
│   ├── test.ts                # TypeScript integration tests
│   └── verify-all.cjs         # End-to-end verification script
├── bin/
│   └── macos-mcp              # Executable CLI launcher
├── pypi/                      # Dual-distribution PyPI wheel wrapper
│   ├── pyproject.toml         # Python packaging metadata (macos-companion-mcp)
│   └── src/macos_companion_mcp/
│       └── __init__.py        # Subprocess bridge that locates node and runs built dist/index.js
├── test/
│   └── smoke.mjs              # Node.js smoke tests
├── package.json               # NPM scripts, dependencies, build scripts
├── tsconfig.json              # TypeScript compiler configuration
├── smithery.yaml              # Smithery.ai marketplace configuration
├── server.json                # Official MCP registry specification
├── gemini-extension.json      # Google Gemini / Antigravity extension manifest
├── .claude-plugin/            # Claude Code plugin manifests (plugin.json, marketplace.json)
└── .well-known/ai-plugin.json # OpenAI / ChatGPT Actions manifest
```

---

## 3. Development & Testing Commands

```bash
# Install Node dependencies
npm install

# Compile TypeScript to JavaScript
npm run build

# Run the MCP server in stdio mode locally
node dist/index.js

# Run automated smoke test
npm test

# Run full tool verification (tests notify, clipboard, audio, displays)
node src/verify-all.cjs
```

---

## 4. Tool Implementation Invariants & Gotchas

1. **macOS System Permissions (`src/index.ts`)**:
   - `get_open_windows` and `execute_applescript` may require macOS Accessibility / Automation permissions in System Settings. Tools must handle permission denials gracefully with informative error messages instead of unhandled exceptions.
2. **Clipboard Safety**:
   - `clipboard_read` returns plain text only.
   - `clipboard_write` must sanitize strings and avoid shell injection when delegating to `pbcopy`.
3. **Dual Distribution Sync (`pypi/`)**:
   - When building a new release, `npm run build` must compile `dist/index.js` first. The PyPI wrapper packages the compiled `dist/` into the Python wheel so Python users can run `uvx macos-companion-mcp` without separate build steps.
