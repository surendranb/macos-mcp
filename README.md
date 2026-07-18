# macos-mcp

A macOS MCP server organized around human productivity routines.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://semver.org/)
[![OpenSSF Best Practices](https://www.bestpractices.dev/assets/project-logos/lf-best-practices-badge-87e78fee7d1c4ec49b39d8e578688f6d933f615a9fcb8d1a7cb8a67836a3c841.svg)](https://www.bestpractices.dev/projects/)

## 📥 Install

Choose your preferred method:

```bash
# Homebrew (macOS native, recommended)
brew install surendranb/tap/macos-mcp

# npm (global binary)
npm install -g macos-mcp

# pip (Python package)
pip install macos-mcp

# One-line installer (detects best method automatically)
curl -fsSL https://macos-mcp.builditwithai.xyz/install.sh | sh
```

After installation, the server runs automatically when your MCP client (like OpenCode) starts. The MCP client will discover all tools through the standard MCP protocol.

## 🎯 Purpose

The first open-source MCP server deliberately organized around **human routines**:

- **Communicate** – Email, Messages, Contacts
- **Schedule & Time** – Calendar, Reminders  
- **Remember & List** – Notes, Clipboard, Search
- **Learn & Research** – News, Podcasts, Reading List
- **System** – Battery, Disk, Health
- **Ambient** – Music, Now Playing
- **Orchestrator** – Daily Brief

Instead of a flat tool list, tools are grouped by workflow context to make them discoverable and used naturally throughout the day.

## 📦 Tool Count (v1.0.0)

| Category | Tools | Focus |
|----------|-------|-------|
| Communicate | 8 | Email, Messages, Contacts |
| Schedule & Time | 6 | Calendar, Reminders, Time Blocking |
| Remember & List | 4 | Notes, Clipboard, Search |
| Learn & Research | 4 | News, Podcasts, Reading List |
| System | 3 | Battery, Disk, Health |
| Ambient | 3 | Music, Now Playing |
| Orchestrator | 1 | Daily Brief |

**Total: 29 curated productivity tools** (full 64-tool set in `dev` branch)

## 🚀 Usage

After installation, the `macos-mcp` command is available globally. Your MCP client will auto-discover the server.

### Manual Start

```bash
macos-mcp
```

The server outputs: `macOS Companion MCP Server running on stdio`

## 🧪 Testing Tools Manually

Use the MCP client's tool-calling interface, or test directly:

```bash
# List available tools
macos-mcp --list-tools

# Test calendar
curl -X POST 'http://localhost:3000' -d '{"jsonrpc":"2.0","id":1,"method":"list_calendars"}'

# Test email
curl -X POST 'http://localhost:3000' -d '{"jsonrpc":"2.0","id":2,"method":"get_unread_emails"}'
```

## 📚 Documentation

- [Tool Taxonomy](docs/tool-structure.md) – How tools are organized by routine
- [API Reference](docs/api.md) – Tool parameters and responses
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## ⚙️ Configuration

The server uses `opencode.jsonc` configuration at `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "logging": { "level": "info", "file": false },
  "rpcTransport": "stdio",
  "startupTimeout": 30000
}
```

## 📜 License

MIT © 2026 Surendran Balachandran