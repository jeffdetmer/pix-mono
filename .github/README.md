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
| [`@xynogen/pix-themes`](https://www.npmjs.com/package/@xynogen/pix-themes) | Theme pack — 7 dark themes |

### UI / UX extensions

Widgets, slash commands, and display changes for the TUI.

| Package | Description |
| --- | --- |
| [`@xynogen/pix-welcome`](https://www.npmjs.com/package/@xynogen/pix-welcome) | ASCII π banner + startup health checks (version, auth, models, tools, skills, gitignore) |
| [`@xynogen/pix-footer`](https://www.npmjs.com/package/@xynogen/pix-footer) | Status bar — mode, git branch, model, tokens, cost, live TPS |
| [`@xynogen/pix-models`](https://www.npmjs.com/package/@xynogen/pix-models) | `/models` — enhanced model picker with coding score/rank, context window, cost |
| [`@xynogen/pix-update`](https://www.npmjs.com/package/@xynogen/pix-update) | `/update` — self-update Pi + all extensions, detects install method |
| [`@xynogen/pix-commands`](https://www.npmjs.com/package/@xynogen/pix-commands) | `/clear` slash command (flushes `~/.cache/pi`) |
| [`@xynogen/pix-nudge`](https://www.npmjs.com/package/@xynogen/pix-nudge) | Tools nudge + capability nudge hooks to steer model toward correct tools |
| [`@xynogen/pix-diagnostics`](https://www.npmjs.com/package/@xynogen/pix-diagnostics) | Lazy LSP diagnostics, navigation, and a compact session widget — replaces the pi-lens LSP core |
| [`@xynogen/pix-display`](https://www.npmjs.com/package/@xynogen/pix-display) | Paste chip rendering (`[paste image #1]`) + leaked `<think>` tag → native thinking blocks |
| [`@xynogen/pix-prompts`](https://www.npmjs.com/package/@xynogen/pix-prompts) | System-prompt injection — bundled `SOP.md` baseline + repo directive files |
| [`@xynogen/pix-skills`](https://www.npmjs.com/package/@xynogen/pix-skills) | `read_skills` discovery and loading — includes references, bundled resources, and on-demand TOON guidance |

### Tool suite

These packages replace Pi's built-in tools under the same names. So model calls stay unchanged. [`pix-pretty`](https://www.npmjs.com/package/@xynogen/pix-pretty) improves their output: highlighting, diffs, icon trees, and FFF search.

| Package | Description |
| --- | --- |
| [`@xynogen/pix-bash`](https://www.npmjs.com/package/@xynogen/pix-bash) | `bash` — shell execution with framed output block and exit-code summary |
| [`@xynogen/pix-powershell`](https://www.npmjs.com/package/@xynogen/pix-powershell) | `powershell` — same framed rendering for Pi's optional Windows tool; inert unless you enable `powershell` |
| [`@xynogen/pix-read`](https://www.npmjs.com/package/@xynogen/pix-read) | `read` — file read with syntax highlighting, image mime + size metadata |
| [`@xynogen/pix-write`](https://www.npmjs.com/package/@xynogen/pix-write) | `write` — file write with split-diff rendering on overwrite |
| [`@xynogen/pix-edit`](https://www.npmjs.com/package/@xynogen/pix-edit) | `edit` — precise text replacement with side-by-side diff per edit |
| [`@xynogen/pix-find`](https://www.npmjs.com/package/@xynogen/pix-find) | `find` — glob search with FFF acceleration and file icons |
| [`@xynogen/pix-grep`](https://www.npmjs.com/package/@xynogen/pix-grep) | `grep` — pattern search with FFF-prioritised results |
| [`@xynogen/pix-ls`](https://www.npmjs.com/package/@xynogen/pix-ls) | `ls` — directory listing as an indented icon tree |
| [`@xynogen/pix-ask`](https://www.npmjs.com/package/@xynogen/pix-ask) | `ask_user` — structured TUI questionnaire (multi-choice, multi-select, previews) |
| [`@xynogen/pix-todo`](https://www.npmjs.com/package/@xynogen/pix-todo) | `todo` — durable execution checklist, survives context compaction |

### Behaviour

How the agent acts — output optimization, permission gate, and sub-agents.

| Package | Description |
| --- | --- |
| [`@xynogen/pix-optimizer`](https://www.npmjs.com/package/@xynogen/pix-optimizer) | Caveman mode + RTK tool rewriting + ponytail lazy-dev mode (`/optimizer` overlay) |
| [`@xynogen/pix-gate`](https://www.npmjs.com/package/@xynogen/pix-gate) | Permission gate for dangerous bash + path commands — 4 severity tiers (block/critical/dangerous/risky) + sudo redirect, configurable |
| [`@xynogen/pix-subagent`](https://www.npmjs.com/package/@xynogen/pix-subagent) | Sub-agent spawning — 2 tools (`agent`, `agent_control`), live model widget, work-splitting |

### Standalone extensions (opt-in)

Not bundled by `pix-core`. Install each one only if you want it. Each one stays out of the default distro because it has a setup cost or a sensitive capability: a provider API key, root execution, or a manual tool-toggle UI. Install with `pi install npm:@xynogen/<name>`.

| Package | Why it's opt-in |
| --- | --- |
| [`@xynogen/pix-web`](https://www.npmjs.com/package/@xynogen/pix-web) | Provider-neutral `fetch` and `search` tools with Exa, Tavily, You.com, Brave, SearXNG, 9Router, and more adapters |
| [`@xynogen/pix-voice`](https://www.npmjs.com/package/@xynogen/pix-voice) | Provider-neutral push-to-talk dictation (`Ctrl+Alt+Z`) plus the `transcribe` and `speak` tools, with 9Router, OpenAI, Groq, Deepgram, ElevenLabs, Gemini, and more adapters |
| [`@xynogen/pix-9router`](https://www.npmjs.com/package/@xynogen/pix-9router) | 9Router LLM provider — needs a 9Router API key |
| [`@xynogen/pix-sudo`](https://www.npmjs.com/package/@xynogen/pix-sudo) | `sudo_run` — root execution via a PAM password overlay (blocked in non-interactive mode) |
| [`@xynogen/pix-ssh`](https://www.npmjs.com/package/@xynogen/pix-ssh) | `ssh_run` — run commands on a remote host over SSH (key/password auth + remote `sudo`) |
| [`@xynogen/pix-env`](https://www.npmjs.com/package/@xynogen/pix-env) | Broker `.env` secrets to tools via `$KEY` references, keeping the values out of the model's context |
| [`@xynogen/pix-toolbox`](https://www.npmjs.com/package/@xynogen/pix-toolbox) | `/toolbox` — fuzzy-search picker to enable/disable tools at runtime |
| [`@xynogen/pix-mcp`](https://www.npmjs.com/package/@xynogen/pix-mcp) | Token-efficient MCP gateway — external servers can execute commands or reach sensitive services |
| [`@xynogen/pix-graph`](https://www.npmjs.com/package/@xynogen/pix-graph) | `graph` tool — native-TS code knowledge graph (build/query, no Python); TS/JS only |
| [`@xynogen/pix-astgrep`](https://www.npmjs.com/package/@xynogen/pix-astgrep) | `ast_grep_search` / `read_symbol` / `symbol_search` — structural code search and symbol reads; needs the `@ast-grep/napi` native addon |
| [`@xynogen/pix-hunk`](https://www.npmjs.com/package/@xynogen/pix-hunk) | `hunk` tool — live Hunk diff-review bridge; needs the external Hunk CLI and an active review session |
| [`@xynogen/pix-aria2`](https://www.npmjs.com/package/@xynogen/pix-aria2) | `download` tool — fast, resumable downloads via an auto-managed aria2 RPC daemon; needs the external `aria2c` binary |
| [`@xynogen/pix-proc`](https://www.npmjs.com/package/@xynogen/pix-proc) | `proc` tool — run and manage long-lived processes (`npm run dev`, `vite`, `python`) that outlive a turn; spawns background processes |

### Roadmap — third-party extensions

Upstream Pi extensions that Pix uses now. We plan to replace each one with a maintained `@xynogen/pix-*` package.

| Package | Description |
| --- | --- |
| [`pi-lens`](https://github.com/apmantza/pi-lens) | LSP core merged into `pix-diagnostics`. Still upstream: linters, formatters, structural (ast-grep) analysis, security/dependency scans |

### Foundation layer

Installed with any feature package. Install one directly only when you build your own extension against it. The `Depends on` column shows the full tree.

| Package | Depends on | Description |
| --- | --- | --- |
| [`@xynogen/pix-runtime`](https://www.npmjs.com/package/@xynogen/pix-runtime) | — (zero deps) | Base runtime used by every feature package — `pix.json` config, `once()` guard, collapse policy |
| [`@xynogen/pix-pretty`](https://www.npmjs.com/package/@xynogen/pix-pretty) | `pix-runtime` + `chalk`, `cli-highlight`, `@ff-labs/fff-node`, `diff` | Rendering lib — syntax highlighting, icons, tree views, diff, FFF, gate-overlay |
| [`@xynogen/pix-data`](https://www.npmjs.com/package/@xynogen/pix-data) | `pix-runtime` | Model data layer (modelgrep catalog + coding score), cached at `~/.cache/pi` |

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

### Windows (PowerShell)

Runs in Windows PowerShell 5.1 or PowerShell 7. Pi itself installs through Pi's official Windows installer (`pi.dev/install.ps1`), which also sets up Node.js and Git Bash when missing.

```powershell
irm https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/install.ps1 | iex
```

Or from a local clone:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1   # or: bun run distro:install:win
```

`pix-sudo` is not offered on Windows (it needs sudo/PAM); the installer prints the manual `pi install` command instead. `pix-voice` and `pix-ssh` are offered with a Windows caveat.

## Uninstall

Removes every `@xynogen/pix-*` package from Pi. It also removes sub-packages from an older install that listed them one by one.

```bash
curl -fsSL https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/uninstall.sh | sh
```

Or from a local checkout:

```bash
sh scripts/uninstall.sh   # or: bun run distro:uninstall
```

On Windows:

```powershell
irm https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/uninstall.ps1 | iex
# or: bun run distro:uninstall:win
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
| [`earendil-works/pi-voice`](https://github.com/earendil-works/pi-voice) | push-to-talk dictation design (`Ctrl+Alt+Z` into the prompt) adapted in `pix-voice`; no code copied |
| [`apmantza/pi-lens`](https://github.com/apmantza/pi-lens) | LSP engine (server registry, transport, lazy manager) adapted into `@xynogen/pix-diagnostics`; MIT license retained in `packages/pix-diagnostics/LICENSE.pi-lens` |

These standalone repos moved into this monorepo before: `pix-optimizer`, `pix-themes`, `pix-pretty`, `pix-core`, `pix-9router`, `pix-data`.

## License

MIT
