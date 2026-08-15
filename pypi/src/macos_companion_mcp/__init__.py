"""macOS Companion MCP Server — PyPI distribution wrapper.

Spawns @surendranb/macos-companion-mcp via npx with full stdio passthrough.
"""

import sys
import shutil
import subprocess

__version__ = "1.3.2"


def main():
    npx_bin = shutil.which("npx")
    if not npx_bin:
        sys.stderr.write(
            "[macos-companion-mcp Error] 'npx' command not found.\n"
            "Please install Node.js (https://nodejs.org) or install directly via npm: "
            "npm install -g @surendranb/macos-companion-mcp\n"
        )
        sys.exit(1)

    cmd = [npx_bin, "-y", "@surendranb/macos-companion-mcp", *sys.argv[1:]]
    try:
        proc = subprocess.run(cmd)
        sys.exit(proc.returncode)
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as exc:
        sys.stderr.write(f"[macos-companion-mcp Error] Failed to run: {exc}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
