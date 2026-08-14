# typed: false
# frozen_string_literal: true

# Builds macos-mcp from THIS repo's release tarball. Note: the npm package
# named "macos-mcp" belongs to a different author — this project publishes to
# npm as @surendranb/macos-companion-mcp and must never pull the unscoped name.
class MacosMcp < Formula
  desc "macOS MCP server — 40 tools for AI agents (calendar, mail, notes, music, system sensing)"
  homepage "https://github.com/surendranb/macos-mcp"
  url "https://github.com/surendranb/macos-mcp/archive/refs/tags/v1.3.1.tar.gz"
  sha256 "03f9bc90aa1484e0f58f335a671cc140effd4e5a250613b6335970ebca306f35"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "ci"
    system "npm", "run", "build"
    libexec.install "dist", "package.json", "node_modules"
    (bin/"macos-mcp").write <<~SCRIPT
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/index.js" "$@"
    SCRIPT
  end

  test do
    assert_path_exists libexec/"dist/index.js"
  end
end
