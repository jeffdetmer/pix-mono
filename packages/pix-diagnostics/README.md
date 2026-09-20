# pix-diagnostics

Pi extension — an LSP client for project-selected language servers.

## What it does

- Reads language-server choices from `<project>/.pi/lsp.json`.
- Starts a configured server only when a visible tool call needs it.
- Reports diagnostics through `lens_diagnostics`.
- Supports definition, references, hover, symbols, rename preview, and call hierarchy through `lsp_navigation`.
- Shows the effective project setup through `effective_config`.

Pix does not bundle, install, or select language servers. Use the `lsp` skill to
choose a server for the project. The project owns the server and its version.

## Project configuration

```json
{
  "servers": {
    "python": {
      "command": "pyright-langserver",
      "args": ["--stdio"],
      "extensions": [".py", ".pyi"],
      "languageId": "python",
      "rootMarkers": ["pyproject.toml", ".git"]
    }
  }
}
```

Required fields: `command`, `extensions`, and `languageId`. Optional fields:
`args`, `filenames`, and `rootMarkers`.

## Install

```bash
pi install npm:@xynogen/pix-diagnostics
```

The package is also included in `@xynogen/pix-core`.

## License

MIT
