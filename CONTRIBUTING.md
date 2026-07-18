# Contributing to macOS Companion MCP Server

Thanks for wanting to contribute!

## Getting Started

1. Fork and clone the repo.
2. Run `npm install`.
3. Make your changes in `src/`.
4. Run `npm run build` to compile.
5. Run `npm test` to verify nothing is broken.

## Adding a Tool

Each tool needs two things in `src/index.ts`:

1. **Definition** — add an entry to the `TOOLS` array with `name`, `description`, and `inputSchema`.
2. **Handler** — add a `case` in the `CallToolRequestSchema` switch block with the implementation.

Prefer AppleScript for macOS app integration, shell commands for system-level operations. Keep handlers focused — one action per tool.

## Guidelines

- **No speculative abstractions.** Don't create helper modules or config files until there are at least three consumers of the same pattern.
- **Prefer native APIs.** Use `osascript`, `defaults`, `/usr/bin/*` before adding npm dependencies.
- **Error handling.** Wrap tool handlers in try/catch — the server catches and returns errors as MCP error responses. Don't crash the server.
- **Keep it simple.** A tool handler should rarely exceed 30 lines. If it does, consider whether it's doing too much.

## Code Style

- TypeScript, strict mode, `nodenext` module resolution.
- `shEscape()` for shell arguments, `escape()` for AppleScript string interpolation.
- Comments are discouraged — code should be self-documenting.

## Releasing

Maintainer only: `npm publish --access public`.
