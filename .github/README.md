# pix-mono

Monorepo of Pix, a distro of [Pi Coding Agent](https://github.com/badlogic/pi-mono).

## What to install

**Do you want the distro?** One package. `pix-core` installs the rest:

```bash
pi install npm:@xynogen/pix-core
```

Or use the [one-shot installer](#install). It installs Pi, a theme, and the distro together. See the [package breakdown](#packages) and [what is opt-in](#standalone-extensions-opt-in) below.

> **🎨 Opinionated** — the visual choices are intentional. A style PR may be declined. See [CONTRIBUTING.md](CONTRIBUTING.md).
>
> **⚠ Breaking changes** — upgrade through [uninstall + reinstall](#upgrade--clean-reinstall), not an incremental update.
>
> **🐧 Linux/macOS** tested. Windows not tested.

## Packages

### Core bundle

One `pi install npm:@xynogen/pix-core` installs and activates every package below. Each package installs the [foundation libraries](#foundation-layer) it needs.

### Theme

Standalone, zero deps.

| Package | Description |
| --- | --- |
| [`@xynogen/pix-themes`](packages/pix-themes) | Theme pack — 7 dark themes |

### UI / UX extensions

Widgets, slash commands, and display changes for the TUI.

| Package | Description |
| --- | --- |
| [`@xynogen/pix-welcome`](packages/pix-welcome) | ASCII π banner + startup health checks (version, auth, models, tools, skills, gitignore) |
| [`@xynogen/pix-footer`](packages/pix-footer) | Status bar — mode, git branch, model, tokens, cost, live TPS |
| [`@xynogen/pix-models`](packages/pix-models) | `/models` — enhanced model picker with coding score/rank, context window, cost |
| [`@xynogen/pix-update`](packages/pix-update) | `/update` — self-update Pi + all extensions, detects install method |
| [`@xynogen/pix-commands`](packages/pix-commands) | `/clear` slash command (flushes `~/.cache/pi`) |
| [`@xynogen/pix-nudge`](packages/pix-nudge) | Tools nudge + capability nudge hooks to steer model toward correct tools |
| [`@xynogen/pix-diagnostics`](packages/pix-diagnostics) | Compact LSP diagnostic widget — recent files list, overrides pi-lens |
| [`@xynogen/pix-display`](packages/pix-display) | Paste chip rendering (`[paste image #1]`) + leaked `<think>` tag → native thinking blocks |
| [`@xynogen/pix-prompts`](packages/pix-prompts) | System-prompt injection — bundled `SOP.md` baseline + repo directive files |
| [`@xynogen/pix-skills`](packages/pix-skills) | `read_skills` discovery and loading — includes references, bundled resources, and on-demand TOON guidance |

### Tool suite

These packages replace Pi's built-in tools under the same names. So model calls stay unchanged. [`pix-pretty`](packages/pix-pretty) improves their output: highlighting, diffs, icon trees, and FFF search.

| Package | Description |
| --- | --- |
| [`@xynogen/pix-bash`](packages/pix-bash) | `bash` — shell execution with framed output block and exit-code summary |
| [`@xynogen/pix-read`](packages/pix-read) | `read` — file read with syntax highlighting, image mime + size metadata |
| [`@xynogen/pix-write`](packages/pix-write) | `write` — file write with split-diff rendering on overwrite |
| [`@xynogen/pix-edit`](packages/pix-edit) | `edit` — precise text replacement with side-by-side diff per edit |
| [`@xynogen/pix-find`](packages/pix-find) | `find` — glob search with FFF acceleration and file icons |
| [`@xynogen/pix-grep`](packages/pix-grep) | `grep` — pattern search with FFF-prioritised results |
| [`@xynogen/pix-ls`](packages/pix-ls) | `ls` — directory listing as an indented icon tree |
| [`@xynogen/pix-ask`](packages/pix-ask) | `ask_user` — structured TUI questionnaire (multi-choice, multi-select, previews) |
| [`@xynogen/pix-todo`](packages/pix-todo) | `todo` — durable execution checklist, survives context compaction |

### Behaviour

How the agent acts — output optimization, permission gate, and sub-agents.

| Package | Description |
| --- | --- |
| [`@xynogen/pix-optimizer`](packages/pix-optimizer) | Caveman mode + RTK tool rewriting + ponytail lazy-dev mode (`/optimizer` overlay) |
| [`@xynogen/pix-gate`](packages/pix-gate) | Permission gate for dangerous bash + path commands — 4 severity tiers (block/critical/dangerous/risky) + sudo redirect, configurable |
| [`@xynogen/pix-subagent`](packages/pix-subagent) | Sub-agent spawning — 2 tools (`agent`, `agent_control`), live model widget, work-splitting |

### Standalone extensions (opt-in)

Not bundled by `pix-core`. Install each one only if you want it. Each one stays out of the default distro because it has a setup cost or a sensitive capability: a provider API key, root execution, or a manual tool-toggle UI. Install with `pi install npm:@xynogen/<name>`.

| Package | Why it's opt-in |
| --- | --- |
| [`@xynogen/pix-9router`](packages/pix-9router) | 9Router LLM provider + `fetch`/`search`/`transcribe` tools — needs a 9Router API key |
| [`@xynogen/pix-sudo`](packages/pix-sudo) | `sudo_run` — root execution via a PAM password overlay (blocked in non-interactive mode) |
| [`@xynogen/pix-ssh`](packages/pix-ssh) | `ssh_run` — run commands on a remote host over SSH (key/password auth + remote `sudo`) |
| [`@xynogen/pix-env`](packages/pix-env) | Broker `.env` secrets to tools via `$KEY` references, keeping the values out of the model's context |
| [`@xynogen/pix-toolbox`](packages/pix-toolbox) | `/toolbox` — fuzzy-search picker to enable/disable tools at runtime |
| [`@xynogen/pix-mcp`](packages/pix-mcp) | Token-efficient MCP gateway — external servers can execute commands or reach sensitive services |
| [`@xynogen/pix-graph`](packages/pix-graph) | `graph` tool — native-TS code knowledge graph (build/query, no Python); TS/JS only |
| [`@xynogen/pix-hunk`](packages/pix-hunk) | `hunk` tool — live Hunk diff-review bridge; needs the external Hunk CLI and an active review session |

### Roadmap — third-party extensions

Upstream Pi extensions that Pix uses now. We plan to replace each one with a maintained `@xynogen/pix-*` package.

| Package | Description |
| --- | --- |
| [`pi-lens`](https://github.com/apmantza/pi-lens) | Real-time code feedback — LSP navigation/diagnostics, linters, formatters, type-checking, structural (ast-grep) analysis |

### Foundation layer

Installed with any feature package. Install one directly only when you build your own extension against it. The `Depends on` column shows the full tree.

| Package | Depends on | Description |
| --- | --- | --- |
| [`@xynogen/pix-runtime`](packages/pix-runtime) | — (zero deps) | Base runtime used by every feature package — `pix.json` config, `once()` guard, collapse policy |
| [`@xynogen/pix-pretty`](packages/pix-pretty) | `pix-runtime` + `chalk`, `cli-highlight`, `@ff-labs/fff-node`, `diff` | Rendering lib — syntax highlighting, icons, tree views, diff, FFF, gate-overlay |
| [`@xynogen/pix-data`](packages/pix-data) | `pix-runtime` | Model data layer (modelgrep catalog + coding score), cached at `~/.cache/pi` |

## Install

The installer installs Pi, configures its theme and tools, and installs Pix.

Direct from GitHub (no clone needed):

```bash
curl -fsSL https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/install.sh | sh
```

Or from a local clone:

```bash
sh scripts/install.sh   # or: bun run distro:install
```

## Uninstall

Removes every `@xynogen/pix-*` package from Pi. It also removes sub-packages from an older install that listed them one by one.

```bash
curl -fsSL https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/uninstall.sh | sh
```

Or from a local checkout:

```bash
sh scripts/uninstall.sh   # or: bun run distro:uninstall
```

### Upgrade / clean reinstall

Before you upgrade across breaking changes, uninstall first:

```bash
curl -fsSL https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/uninstall.sh | sh
curl -fsSL https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/install.sh | sh
```

## Development

```bash
bun install        # install all workspace deps
bun test           # run all tests
bun run typecheck  # tsc across all packages
```

## Publishing

```bash
bun run static-analysis  # run the pre-publish gate directly
bun run publish:dry      # run the gate, then verify what would be published
bun run publish:all      # run the gate, then publish every new package version
```

Before a publish, the gate runs Biome, TypeScript, the dependency-policy tests, and a high-severity dependency audit. On a failure it keeps the analyzer output. It prints the failed check, the exit code, and the reproduction command for a human or a CI agent.

## Lineage

Several packages here started as a fork or a merge of a community Pi package:

| Upstream | Disposition |
|---|---|
| [`jonjonrankin/pi-caveman`](https://github.com/jonjonrankin/pi-caveman) | starting point for the `pix-optimizer` caveman-mode rewrite |
| [`MasuRii/pi-rtk-optimizer`](https://github.com/MasuRii/pi-rtk-optimizer) | merged into `pix-optimizer` |
| [`DietrichGebert/ponytail`](https://github.com/DietrichGebert/ponytail) | ruleset adapted as ponytail mode in `pix-optimizer` |
| [`heyhuynhgiabuu/pi-pretty`](https://github.com/heyhuynhgiabuu/pi-pretty) | replaced by `@xynogen/pix-pretty` |
| [`buddingnewinsights/pi-diff`](https://github.com/buddingnewinsights/pi-diff) | superseded (merged into `pix-core`) |
| [`juicesharp/rpiv-mono`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question) | rewritten as the `ask-user` skill in `pix-skills` |
| [`tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) | spawn engine ported into `pix-subagent` |
| [`nicobailon/pi-subagents`](https://github.com/nicobailon/pi-subagents) | work-splitting design adapted in `pix-subagent` |
| [`nicobailon/pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) | v2.11.0 (`82724dc`) adopted as `@xynogen/pix-mcp`; MIT license retained, with bounded on-demand discovery and lazy startup behavior |

These standalone repos moved into this monorepo before: `pix-optimizer`, `pix-themes`, `pix-pretty`, `pix-core`, `pix-9router`, `pix-data`.

## License

MIT
