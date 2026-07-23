# typed: false
# frozen_string_literal: true

class MacosMcp < Formula
  desc "macOS MCP server — 37 tools for AI agents (calendar, mail, notes, music, system sensing)"
  homepage "https://github.com/surendranb/macos-mcp"
  url "https://registry.npmjs.org/macos-mcp/-/macos-mcp-1.0.0.tgz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "MIT"

  depends_on "node" => ">=18"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "macOS MCP Server", shell_output("#{bin}/macos-mcp --version 2>&1")
  end
end
