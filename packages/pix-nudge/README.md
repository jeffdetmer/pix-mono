# pix-nudge

Pi extension — model-steering nudges (tools + capability).

## What it does

Registers two complementary nudge hooks. Both are surgical — they name only the relevant tool, not a full inventory.

**Tools nudge** — catches `bash` calls that reimplement a first-class tool (`read`, `ls`, `grep`, `find`, `edit`):

- Emits a YELLOW warning **once per command category per session**, redirecting to the proper tool.
- The command still runs — it teaches, doesn't block (early blocking wasted a turn on forced retry). Later calls in that category are silent.
- Bash stays available for everything else (pipes, compound commands, real shell work).

> **Nudge steers; it does not guard.** Privileged auth stand-ins (bash `sudo`/`ssh`) are *not* nudged here — those are hard-blocked and redirected to `sudo_run`/`ssh_run` by [`pix-gate`](../pix-gate), which handles the auth safely. Guarding (stop) and steering (teach) are separate concerns in separate packages.

**Capability nudge** — steers the model toward tool discovery over guessing:

- One-time orientation block on the **first prompt** (tool counts, MCP tools, available skills).
- A one-line reminder every 10 turns pointing at `read_skills()` and `/toolbox`.
- When `graphify-out/graph.json` exists, both messages also route codebase questions to `graphify query`.

## Install

```bash
pi install npm:@xynogen/pix-nudge
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
