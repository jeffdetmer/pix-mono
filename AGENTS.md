<!-- markdownlint-disable MD013 MD040 MD060 -->

# pix-mono — Agent Operating Guide

Monorepo of Pi Coding Agent extensions (`@xynogen/pix-*`).
**Bun** runtime · **Biome** lint/format · **tsc** types · **bun run test** tests · all ESM (`"type": "module"`, ES2022).

---

## Product Design Philosophy

Pix is a **transparent, token-efficient, model-flexible** Pi distro. These are product constraints, not optional preferences. Apply them when designing, implementing, or reviewing every feature.

### 1. Minimize token use

- Keep the baseline system prompt and recurring tool schemas small.
- Load skills, instructions, model catalogs, and volatile metadata only on demand.
- Prefer targeted reads, bounded previews, compact structured results, and edit formats that reduce retries.
- Inject prompts only when the current task needs them; avoid passive or always-on context.
- UI collapse may reduce visual clutter, but the complete result must remain expandable and available to the user and agent.
- Measure token savings where possible. Do not make unverified efficiency claims.
- Avoid always-on advisors, reviewers, background loops, verbose orchestration transcripts, and giant all-purpose tool schemas.

### 2. Preserve strong model flexibility

- The user or calling agent chooses the model for each task.
- Pix may display benchmark scores, context size, price, capabilities, and recommendations, but must not silently pin or route to a model/provider.
- Subagents inherit the parent model when omitted or use the caller's explicit `model`; an agent type/persona must not override that choice.
- Any fallback or model change must be visible and report the reason, previous model, replacement model, and relevant cost/capability difference.
- Prefer provider-neutral interfaces and avoid features that create provider lock-in.

### 3. Keep agent behavior visible

- Every meaningful read, command, edit, delegation, approval, retry, and result must appear in the transcript or live UI.
- Show subagent identity, selected model, scope, current activity, token/cost information when available, and final output.
- Show file changes as inspectable diffs and findings with paths/evidence.
- Users must be able to inspect, expand, steer, stop, approve, reject, or undo work where the operation permits it.
- Never discard details merely because a card is collapsed; collapsing is presentation, not concealment.
- Memory, if added, must be explicit and auditable: visible retain/recall operations, provenance, injected-token estimate, and list/edit/delete controls.

### 4. Prefer composability over magic

- Build complex behavior from ordinary, visible tools and subagents.
- Convenience UI may prepare, organize, or summarize a workflow, but must not conceal its plan, model routing, tool calls, retries, edits, or review steps.
- Avoid any opaque high-level command, shortcut, trigger, or mode that silently launches planning, routing, tool use, retries, edits, delegation, or background automation. A `/goal`-style command or magic word is only one example of this broader anti-pattern.
- Reviews must be explicitly invoked and show reviewer models, scopes, token use, evidence, deduplication, and verdict construction; do not run an always-on reviewer by default.

### Feature review checklist

Before accepting a feature, answer:

1. Does it reduce or unnecessarily add baseline/context/output tokens?
2. Can the user choose the model and provider without a hidden override?
3. Can the user see what ran, why it ran, what it read or changed, and what it cost?
4. Can the user inspect, steer, stop, approve, reject, or undo it where applicable?
5. Is it composed from visible primitives rather than opaque automation?
6. Is a sensitive, expensive, or setup-heavy capability opt-in instead of bundled by default?

Product promise: **No hidden intent. No silent routing. No blind automation.**

---

## Repo Structure

Per-package catalog (names, descriptions, bundled vs standalone, dependency tree) lives in [`.github/README.md`](.github/README.md) — do not duplicate it here. What matters for agent work:

- **Bundled by `pix-core`** (Pi built-in replacements + UI/UX + behaviour): tool suite (`pix-bash/read/write/edit/find/grep/ls/ask/todo`), UI (`pix-welcome/footer/models/update/commands/nudge/diagnostics/display/prompts/skills`), behaviour (`pix-optimizer/gate/subagent`).
- **Shared layers** (see Package Independence): `pix-runtime`, `pix-data`, `pix-pretty`, `pix-core`.
- **Standalone, opt-in, NOT bundled:** `pix-9router`, `pix-sudo`, `pix-ssh`, `pix-toolbox`, `pix-graph`, `pix-hunk`, `pix-mcp`, `pix-aria2`, `pix-proc`.

```
scripts/
  dev-link.sh      # Symlink packages into Pi for dev
  publish-all.ts   # Publish changed packages to npm (idempotent)
  install.sh       # Install all packages into Pi
  deps.test.ts     # CI dep-hygiene checks (workspace:*, bare *, caret ranges)
.github/workflows/
  ci.yml           # Lint + typecheck + test on push/PR
  publish.yml      # Publish to npm on release tag
```

---

## Development

```bash
bun install                # install deps
bun run dev:link           # symlink into Pi (restart Pi after)
bun run dev:unlink         # restore npm copies
bun run check              # biome lint + format
bun run check:fix          # auto-fix
bun run typecheck          # tsc --noEmit
bun run test               # unit tests
```

---

## Commits

Format: `type(scope): short description` — scope = package name, e.g. `fix(pix-core): ...`

Types: **feat** (new capability) · **fix** (bug fix) · **refactor** (no behavior change) · **chore** (deps/config/tooling) · **docs** (documentation)

---

## CI / CD

**CI** runs on every push to `main` and PRs: biome ci → tsc → bun run test.

**CD** is triggered by a release tag push (`release-YYYYMMDD-HHMM`), never by a direct branch push.

```bash
# Bump version(s), commit, push to main, wait for CI green, then:
TAG="release-$(date +%Y%m%d-%H%M)" && git tag "$TAG" && git push origin "$TAG"
```

The Publish workflow triggers **on the tag push itself** (`on: push: tags: release-[0-9]*`). Its first step polls the Actions API and **requires a green CI run on that exact commit** before publishing — it does not re-run the suite. A tag pushed while CI is still running waits (up to ~10 min) instead of failing; a failed/cancelled CI aborts the publish. It then checks each `name@version` against npm and publishes only new versions (idempotent, OIDC trusted publishing — no NPM_TOKEN needed). Dry-run locally: `bun run publish:dry`.

Because the tag is the trigger (not CI-completion), there is **no tag-push race** and no manual dispatch needed. `workflow_dispatch` remains only as a break-glass fallback that publishes from the `main` tip (still gated on that commit's CI being green).

### Agent runbook — "publish"

"publish" (alone) means: run this exact sequence, no re-asking which packages.

1. **Approve once, up front** — inspect release scope, then use `ask_user` once. Approval prompt must show:
   - current branch and target commit SHA;
   - dirty files and proposed commit message, or state that no commit is needed;
   - commits included since the previous release tag;
   - exact package/version list planned for npm;
   - target release tag (`release-YYYYMMDD-HHMM`);
   - remote effects: commit push if needed, push to `main`, tag push, Publish workflow trigger, and npm publication.

   Approval covers the complete listed release. Do not ask again unless target commit, tag, or package/version list changes after approval.
2. **Gate** — `bun run check && bun run typecheck && bun run test`. Red → STOP.
3. **Confirm bumps** — changed packages must have version ahead of npm. Unbumped → that package silently ships nothing (no error). Semver: `feat`→minor, `fix`/`perf`→patch, breaking→major.
4. **Dry-run** — `bun run publish:dry` — note the exact `name@version` list. If it differs from the approved list, STOP and request new approval.
5. **Push commits + wait for CI** — push to `main`, then `gh run watch <ci-run-id> --exit-status` for the branch CI on the pushed SHA. CI must be green *before* tagging (the Publish gate requires it). Red → STOP.
6. **Tag + push** — create and push the release tag without another approval. This directly triggers the Publish workflow; no manual dispatch. The Publish job re-confirms CI is green on the tagged commit, then publishes.
7. **Verify GitHub Actions** — find the triggered Publish run (`gh run list --workflow Publish --limit 1`) and `gh run watch <run-id> --exit-status`. Confirm its log reports every expected `name@version` as published and ends with `0 failed`; report the Publish workflow URL and exact published versions. Red → STOP and report the failing step/log — never claim the release succeeded from the tag push alone. (If the tag push ever fails to trigger Publish, the fallback is `gh workflow run Publish --ref main`.)

---

## Package Independence

- **Four sanctioned shared layers:** `pix-runtime` (config + once + collapse), `pix-data` (model data), `pix-pretty` (rendering), `pix-core` (aggregator). Beyond these, keep packages self-contained.
- Prefer duplicating small utilities over adding a cross-package dep.
- Each package owns its own version — bump only what changed.
- Pi host is always a `peerDependency`, never a direct dep.
- Third-party deps go in the package that needs them, not hoisted to root.

---

## Dependency Versioning

**All `@xynogen/` deps must use caret ranges (`^x.y.z`).** Never `workspace:*` or bare `"*"` — these break npm publish and end-user installs.

- Set range to `^<current version>` of the target package.
- After a **minor bump** of a shared 0.x package, update the caret range in **all consumers** (e.g. `pix-data` 0.3→0.4 means `"^0.3.0"` → `"^0.4.0"` everywhere). Patch bumps within the same minor need no consumer edits (`^0.3.0` already matches `0.3.1`). Consumers whose dep range changed also need a patch bump + republish.
- `publish-all.ts` aborts if `workspace:` ranges survive.
- CI enforces via `scripts/deps.test.ts`: no `workspace:`, no bare `*`, all `@xynogen/` deps use `^`.

---

## Icon Catalog

**Never hardcode Nerd Font glyph codepoints** (terminals without Nerd Fonts render them as tofu). Use the semantic catalog in `pix-pretty`:

```ts
import { icon } from "@xynogen/pix-pretty/icon-catalog";
icon("cwd")           // resolves glyph for active mode (nerd/unicode/ascii)
```

- Keys are semantic roles (`"model"`, `"cwd"`, `"paste.image"`), never glyph names.
- `PRETTY_ICONS` env seeds default; `/pix` settings command switches live (persisted to `~/.pi/agent/pix.json`).
- New icons → add to the underlying `CATALOG` in `packages/pix-runtime/src/icon-catalog.ts` with all three variants; `pix-pretty/icon-catalog` is the public re-export.
- Typed data lists use `<semantic type icon> <identifier> <type>`: icon from the catalog, identifier in `accent` (blue in the default theme), and type metadata in `muted`. Never color identifiers with raw ANSI or a fixed palette value.

---

## UI Visual Hierarchy

Pix uses color intensity to show information priority without adding UI chrome:

1. **Primary** — `toolTitle`, `accent`, status colors, and main values. Highest contrast.
2. **Secondary** — `dim`. Targets, paths, commands, descriptions, and other supporting content.
3. **Tertiary** — `muted`. Metadata, counts, timing, separators, hints, placeholders, and decorative structure. Lowest contrast.

The required visual ramp is **primary → dim → muted**. `dim` must be brighter than `muted` in every theme. Do not choose these tokens by their conventional names; choose them by information priority. In a row such as `<tool> <target> · <metadata>`, render the tool with `toolTitle`, the target with `dim`, and the separator plus metadata with `muted`.

---

## UI Surfaces & Shared Rendering

**Choose UI surface by audience and lifetime. Do not pick whichever API is nearby.**

| Need | Standard surface |
|---|---|
| Tool call/result, including failures needed by model or transcript | Structured tool result + tool renderer |
| User-invoked command result, instructions, confirmation, or long actionable message | `ctx.ui.notify()` or command overlay |
| Short asynchronous background/runtime diagnostic | `showTransientMessage()` from `@xynogen/pix-pretty/transient-error` |
| Persistent live activity/progress | Named `ctx.ui.setWidget()` widget; clear it on completion/shutdown |
| Footer state | `ctx.ui.setStatus()` or shared footer integration |
| Interactive picker/settings/form | Existing shared overlay/modal primitive, then package-local component only if none fits |
| CLI output, browser DevTools, or explicit debug logging | `console.*`; never let extension runtime logs write into active TUI |

Transient diagnostics use one shared above-editor slot: one bounded line, newest wins, 30-second TTL. Levels are `error`, `warning`, and `info`; use `showTransientError()` only as the error convenience wrapper. Do not route structured tool errors or actionable multi-line notices through this slot.

Pix tool result renderers use one canonical completed-result shape: unchanged body followed by a full-width, status-colored dashed close. Normal and expanded output use the same outer shape.

- Use `frameToolResult()` from `@xynogen/pix-pretty/utils`; do not hand-build rules or duplicate frame logic.
- Successful completed results use the `success` theme role; failed results (`isError`) use `error`.
- Do not add a top rule, `└─`, or continuation indentation to ordinary tool results.
- Keep solid rules only for intentional inner/detail sections, not outer result chrome.
- Partial/streaming output remains unframed until completion to avoid moving terminal chrome.
- Auto-collapsed one-line summaries stay unframed and include a status glyph or text label, so status is not conveyed by color alone.
- Persistent live widgets are separate surfaces: indent child rows by two spaces without tree connectors. A download-progress widget may keep one solid full-width rule above its heading; clear completed rows after `collapse.delaySec`.
- Renderer tests must assert both success and error close roles; avoid pixel snapshots beyond stable text and semantic theme tags.

```ts
import {
  showTransientError,
  showTransientMessage,
} from "@xynogen/pix-pretty/transient-error";
```

**pix-pretty owns rendering, layout, and display formatting shared by two or more packages.** It is a sanctioned shared layer, so extracting into it does not break Package Independence.

- **One-off package-local helper** (bespoke summary line, single-use parser) → keep it local.
- **Same UI or formatter in ≥2 packages** (or about to be copied) → extract it into pix-pretty; remove parallel copies.
- Shared helpers accept minimal structural types (`ThemeLike`, `SessionLike`, `UILike`), not full `ExtensionAPI` or unrelated host state.
- Non-trivial shared helpers ship with focused tests in pix-pretty.

### Test assertions — Tiger Style

Define the valid output space instead of trying to enumerate invalid output.

- Prefer positive, canonical-shape assertions: required segments, order, separators, indentation, semantic color roles, and bounded value patterns.
- For variable formatting, measure deviation with ranges, structural parsing, or regex bounds; do not pin an entire rendered sentence when units, rounding, width, timing, or metadata may vary.
- Use exact equality only when the exact bytes/text are the contract.
- Negative assertions are exceptional: keep them for a specific regression, omission requirement, security boundary, or mutually exclusive state. Do not make blacklist-style `not.toContain()` checks the main format test.
- One positive assertion should describe the accepted form. Do not attempt to reject every malformed alternative; that state space is unbounded.

### Import boundary

Always import another package through a declared public package export:

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

Before using a subpath, verify it exists in `packages/pix-pretty/package.json#exports`. Missing subpath means add one public export or keep implementation package-local; do not bypass package boundary. Package-internal relative imports remain valid.

Before writing a formatter, spinner, token/duration/byte formatter, status line, modal, overlay, panel, or widget, inspect `packages/pix-pretty/package.json#exports` and grep pix-pretty first:

```ts
import { SPINNER, formatMs, formatTokens, fmtTokenCount, formatContext,
         formatTurns, formatToolUses, formatSpeed, describeActivity,
         getSessionContextUsage } from "@xynogen/pix-pretty/widget-format";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { frameLines, modalWidth } from "@xynogen/pix-pretty/modal-frame";
import { showOverlay } from "@xynogen/pix-pretty/gate-overlay";
```

- `widget-format` — live activity and session-stat formatting: `SPINNER`, duration/token/count/speed formatters, and `describeActivity`.
- `modal-frame` — generic rounded frame and modal width primitives.
- `gate-overlay` — permission/root approval dialog only; do not repurpose it as a generic panel.
- `transient-error` — shared short-lived runtime diagnostic slot for error/warning/info.
- `icon-catalog` — semantic icon catalog, including `status.*`; never hardcode glyph codepoints.
- `utils` — `humanSize(bytes)` uses IEC units. Token counts use `fmtTokenCount`; do not conflate them.
- `diff`, `diff-render`, `highlight`, `renderers`, `fff`, `ansi` — specialized rendering primitives exposed by package export map.

Adding a pix-pretty public helper or subpath is a public API addition and requires a minor bump. Rewired consumers need their own patch bumps; update pix-core pins for every bumped bundled package. New shared helpers must stay pure and Pi-host-agnostic.

---

## Unified Config — `~/.pi/agent/pix.json`

Owned by `pix-runtime` (init/reload/flush + the `/pix` settings command). Auto-created with defaults on first session. Sections:

| Section | Consumers |
|---|---|
| `collapse` | pix-bash, pix-read, pix-grep, pix-edit, pix-write, pix-find, pix-ls, pix-todo, pix-sudo, pix-ssh, pix-skills, pix-subagent, pix-9router |
| `pretty` | pix-pretty (icons, preview/render limits, diff split thresholds) |
| `optimizer` | pix-optimizer (caveman/rtk/ponytail state) |
| `gate` | pix-gate (rules, auto-approve patterns) |

Loader: `@xynogen/pix-runtime/config` (sections in `@xynogen/pix-runtime/sections`) · Collapse: `@xynogen/pix-runtime/collapse`. Full schema in `packages/pix-runtime/README.md`.

---

## Key Rules

- **Always run `bun run check` + `bun run typecheck` before committing** — CI will fail otherwise.
- **Never tag without bumping versions** — publish skips already-published versions.
- **Patch bumps only by default.** Minor/major require explicit user approval.
- **No `/toolbox` in agent-facing text** — it's a user slash command, not model-callable.
- Scripts are idempotent. Shared tsconfig: `tsconfig.base.json` — each package extends it.
- New packages: keep zero-dep on other `pix-*` packages if at all possible.
