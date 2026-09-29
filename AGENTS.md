<!-- markdownlint-disable MD013 MD040 MD060 -->

# pix-mono — Agent Operating Guide

Monorepo of Pix, a distro of Pi Coding Agent extensions (`@xynogen/pix-*`).
**Bun** runtime · **Biome** lint/format · **tsc** types · **bun run test** tests · all ESM (`"type": "module"`, ES2022). Packages ship TypeScript source. There is no build step.

Read this file in order the first time. Sections 1–4 explain how the framework is made. Sections 5–9 are the rules that keep packages consistent. Sections 10–12 are workflow.

---

## 1. Product Design Philosophy

Pix is a **transparent, token-efficient, model-flexible** Pi distro. These are product constraints, not optional preferences. Apply them when you design, implement, or review every feature.

### 1.1 Minimize token use

- Keep the baseline system prompt and recurring tool schemas small.
- Load skills, instructions, model catalogs, and volatile metadata only on demand.
- Prefer targeted reads, bounded previews, compact structured results, and edit formats that reduce retries.
- Inject prompts only when the current task needs them. Avoid passive or always-on context.
- UI collapse may reduce visual clutter, but the complete result must stay expandable and available to the user and agent.
- Measure token savings where possible. Do not make unverified efficiency claims.
- Avoid always-on advisors, reviewers, background loops, verbose orchestration transcripts, and giant all-purpose tool schemas.

### 1.2 Preserve strong model flexibility

- The user or calling agent chooses the model for each task.
- Pix may show benchmark scores, context size, price, capabilities, and recommendations, but must not silently pin or route to a model/provider.
- Subagents inherit the parent model when omitted or use the caller's explicit `model`. An agent type/persona must not override that choice.
- Any fallback or model change must be visible and report the reason, previous model, replacement model, and relevant cost/capability difference.
- Prefer provider-neutral interfaces. Avoid features that create provider lock-in.

### 1.3 Keep agent behavior visible

- Every meaningful read, command, edit, delegation, approval, retry, and result must appear in the transcript or live UI.
- Show subagent identity, selected model, scope, current activity, token/cost information when available, and final output.
- Show file changes as inspectable diffs and findings with paths/evidence.
- Users must be able to inspect, expand, steer, stop, approve, reject, or undo work where the operation permits it.
- Never discard details only because a card is collapsed. Collapsing is presentation, not concealment.
- Memory, if added, must be explicit and auditable: visible retain/recall operations, provenance, injected-token estimate, and list/edit/delete controls.

### 1.4 Prefer composability over magic

- Build complex behavior from ordinary, visible tools and subagents.
- Convenience UI may prepare, organize, or summarize a workflow, but must not conceal its plan, model routing, tool calls, retries, edits, or review steps.
- Avoid any opaque high-level command, shortcut, trigger, or mode that silently starts planning, routing, tool use, retries, edits, delegation, or background automation. A `/goal`-style command or magic word is one example of this anti-pattern.
- Reviews must be explicitly invoked and show reviewer models, scopes, token use, evidence, deduplication, and verdict construction. Do not run an always-on reviewer by default.

### 1.5 Feature review checklist

Before you accept a feature, answer:

1. Does it reduce or needlessly add baseline/context/output tokens?
2. Can the user choose the model and provider without a hidden override?
3. Can the user see what ran, why it ran, what it read or changed, and what it cost?
4. Can the user inspect, steer, stop, approve, reject, or undo it where applicable?
5. Is it composed from visible primitives rather than opaque automation?
6. Is a sensitive, expensive, or setup-heavy capability opt-in instead of bundled by default?

Product promise: **No hidden intent. No silent routing. No blind automation.**

---

## 2. Architecture — how the framework is made

### 2.1 Layers

Pix is four layers. A package may import only from the layers below it, plus Pi itself.

```
┌──────────────────────────────────────────────────────────────────────┐
│ L3  pix-core            aggregator: imports every bundled member and │
│                         calls its factory, in a fixed order          │
├──────────────────────────────────────────────────────────────────────┤
│ L2  feature packages    one job each: a tool, a widget, a command    │
│     bundled:    pix-read write edit find grep ls bash powershell ask │
│                 todo welcome footer models update commands nudge     │
│                 diagnostics display prompts skills optimizer gate    │
│                 subagent                                             │
│     standalone: pix-9router voice web sudo ssh toolbox graph hunk    │
│                 mcp aria2 proc astgrep env search themes             │
├──────────────────────────────────────────────────────────────────────┤
│ L1  pix-pretty          rendering: frames, diffs, highlight, icons,  │
│     pix-data            model data: modelgrep + BenchLM caches       │
├──────────────────────────────────────────────────────────────────────┤
│ L0  pix-runtime         config, paths, binaries, exec, OS jobs, once │
├──────────────────────────────────────────────────────────────────────┤
│     Pi host (peer deps) @earendil-works/pi-coding-agent, pi-tui,     │
│                         pi-ai                                        │
└──────────────────────────────────────────────────────────────────────┘
```

Dependency facts (check with `jq .dependencies packages/<p>/package.json`):

- `pix-runtime` depends on no `pix-*` package. It is the floor.
- `pix-pretty` and `pix-data` depend only on `pix-runtime`.
- Almost every feature package depends on `pix-pretty` + `pix-runtime`. `pix-footer`, `pix-models`, `pix-subagent`, `pix-commands` and `pix-9router` also use `pix-data`.
- Two sanctioned sideways edges exist: `pix-skills` → `pix-gate/lib` (one safety policy for bash and skill directives). `pix-core` → every bundled member.
- `pix-toolbox` depends on `pix-pretty` only. Keep it independent of `pix-runtime`. `pix-themes` has no code and no deps.
- The per-package catalog (descriptions, bundled vs standalone) lives in [`.github/README.md`](.github/README.md). Do not copy it here.

### 2.2 How Pi loads a package

Pi does not walk npm dependencies. It activates only what an installed package declares in its own `package.json#pi` manifest:

```jsonc
"pi": {
  "extensions": ["src/extension.ts"],   // default-exported (pi: ExtensionAPI) => void
  "skills": ["./skills"],               // optional: pix-graph, pix-skills
  "themes": ["./themes"]                // optional: pix-themes
}
```

Pi loads extension files through **jiti** with `moduleCache: false`. TypeScript runs directly and modules re-evaluate on every load pass (`/new`, `/resume`, `/fork`, `/reload`). Two results follow:

1. **Module state does not survive a reload.** Process-wide singletons live on `globalThis` (the config runtime, the `once` registry, the icon mode).
2. **One factory can run twice against the same `pi`**: once from `pix-core`, once from a standalone install of the same package. Every factory wraps its body in `once(pi, "<pkg>", …)` from `@xynogen/pix-runtime/once`. The key is the `pi` instance, so a new `pi` after `/reload` registers again.

### 2.3 How pix-core bundles members

`pix-core` is a meta-package. `packages/pix-core/src/extension.ts` imports each member's factory through its public export and calls it in a fixed order:

```ts
import registerRuntime from "@xynogen/pix-runtime";
import registerData from "@xynogen/pix-data";
import registerPretty from "@xynogen/pix-pretty";
import registerRead from "@xynogen/pix-read/extension";
// …
const MEMBERS = [registerRuntime, registerData, registerPretty, /* features */ ] satisfies readonly PixExtension[];
export default function (pi: ExtensionAPI): void {
	for (const register of MEMBERS) register(pi);
}
```

Order matters:

- `pix-runtime` first. It owns `pix.json` init/reload/flush and `/pix`. Every config reader after it sees a live runtime.
- `pix-data` second. It warms the model caches.
- `pix-pretty` third. It seeds the icon mode before any `icon()` consumer paints.
- Features after that. `pix-core` also owns two features of its own: `compaction.ts` and `plan-mode.ts` (`/plan`).

A new bundled package needs three edits: a dependency in `packages/pix-core/package.json`, an import, and an entry in `MEMBERS`.

### 2.4 Anatomy of a small feature package

`pix-ls` is the reference shape:

```
packages/pix-ls/
  package.json     exports "." and "./extension", pi.extensions, files, deps, peerDeps
  README.md        user-facing docs for this package
  LICENSE
  src/
    extension.ts   Pi entry: once() guard, host wiring, calls the registrar
    ls.ts          the tool: schema, execute, renderCall/renderResult
    ls.test.ts     colocated test
    index.ts       public API (re-exports)
```

`package.json` essentials:

```jsonc
{
  "name": "@xynogen/pix-ls",
  "type": "module",
  "exports": { ".": "./src/index.ts", "./extension": "./src/extension.ts" },
  "files": ["src", "!src/**/*.test.*", "README.md", "LICENSE"],
  "pi": { "extensions": ["src/extension.ts"] },
  "dependencies": { "@xynogen/pix-pretty": "^1.19.0", "@xynogen/pix-runtime": "^0.12.2" },
  "peerDependencies": { "@earendil-works/pi-coding-agent": "*", "@earendil-works/pi-tui": "*" }
}
```

`extension.ts` stays thin. It resolves host pieces and hands them to a registrar that is easy to test:

```ts
export default function pixLsExtension(pi: ExtensionAPI): void {
	once(pi, "pix-ls", () => {
		const cwd = process.cwd();
		const home = homeDir();                               // pix-runtime/paths
		registerLsTool(pi as unknown as PiPrettyApi, createLsToolDefinition, {
			cwd,
			sp: (p) => shortPath(cwd, home, p),               // pix-pretty/utils
			TextComponent: viewportTextConstructor(Text),
			fffState,                                         // pix-pretty/fff
			cursorStore: new CursorStore(),
		});
	});
}
```

The tool file (`ls.ts`) then builds on shared pieces only: `frameToolResult`, `renderToolError`, `getErrorMessage` (`pix-pretty/utils`), batching (`pix-pretty/batch`), tree rendering (`pix-pretty/renderers`), and the collapse timer (`pix-runtime/collapse`). The package-local code is only what makes `ls` different from `read` or `grep`.

### 2.5 How imports resolve

- **In the repo:** Bun workspaces (`"workspaces": ["packages/*"]`) symlink every package into `node_modules/@xynogen/*`. `@xynogen/pix-pretty/utils` resolves through that package's `exports` map to its `src/*.ts` file. `tsconfig.base.json#paths` adds a few aliases for tsc.
- **For users:** npm installs each package with its caret-ranged `@xynogen/*` deps. The same `exports` map applies, so repo imports and published imports are the same.
- **In Pi during dev:** `bun run dev:link` symlinks workspace packages into Pi's extension `node_modules` and patches `settings.json` for packages with Pi resources. Restart Pi after you link or unlink.

---

## 3. Shared layers — what to use instead of writing your own

The shared layers exist so that 40 small packages look and behave like one product. **Before you write a helper, search these layers.** If the same helper appears in two packages, it belongs in a shared layer.

### 3.1 pix-runtime (L0) — host, config, OS

| Subpath | Use it for |
|---|---|
| `/once` | `once(pi, key, fn)`. The idempotency guard in every factory. |
| `/config` | `pixRuntime()`, `config(section)`. Sync reads of `~/.pi/agent/pix.json`. |
| `/sections` | Section handles: `collapseSection`, `prettySection`, `ioSection`, `compactionSection`, `optimizerSection`, `gateSection`. |
| `/collapse` | `shouldCollapse`, `collapseDelayMs`, `tickCollapse`. The auto-collapse policy for tool cards. |
| `/io` | `ioTimeoutMs()`, `ioTimeoutSignal(signal?)`. Every network call uses the user's `io.timeoutSec`. |
| `/paths` | `homeDir`, `expandHome`, `agentDir`, `binDir`, `projectDir`, `tempDir`, `cacheDir`. |
| `/exec` | `runTool`, `spawnTool`, `runToolSync`. Start a catalogued binary by name on any OS. |
| `/binaries` | `resolveTool`, `requireTool`, `ensureTool`. Path lookup and download. |
| `/os` | Per-OS jobs: `openTarget`, `runGit`, `readClipboardImage`. |
| `/which`, `/platform` | Executable lookup (PATHEXT-aware). Host description (glibc, WSL). |
| `/atomic-write` | `writeFileAtomicSync`. Readers never see a partial file. |
| `/safe-path` | Pre-flight check before a tool writes to a path the model chose. |
| `/lfid` | Short IDs that are easy for a model to read (`agent-happy-walrus-42`), not UUIDs. |
| `/audio` | Microphones, record, play. |
| `/icon-catalog` | The catalog source. Consumers import it through `pix-pretty/icon-catalog`. |
| `/testing` | `createIsolatedRuntime()`. A config runtime for tests that never touches the real agent dir. |

Add a config section: define it with `defineSection({ key, defaults, parse })` in `packages/pix-runtime/src/sections/`, export it from `sections/index.ts`, and read it with `config(mySection)`. `parse` must never throw. Use the coercion helpers in `schema.ts` (`isObj`, `boolOr`, `posNumOr`, …).

### 3.2 pix-pretty (L1) — rendering and display

| Subpath | Use it for |
|---|---|
| `/utils` | `frameToolResult`, `renderToolError`, `renderCollapsedToolRow`, `shortPath`, `dotJoin`, `pluralize`, `humanSize` (IEC bytes), `getErrorMessage`, `makeTextResult`, `termW`. |
| `/widget-format` | Live widgets: `SPINNER`, `formatMs`, `formatDuration`, `formatTokens`, `fmtTokenCount`, `formatContext`, `formatSpeed`, `describeActivity`, `getSessionContextUsage`. |
| `/batch` | Shared batching for read/grep/find/ls: N targets, one result, one byte cap. |
| `/diff`, `/diff-render` | Diff parsing and split/unified/word-level rendering. Colors follow the theme. |
| `/highlight`, `/lang` | Syntax highlighting and language detection. |
| `/renderers` | Tree and list renderers. |
| `/icon-catalog` | `icon("semantic.key")`. Never a raw glyph. |
| `/modal-frame` | `frameLines`, `modalWidth`. Rounded frame for overlays. |
| `/confirm` | Yes/No confirmation overlay. |
| `/progress` | Modal progress overlay. |
| `/gate-overlay` | The permission/root approval dialog only. |
| `/provider-picker` | Provider settings UI used by `/web` and `/voice`. |
| `/shell-tool` | Shared registrar + renderer for command-shell tools (bash, powershell). |
| `/transient-error` | `showTransientMessage`, `showTransientError`. One-line runtime diagnostics. |
| `/tool-status` | `reportToolStatus`, `warnBinaryMissing`. Binary download and missing-binary wording. |
| `/fff` | Shared FFF finder state for grep/find/ls. |
| `/types`, `/context` | Structural types (`ThemeLike`, `PiPrettyApi`, `ToolContext`). |
| `/test-utils` | Renderer test harness. Test-only. |
| `/ansi` | Base ANSI constants for renderers that must write raw escapes. |

### 3.3 pix-data (L1) — model metadata

`@xynogen/pix-data` exports `lookupModelsDev`, `resolveModelsDev`, `lookupBenchmark`, `benchScoreColor`, `formatCost` (`$3/$15` per 1M tokens), and the `DataSource` cache class. The factory warms the caches on session start. Consumers read them synchronously. Price, context and benchmark text must come from here, so the footer, `/models` and subagent all show the same numbers.

### 3.4 Pi itself

Pi's public API is also a shared layer. Prefer it when it fits: `truncateHead`/`truncateTail`, `DEFAULT_MAX_BYTES` (50KB) and `DEFAULT_MAX_LINES` (2000) for tool-output caps, `createXxxToolDefinition` for built-in tool replacements, and `pi-tui` components (`Text`, `SelectList`, `truncateToWidth`).

### 3.5 Why this improves quality

Each shared helper removes a class of bug from every consumer at once. Recent examples in this repo:

- `homeDir()` over `os.homedir()` / `process.env.HOME`: `HOME` is unset in a Windows Pi process, so the local copies made cwd-relative paths.
- `expandHome()` over hand-written `~` logic: one of the three copies missed `~\` on Windows.
- `ioTimeoutSignal()` over bare `fetch`: web requests now follow the user's `/pix` timeout, not a hardcoded value or none at all.
- `writeFileAtomicSync()` over `writeFileSync`: two concurrent writes of an MCP cache no longer corrupt it.
- `formatCost()`: three packages printed three different price formats.
- `getErrorMessage()`: 101 inline copies of `err instanceof Error ? err.message : String(err)` became one call.
- Pi `truncateHead` over three local truncators: one cap policy for every remote/root tool.

---

## 4. When to share, when to keep local

- **One-off helper** (bespoke summary line, single-use parser) → keep it in the package.
- **Same helper in two packages, or about to be copied** → move it to the lowest layer that fits and delete the copies in the same change.
  - OS, paths, config, processes, files → `pix-runtime`.
  - Text, layout, color, formatting, overlays → `pix-pretty`.
  - Model/provider metadata → `pix-data`.
- **Node or Pi already does it** → use that. Examples: `node:util` `stripVTControlCharacters`, `AbortSignal.timeout`, Pi `truncateHead`.
- **A one-line idiom in two places** (for example a BOM strip before `JSON.parse`) → a shared helper can cost more than it saves. Use judgement and say why.
- Shared helpers take minimal structural types (`ThemeLike`, `SessionLike`, `UILike`), not the full `ExtensionAPI` or unrelated host state. They stay pure and host-agnostic.
- Non-trivial shared helpers ship with focused tests in the shared package.
- Do not add a new cross-package edge between feature packages. If two features need the same code, move it down a layer.

---

## 5. Import Boundary

Import another package only through a declared public export:

```ts
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { frameLines, modalWidth } from "@xynogen/pix-pretty/modal-frame";
```

Never import another package by filesystem path or source internals:

```ts
// forbidden
import { icon } from "../../pix-pretty/src/icon-catalog.ts";
import { icon } from "@xynogen/pix-pretty/src/icon-catalog.ts";
```

- Before you use a subpath, verify it exists in that package's `package.json#exports`. A missing subpath means add one public export or keep the code local. Do not bypass the boundary.
- Package-internal relative imports stay valid.
- Adding a public helper or subpath to `pix-pretty`, `pix-runtime` or `pix-data` is a public API addition. It needs a minor bump (0.x) and consumer pin updates. See section 10.

---

## 6. Paths, Binaries and Config

### 6.1 Paths

- Use `@xynogen/pix-runtime/paths`: `homeDir()`, `expandHome()`, `agentDir()`, `binDir()`, `projectDir(cwd)`, `tempDir()`, `cacheDir()`.
- Never hardcode `~/.pi/agent`. Never read `process.env.HOME` for directories. Never call `os.homedir()` directly in a feature package.
- Text shown to the model or the user keeps `/` as the separator. Build it as `` `${projectDir()}/x` ``, not with `join`.
- Tests use the same helpers. No static paths in tests. The preload `scripts/test-sandbox.ts` points `HOME`, `USERPROFILE` and `PI_CODING_AGENT_DIR` at a throwaway folder before any test module loads.

### 6.2 Binaries — `~/.pi/agent/binary.json`

Every external command a pix package runs is listed in the pix-runtime catalog (`packages/pix-runtime/src/binaries/catalog.ts`).

- **Run:** start catalogued binaries only through `@xynogen/pix-runtime/exec` (`runTool` / `spawnTool` / `runToolSync`), or `@xynogen/pix-runtime/os` for per-OS jobs (`openTarget`, `runGit`, `readClipboardImage`). Never call `spawn("git")`, `execFile("ssh")` or `pi.exec("npm")` by bare name. `scripts/binaries.test.ts` enforces this. The layer handles `binary.json`, Windows `.cmd` shims and install hints.
- **Resolve:** `resolveTool` / `requireTool` / `ensureTool` from `@xynogen/pix-runtime/binaries` when you only need the path. Do not add a package-local PATH lookup, a `command -v` shell-out, or an ENOENT probe.
- **Status:** route download progress through `reportToolStatus(ctx.ui)`, and background missing-binary errors through `warnBinaryMissing(ctx.ui, err)`, both from `@xynogen/pix-pretty/tool-status`.
- **`binary.json`:** user config. It holds overrides only (`name → path`). A missing entry means automatic (`bin` → known install dirs → PATH → download). pix never writes discovered paths into it, and never creates it until the user sets a path. The `/pix` Binaries tab shows the full catalog and edits the file.
- **New command dependency:** add it to the catalog, with every OS and an install hint, in the same change.

### 6.3 Unified config — `~/.pi/agent/pix.json`

Owned by `pix-runtime` (init/reload/flush + the `/pix` settings command). Auto-created with defaults on first session.

| Section | Consumers |
|---|---|
| `collapse` | pix-ask, pix-edit, pix-find, pix-grep, pix-hunk, pix-ls, pix-mcp, pix-read, pix-skills, pix-ssh, pix-subagent, pix-sudo, pix-todo, pix-voice, pix-web, pix-write, and pix-bash/pix-powershell through `pix-pretty/shell-tool` |
| `pretty` | pix-pretty (icons, preview/render limits, diff split thresholds) |
| `io` | pix-9router, pix-data, pix-mcp, pix-skills, pix-update, pix-voice, pix-web (network timeout via `@xynogen/pix-runtime/io`) |
| `compaction` | pix-core (auto-compaction trigger percent and token floor) |
| `optimizer` | pix-optimizer (caveman/rtk/ponytail state) |
| `gate` | pix-gate (rules, auto-approve patterns) |

Loader: `@xynogen/pix-runtime/config` · sections: `@xynogen/pix-runtime/sections` · collapse: `@xynogen/pix-runtime/collapse`. Full schema in `packages/pix-runtime/README.md`.

---

## 7. UI Rules

### 7.1 Icon catalog

**Never hardcode Nerd Font glyph codepoints.** Terminals without Nerd Fonts render them as tofu. Use the semantic catalog:

```ts
import { icon } from "@xynogen/pix-pretty/icon-catalog";
icon("cwd")           // resolves glyph for active mode (nerd/unicode/ascii)
```

- Keys are semantic roles (`"model"`, `"cwd"`, `"paste.image"`), never glyph names.
- `PRETTY_ICONS` env seeds the default. `/pix` switches it live (persisted to `~/.pi/agent/pix.json`).
- New icons → add to `CATALOG` in `packages/pix-runtime/src/icon-catalog.ts` with all three variants. `pix-pretty/icon-catalog` is the public re-export.
- Typed data lists use `<semantic type icon> <identifier> <type>`: icon from the catalog, identifier in `accent`, and type metadata in `muted`. Never color identifiers with raw ANSI or a fixed palette value.

### 7.2 Visual hierarchy

Pix uses color intensity to show information priority without extra UI chrome:

1. **Primary** — `toolTitle`, `accent`, status colors, and main values. Highest contrast.
2. **Secondary** — `dim`. Targets, paths, commands, descriptions, and other supporting content.
3. **Tertiary** — `muted`. Metadata, counts, timing, separators, hints, placeholders, and decorative structure. Lowest contrast.

The required ramp is **primary → dim → muted**. `dim` must be brighter than `muted` in every theme. Choose tokens by information priority, not by their names. In a row such as `<tool> <target> · <metadata>`, render the tool with `toolTitle`, the target with `dim`, and the separator plus metadata with `muted`.

Colors come from the Pi theme. Do not add a private ANSI palette to a feature package. Fallback themes (used only when no host theme reaches a component) render plain text.

### 7.3 UI surfaces

**Choose the surface by audience and lifetime. Do not pick whichever API is nearby.**

| Need | Standard surface |
|---|---|
| Tool call/result, including failures the model or transcript needs | Structured tool result + tool renderer |
| User-invoked command result, instructions, confirmation, or long actionable message | `ctx.ui.notify()` or command overlay |
| Short asynchronous background/runtime diagnostic | `showTransientMessage()` from `@xynogen/pix-pretty/transient-error` |
| Persistent live activity/progress | Named `ctx.ui.setWidget()` widget. Clear it on completion/shutdown |
| Footer state | `ctx.ui.setStatus()` or shared footer integration |
| Interactive picker/settings/form | Existing shared overlay/modal primitive, then a package-local component only if none fits |
| CLI output, browser DevTools, or explicit debug logging | `console.*`. Never let extension runtime logs write into the active TUI |

Transient diagnostics use one shared above-editor slot: one bounded line, newest wins, 30-second TTL. Levels are `error`, `warning`, and `info`. Use `showTransientError()` only as the error convenience wrapper. Do not route structured tool errors or actionable multi-line notices through this slot.

### 7.4 Tool result shape

Pix tool result renderers use one canonical completed-result shape: the unchanged body followed by a full-width, status-colored dashed close. Normal and expanded output use the same outer shape.

- Use `frameToolResult()` from `@xynogen/pix-pretty/utils`. Do not hand-build rules or duplicate frame logic.
- Successful completed results use the `success` theme role. Failed results (`isError`) use `error`.
- Do not add a top rule, `└─`, or continuation indentation to ordinary tool results.
- Keep solid rules only for intentional inner/detail sections, not outer result chrome.
- Partial/streaming output stays unframed until completion, so terminal chrome does not move.
- Auto-collapsed one-line summaries stay unframed and include a status glyph or text label, so color is not the only status signal.
- Persistent live widgets are separate surfaces: indent child rows by two spaces without tree connectors. A download-progress widget may keep one solid full-width rule above its heading. Clear completed rows after `collapse.delaySec`.
- Renderer tests assert both success and error close roles. Avoid pixel snapshots beyond stable text and semantic theme tags.

---

## 8. Tests

- Tests sit next to the code (`src/foo.test.ts`). `pix-mcp` also has `tests/`.
- Run `bun run test`. It uses `--isolate` and the preload `scripts/test-sandbox.ts` (set in `bunfig.toml`). A bare `bun test` without `--isolate` gives false failures.
- Config-dependent tests use `createIsolatedRuntime()` from `@xynogen/pix-runtime/testing`.
- Renderer tests use `@xynogen/pix-pretty/test-utils`.
- Non-trivial logic leaves one runnable check behind. A trivial one-liner needs no test.

### 8.1 Assertions — Tiger Style

Define the valid output space instead of trying to list invalid output.

- Prefer positive, canonical-shape assertions: required segments, order, separators, indentation, semantic color roles, and bounded value patterns.
- For variable formatting, measure deviation with ranges, structural parsing, or regex bounds. Do not pin a whole rendered sentence when units, rounding, width, timing, or metadata may vary.
- Use exact equality only when the exact bytes/text are the contract.
- Negative assertions are exceptional: keep them for a specific regression, omission requirement, security boundary, or mutually exclusive state. Do not make blacklist-style `not.toContain()` checks the main format test.
- One positive assertion should describe the accepted form. Do not try to reject every malformed alternative. That state space is unbounded.

---

## 9. Repo Guards

These checks keep the rules above true. They run in CI through `bun run static-analysis` and `bun run test`.

| Guard | Enforces |
|---|---|
| `biome.json` | Lint + format (tabs, width 100, no unused imports/vars, `===`, `const`). |
| `tsc -p tsconfig.base.json` | Strict types, `noUncheckedIndexedAccess`. `pix-mcp` has its own tsconfig pair. |
| `scripts/deps.test.ts` | `@xynogen/*` deps use caret ranges. No `workspace:*`, no bare `*`. |
| `scripts/binaries.test.ts` | No bare-name `spawn`/`execFile`/`pi.exec` of a catalogued binary. |
| `scripts/package-smoke.ts` | Each package tarball packs and its exports resolve. |
| `scripts/check-versions.ts` | A changed package must be ahead of npm before publish. |
| `scripts/coverage-ratchet.ts` | Coverage must not drop below the baseline. |
| `bun audit --audit-level=high` | No high-severity dependency advisories. |

---

## 10. Versions and Dependencies

### 10.1 Package independence

- Four sanctioned shared layers: `pix-runtime`, `pix-data`, `pix-pretty`, `pix-core` (aggregator). Beyond these, keep packages self-contained.
- Each package owns its own version. Bump only what changed.
- The Pi host is always a `peerDependency` (`"*"`), never a direct dep.
- Third-party deps go in the package that needs them, not hoisted to the root.
- New packages: keep zero-dep on other `pix-*` feature packages.

### 10.2 Dependency versioning

**All `@xynogen/` deps use caret ranges (`^x.y.z`).** Never `workspace:*` or bare `"*"`. These break npm publish and end-user installs.

- Set the range to `^<current version>` of the target package.
- After a **minor bump** of a shared 0.x package, update the caret range in **all consumers** (for example `pix-data` 0.3→0.4 means `"^0.3.0"` → `"^0.4.0"` everywhere). Patch bumps within the same minor need no consumer edits. Consumers whose dep range changed also need a patch bump + republish.
- A consumer that starts to use a new shared helper pins at least the version that added it.
- `publish-all.ts` aborts if `workspace:` ranges survive.

### 10.3 Bumps

- `feat` → minor, `fix`/`perf` → patch, breaking → major.
- **Patch bumps only by default.** Minor/major need explicit user approval.
- A package already ahead of npm (unpublished bump) needs no second bump for more changes before release.
- After you bump a bundled package, update its pin in `packages/pix-core/package.json`.

---

## 11. Development and Commits

```bash
bun install                # install deps
bun run dev:link           # symlink into Pi (restart Pi after)
bun run dev:unlink         # restore npm copies
bun run check              # biome lint + format
bun run check:fix          # auto-fix
bun run typecheck          # tsc --noEmit
bun run test               # unit tests (--isolate + sandbox preload)
bun run graph:build        # refresh .pi/graph/graph.json
```

Commit format: `type(scope): short description`. The scope is the package name, for example `fix(pix-core): ...`.

Types: **feat** (new capability) · **fix** (bug fix) · **refactor** (no behavior change) · **chore** (deps/config/tooling) · **docs** (documentation).

Always run `bun run check` + `bun run typecheck` before you commit. CI fails otherwise.

---

## 12. CI / CD

**CI** runs on every push to `main` and on PRs: `bun run static-analysis` (biome ci → tsc → deps → package smoke → audit) → `bun run test` → coverage ratchet. It runs on `ubuntu-latest` only.

**CD** starts on a release tag push (`release-YYYYMMDD-HHMM`), never on a direct branch push.

```bash
# Bump version(s), commit, push to main, wait for CI green, then:
TAG="release-$(date +%Y%m%d-%H%M)" && git tag "$TAG" && git push origin "$TAG"
```

The Publish workflow triggers **on the tag push itself** (`on: push: tags: release-[0-9]*`). Its first step polls the Actions API and **requires a green CI run on that exact commit** before it publishes. It does not re-run the suite. A tag pushed while CI still runs waits (up to ~10 min) instead of failing. A failed/cancelled CI aborts the publish. It then checks each `name@version` against npm and publishes only new versions (idempotent, OIDC trusted publishing, no NPM_TOKEN). Dry-run locally: `bun run publish:dry`.

Because the tag is the trigger, there is **no tag-push race** and no manual dispatch. `workflow_dispatch` stays only as a break-glass fallback that publishes from the `main` tip (still gated on that commit's CI being green).

### 12.1 Agent runbook — "publish"

"publish" (alone) means: run this exact sequence. Do not ask again which packages.

1. **Approve once, up front** — inspect the release scope, then use `ask_user` once. The approval prompt must show:
   - current branch and target commit SHA;
   - dirty files and proposed commit message, or state that no commit is needed;
   - commits included since the previous release tag;
   - exact package/version list planned for npm;
   - target release tag (`release-YYYYMMDD-HHMM`);
   - remote effects: commit push if needed, push to `main`, tag push, Publish workflow trigger, and npm publication.

   Approval covers the complete listed release. Do not ask again unless the target commit, tag, or package/version list changes after approval.
2. **Gate** — `bun run check && bun run typecheck && bun run test`. Red → STOP.
3. **Confirm bumps** — changed packages must have a version ahead of npm. An unbumped package silently ships nothing (no error).
4. **Dry-run** — `bun run publish:dry`. Note the exact `name@version` list. If it differs from the approved list, STOP and request new approval.
5. **Push commits + wait for CI** — push to `main`, then `gh run watch <ci-run-id> --exit-status` for the branch CI on the pushed SHA. CI must be green *before* tagging. Red → STOP.
6. **Tag + push** — create and push the release tag without another approval. This triggers the Publish workflow directly. The Publish job confirms CI is green on the tagged commit, then publishes.
7. **Verify GitHub Actions** — find the Publish run (`gh run list --workflow Publish --limit 1`) and `gh run watch <run-id> --exit-status`. Confirm its log reports every expected `name@version` as published and ends with `0 failed`. Report the Publish workflow URL and exact published versions. Red → STOP and report the failing step/log. Never claim the release succeeded from the tag push alone. If the tag push fails to trigger Publish, the fallback is `gh workflow run Publish --ref main`.

---

## 13. Key Rules

- Run `bun run check` + `bun run typecheck` before you commit.
- Never tag without bumping versions. Publish skips already-published versions.
- Patch bumps only by default. Minor/major need explicit user approval.
- Search the shared layers (section 3) before you write a helper. Delete copies when you share one.
- Import other packages only through public `exports` (section 5).
- Paths through `pix-runtime/paths`, binaries through `pix-runtime/exec`, network timeouts through `pix-runtime/io`.
- Colors from the theme, icons from the catalog, result frames from `frameToolResult`.
- No `/toolbox` in agent-facing text. It is a user slash command, not model-callable.
- Scripts are idempotent. The shared tsconfig is `tsconfig.base.json`.
