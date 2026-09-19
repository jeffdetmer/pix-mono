---
name: lint-format
description: Run the right linter and formatter for any language through pix-bash. Use when asked to lint, format, fix style, or check code quality — detect the project's own tool, prefer its script, fall back to the canonical per-language command.
---
# Lint and Format

Pix does not bundle linters or formatters. The language server gives type
diagnostics through `lens_diagnostics`; everything else runs the project's own
tool through `bash`. This skill says which command to run and in what order.

## Order of preference

Always try these in order. Stop at the first that fits.

1. **LSP diagnostics** — for type errors and language-server lint, run
   `lens_diagnostics` (source=lsp) on the changed files. No shell needed. This
   already covers pyright, tsc, rust-analyzer, gopls, and clippy-via-LSP.
2. **Project script** — read `package.json` scripts, `justfile`, `Makefile`,
   `mise.toml`, or `Taskfile.yml`. If a `lint`/`format`/`check` target exists,
   run that. It encodes the project's real config. Never guess past it.
3. **Config-detected tool** — a config file names the tool. Run that tool.
4. **Canonical default** — no script and no config: run the table default.

Never install a linter or formatter without asking the user first (SOP §1).
Detect the binary; if absent, say what to install and stop.

## Detect the tool from config files

Read the project root before running anything.

| Config file present | Tool it selects |
|---|---|
| `biome.json` / `biome.jsonc` | biome (lint + format, JS/TS/JSON) |
| `.eslintrc*` / `eslint.config.*` | eslint (lint) |
| `.prettierrc*` / `prettier.config.*` | prettier (format) |
| `ruff.toml` / `[tool.ruff]` in `pyproject.toml` | ruff (lint + format, Python) |
| `.flake8` / `setup.cfg [flake8]` | flake8 (lint) |
| `[tool.black]` in `pyproject.toml` | black (format) |
| `.rubocop.yml` | rubocop (Ruby) |
| `.golangci.yml` | golangci-lint (Go) |
| `rustfmt.toml` / `.rustfmt.toml` | rustfmt (format) |
| `.clippy.toml` | clippy (lint) |
| `.stylelintrc*` | stylelint (CSS) |
| `.markdownlint*` | markdownlint (Markdown) |
| `.shellcheckrc` | shellcheck (shell) |

A config file wins over the language default. Two configs (e.g. eslint +
prettier) means run both: lint tool, then format tool.

## Canonical commands per language

Run through `bash`. `<paths>` defaults to the changed files, else the project
root. Prefer the check form; use the write form only when asked to fix or
format.

| Language | Lint (check) | Format (write) |
|---|---|---|
| JS / TS | `biome check <paths>` or `eslint <paths>` | `biome format --write <paths>` or `prettier -w <paths>` |
| Python | `ruff check <paths>` | `ruff format <paths>` or `black <paths>` |
| Go | `go vet ./...` then `golangci-lint run` | `gofmt -w <paths>` or `goimports -w <paths>` |
| Rust | `cargo clippy` | `cargo fmt` |
| Ruby | `rubocop <paths>` | `rubocop -A <paths>` |
| Java | `mvn checkstyle:check` or `gradle check` | `google-java-format -i <paths>` |
| Kotlin | `ktlint` / `detekt` | `ktlint -F` |
| C / C++ | `cppcheck <paths>` / `clang-tidy` | `clang-format -i <paths>` |
| C# | `dotnet format --verify-no-changes` | `dotnet format` |
| Swift | `swiftlint` | `swift-format -i <paths>` |
| PHP | `phpstan analyse` / `php -l` | `php-cs-fixer fix` |
| Elixir | `mix credo` | `mix format` |
| Shell | `shellcheck <paths>` | `shfmt -w <paths>` |
| SQL | `sqlfluff lint <paths>` | `sqlfluff fix <paths>` |
| YAML | `yamllint <paths>` | — |
| CSS | `stylelint <paths>` | `stylelint --fix <paths>` or `prettier -w` |
| HTML | `htmlhint <paths>` | `prettier -w <paths>` |
| Markdown | `markdownlint <paths>` | `markdownlint --fix <paths>` |
| TOML | `taplo lint <paths>` | `taplo fmt <paths>` |
| Docker | `hadolint <Dockerfile>` | — |
| GitHub Actions | `actionlint` | — |
| Terraform | `tflint` | `terraform fmt` |

## Package manager prefix

Run the tool the way the project installed it, so the local version and config
apply. Detect from the lockfile:

- `bun.lock` → `bunx <tool>` or `bun run <script>`
- `package-lock.json` → `npx <tool>` or `npm run <script>`
- `pnpm-lock.yaml` → `pnpm exec <tool>`
- `yarn.lock` → `yarn <tool>`
- Python with `uv.lock` → `uv run <tool>`; with Poetry → `poetry run <tool>`
- Rust / Go → the tool is the toolchain (`cargo`, `go`), run directly.

A tool on `PATH` with no local install runs directly.

## Rules

- Check before write. Show the check output first. Apply the fix form only when
  the user asks to fix or format, or when they already approved auto-fix.
- One language per command. A polyglot repo needs one run per language on its
  own files, not one command over everything.
- Missing binary: report it and the install command, then stop. Do not install
  without consent.
- Do not re-lint what the language server already reported. If `lens_diagnostics`
  covers the type errors, run only the style linter on top.
- Keep output bounded. On a large repo, lint the changed files, not the tree.
