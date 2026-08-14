#!/usr/bin/env bash
set -euo pipefail

# One-line installer for macos-mcp (github.com/surendranb/macos-mcp)
# Usage: curl -fsSL https://macos-mcp.builditwithai.xyz/install.sh | sh
#
# NOTE: the npm package named "macos-mcp" is a DIFFERENT author's project.
# This project is @surendranb/macos-companion-mcp on npm.

NPM_PKG="@surendranb/macos-companion-mcp"
TAP_REPO="surendranb/macos-mcp"

if command -v brew >/dev/null 2>&1; then
  echo "🍺 Installing via Homebrew tap"
  brew tap "$TAP_REPO" "https://github.com/$TAP_REPO" 2>/dev/null || true
  brew install "$TAP_REPO/macos-mcp"
elif command -v npm >/dev/null 2>&1; then
  echo "📦 Installing via npm"
  npm install -g "$NPM_PKG"
else
  echo "❌ Neither Homebrew nor npm found. Install from source:"
  echo "   git clone https://github.com/$TAP_REPO && cd macos-mcp && npm ci && npm run build"
  exit 1
fi

if command -v macos-mcp >/dev/null 2>&1; then
  echo "✅ macos-mcp installed"
else
  echo "⚠️  Installed but 'macos-mcp' not on PATH"
fi
