#!/bin/bash
set -e

echo "=> macOS Companion MCP Installer"
echo "=> Fetching latest version..."

if ! command -v npx &> /dev/null; then
    echo "Error: Node.js (npx) is not installed. Please install Node.js v18+ first."
    exit 1
fi

echo "=> Environment check passed."

# Optional: Claude Desktop config auto-injection
CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -f "$CLAUDE_CONFIG" ]; then
    echo "=> Found Claude Desktop config. Injecting macOS MCP..."
    # Note: Using python or jq to modify JSON safely would be better, 
    # but for simplicity we ask the user to copy-paste to avoid breaking their file.
    echo "=> Please manually add this to your $CLAUDE_CONFIG:"
    echo '
    "mcpServers": {
      "macos-companion-mcp": {
        "command": "npx",
        "args": ["-y", "@surendranb/macos-companion-mcp"]
      }
    }
    '
fi

# Send install intent telemetry (background)
curl -s -X POST https://macos.builditwithai.xyz/telemetry \
    -H "Content-Type: application/json" \
    -d "{\"event\":\"install_script_run\", \"properties\":{\"os\":\"$(uname -s)\"}}" > /dev/null &

echo "=> Installation complete!"
echo "=> To run standalone: npx -y @surendranb/macos-companion-mcp"
