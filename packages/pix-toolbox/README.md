# pix-toolbox

Pi tool — gated tool toggle UI (`/toolbox`).

## What it does

Registers a `/toolbox` slash command — a TUI fuzzy-search picker listing every registered tool (built-in, extension, MCP). Toggle tools on/off to control which are described in the system prompt via `pi.setActiveTools()`.

- Toggling only affects **prompt visibility** — all tools stay callable via their function definitions.
- Four tools (`bash`, `edit`, `read`, `write`) are protected and can't be disabled.
- Gate state persists to `~/.pi/agent/toolbox.json` as `disabledTools` — only the tools you turn off. A newly installed tool is active by default. The file does not exist until you disable a tool. A legacy `enabledTools` file is migrated on the next session start.
- Headless subcommands: `/toolbox enable <names>`, `/toolbox disable <names>`, `/toolbox list [query]`.

## Install

```bash
pi install npm:@xynogen/pix-toolbox
```

> Standalone/opt-in — **not** bundled by [`@xynogen/pix-core`](https://www.npmjs.com/package/@xynogen/pix-core). A power-user tool-toggle UI, installed only if you want it.

## Full distro

Source: [github.com/xynogen/pix-mono](https://github.com/xynogen/pix-mono)

To install the complete pix suite (all packages + Pi itself):

```bash
curl -fsSL https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/install.sh | sh
```

## License

MIT
