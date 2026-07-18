#!/usr/bin/env bash
set -euo pipefail

# One-line installer for macos-mcp
# Usage: curl -fsSL https://macos-mcp.builditwithai.xyz/install.sh | sh

REPO="surendranb/macos-mcp"
BINARY="macos-mcp"
INSTALL_DIR="${HOME}/.local/bin"

echo "📦 Installing $BINARY..."

# Detect package manager
if command -v brew >/dev/null 2>&1; then
  echo "🍺 Using Homebrew"
  brew install "$REPO"/tap/"$BINARY"
elif command -v npm >/dev/null 2>&1; then
  echo "📦 Using npm"
  npm install -g "$BINARY"
elif command -v pip >/dev/null 2>&1; then
  echo "🐍 Using pip"
  pip install "$BINARY"
else
  echo "❌ No supported package manager found (brew, npm, pip)"
  exit 1
fi

# Verify
if command -v "$BINARY" >/dev/null 2>&1; then
  echo "✅ $BINARY installed successfully"
  "$BINARY" --version 2>/dev/null || true
else
  echo "⚠️  Installed but '$BINARY' not on PATH"
fi
