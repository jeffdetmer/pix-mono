# pix-footer

Pi extension — status bar footer.

## What it does

Renders a persistent status bar at the bottom of the Pi TUI, showing:

- Current mode.
- Working directory with git branch (dirty/ahead/behind markers).
- Session token counts (in/out), context usage %, session cost, active model.
- Live tokens-per-second (TPS) during streaming, held 4s after the turn ends.
- Extension statuses (e.g. plan mode) as right-side segments.

Model spec (context window, pricing) comes from `~/.cache/pi/models-dev.json` via `pix-data`.

## Install

```bash
pi install npm:@xynogen/pix-footer
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
