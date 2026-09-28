# pix-ask

Pi tool — structured questionnaire UI (`ask_user`).

## What it does

Registers the `ask_user` tool — up to 4 structured multiple-choice questions in a TUI dialog when the agent needs to resolve ambiguous requirements, instead of guessing.

- Each question: 2–4 options with labels + descriptions. Supports multi-select and markdown side-by-side previews.
- **Single-select** (no preview) → appends a "Type something." free-form row.
- **Single-select with `preview`** → skips the free-form row to fit the side-by-side layout.
- **Multi-select** → appends a "Next" row to advance.
- Non-interactive (RPC/JSON) mode falls back to text prompts.

**Away notifications** — while the dialog is open, `ask_user` holds the shared **agent-state** coordinator `blocked` (via `withAgentBlock` from [`@xynogen/pix-runtime`](https://www.npmjs.com/package/@xynogen/pix-runtime)), so a herdr pane pings an away user when a question waits.

## Install

```bash
pi install npm:@xynogen/pix-ask
```

> Bundled in [`@xynogen/pix-core`](https://www.npmjs.com/package/@xynogen/pix-core). Install it alone only if you do not use pix-core.

## Full distro

This package is part of [Pix](https://github.com/xynogen/pix-mono). The installer sets up Pi and the full distro. See [Install](https://github.com/xynogen/pix-mono#install) for the notes for each OS.

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/install.sh | sh
```

```powershell
# Windows
irm https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/install.ps1 | iex
```

## License

MIT
