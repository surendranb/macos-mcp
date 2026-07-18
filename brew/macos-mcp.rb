class MacosMcp < Formula
  desc "A macOS MCP server organized around human productivity routines"
  homepage "https://github.com/surendranb/macos-mcp"
  url "https://github.com/surendranb/macos-mcp/archive/refs/tags/v1.0.0.tar.gz"
  license "MIT"

  depends_on "python@3.11"
  depends_on "node"

  def install
    odir = opt_prefix
    mkdir odir
    bin.install Formula["python@3.11"].opt_prefix/"bin/python3" => "macos-mcp"
    bin.install "bin/macos-mcp" => "macos-mcp"
  end

  test do
    system "#{bin}/macos-mcp", "--version"
  end
end
