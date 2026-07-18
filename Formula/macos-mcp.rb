class MacosMcp < Formula
  desc "Local Bridge Between AI Agents and the macOS Substrate"
  homepage "https://macos.builditwithai.xyz"
  url "https://github.com/surendranb/macos-mcp/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "REPLACE_WITH_SHA256"
  license "ISC"

  depends_on "node"

  def install
    system "npm", "install"
    system "npm", "run", "build"
    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/index.js" => "macos-companion-mcp"
  end

  test do
    system "#{bin}/macos-companion-mcp", "--help"
  end
end
