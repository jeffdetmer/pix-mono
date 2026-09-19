/**
 * grammars.ts — lazy, package-owned multi-language grammar loading.
 *
 * The napi addon bundles six grammars (see engine.ts). Every other ast-grep
 * language ships as its own `@ast-grep/lang-<x>` npm package. This module loads
 * one on demand:
 *
 *   1. If napi already parses it (the six), no grammar is needed.
 *   2. Else try to import `@ast-grep/lang-<x>` from the pix cache, then from
 *      this package's own node_modules.
 *   3. If absent, report `needs-install` with the exact package name. The tool
 *      asks the user once, then this module installs it INTO the pix cache
 *      (never the agent, never a global write). A later call finds it cached.
 *
 * The cache lives at `<agentDir>/pix-astgrep/grammars`. We install with the
 * user's package manager into that private prefix, so a read-only global pix
 * install still works.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { isBundled, loadEngine, parse, parseDynamic, type SgNode } from "./engine.ts";

const run = promisify(execFile);

/** Canonical language alias → its `@ast-grep/lang-*` package name. */
const LANG_PACKAGE: Record<string, string> = {
	python: "@ast-grep/lang-python",
	go: "@ast-grep/lang-go",
	rust: "@ast-grep/lang-rust",
	java: "@ast-grep/lang-java",
	c: "@ast-grep/lang-c",
	cpp: "@ast-grep/lang-cpp",
	csharp: "@ast-grep/lang-csharp",
	ruby: "@ast-grep/lang-ruby",
	php: "@ast-grep/lang-php",
	swift: "@ast-grep/lang-swift",
	kotlin: "@ast-grep/lang-kotlin",
	scala: "@ast-grep/lang-scala",
	lua: "@ast-grep/lang-lua",
	elixir: "@ast-grep/lang-elixir",
	json: "@ast-grep/lang-json",
	yaml: "@ast-grep/lang-yaml",
	bash: "@ast-grep/lang-bash",
	hcl: "@ast-grep/lang-hcl",
	haskell: "@ast-grep/lang-haskell",
	nix: "@ast-grep/lang-nix",
	solidity: "@ast-grep/lang-solidity",
};

/** Languages that need a `@ast-grep/lang-*` package (not the napi six). */
export function packageForLanguage(lang: string): string | undefined {
	return LANG_PACKAGE[lang];
}

/** Resolve the Pi agent dir, honoring PI_CODING_AGENT_DIR and `~`. */
function agentDir(): string {
	const configured = process.env.PI_CODING_AGENT_DIR?.trim();
	if (!configured) return join(homedir(), ".pi", "agent");
	if (configured === "~") return homedir();
	if (configured.startsWith("~/")) return resolve(homedir(), configured.slice(2));
	return resolve(configured);
}

/** Cache root for installed grammars: `<agentDir>/pix-astgrep/grammars`. */
export function grammarCacheDir(): string {
	return join(agentDir(), "pix-astgrep", "grammars");
}

const registered = new Set<string>();
const declined = new Set<string>();

export type GrammarResult =
	| { kind: "ready" }
	| { kind: "napi" }
	| { kind: "needs-install"; pkg: string }
	| { kind: "declined"; pkg: string }
	| { kind: "unsupported" }
	| { kind: "error"; message: string };

/** Import a grammar module from the cache prefix, then this package. */
async function importGrammar(pkg: string): Promise<unknown | undefined> {
	const cached = join(grammarCacheDir(), "node_modules", pkg);
	const candidates = existsSync(cached) ? [pathToFileURL(cached).href, pkg] : [pkg];
	for (const spec of candidates) {
		try {
			const mod = (await import(spec)) as { default?: unknown };
			return mod.default ?? mod;
		} catch {
			// try the next candidate
		}
	}
	return undefined;
}

/**
 * Make a language usable. Returns `ready` when registered, `napi` when the
 * addon already covers it, `needs-install` with the package to install, or
 * `unsupported` for an unknown alias.
 */
export async function ensureLanguage(lang: string): Promise<GrammarResult> {
	const engine = await loadEngine();
	if (!engine) return { kind: "error", message: "ast-grep engine unavailable" };

	// The six bundled grammars never need a package.
	if (["typescript", "tsx", "javascript", "jsx", "css", "html"].includes(lang)) {
		return { kind: "napi" };
	}
	const pkg = packageForLanguage(lang);
	if (!pkg) return { kind: "unsupported" };
	if (registered.has(lang)) return { kind: "ready" };

	const grammar = await importGrammar(pkg);
	if (!grammar) return { kind: "needs-install", pkg };

	try {
		// SAFETY: registerDynamicLanguage is a runtime napi method not in the
		// bundled ESM types; the loaded grammar object is opaque to us.
		const register = (
			engine as unknown as { registerDynamicLanguage(m: Record<string, unknown>): void }
		).registerDynamicLanguage;
		register({ [lang]: grammar as Record<string, unknown> });
		registered.add(lang);
		return { kind: "ready" };
	} catch (err) {
		return { kind: "error", message: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * Install a `@ast-grep/lang-*` package into the pix cache prefix. This runs a
 * network install — the caller must get user consent first. It never touches a
 * global path or this package's own node_modules.
 */
export async function installGrammar(pkg: string): Promise<{ ok: boolean; message?: string }> {
	const dir = grammarCacheDir();
	try {
		await mkdir(dir, { recursive: true });
		// A minimal package.json so npm installs into this prefix cleanly.
		const pkgJson = join(dir, "package.json");
		if (!existsSync(pkgJson)) {
			const { writeFile } = await import("node:fs/promises");
			await writeFile(pkgJson, JSON.stringify({ name: "pix-astgrep-grammars", private: true }));
		}
		await run("npm", ["install", "--no-save", "--prefix", dir, pkg], {
			cwd: dir,
			timeout: 120_000,
		});
		return { ok: true };
	} catch (err) {
		return { ok: false, message: err instanceof Error ? err.message : String(err) };
	}
}

/** For tests: forget which languages were registered this process. */
export function resetRegistered(): void {
	registered.clear();
}

export type ParseOutcome = { kind: "ok"; root: SgNode } | GrammarResult;

/** A one-time consent callback: return true to install `pkg`. */
export type ConsentFn = (pkg: string) => Promise<boolean>;

/**
 * Parse one file's source for any language alias, installing a missing grammar
 * with consent. The bundled six always parse. A non-bundled language is loaded
 * from the pix cache. When absent, `consent(pkg)` decides whether to install it
 * INTO the cache (once per language). A declined language is remembered so the
 * caller is not asked again this session.
 */
export async function parseWithGrammar(
	lang: string,
	source: string,
	consent?: ConsentFn,
): Promise<ParseOutcome> {
	const engine = await loadEngine();
	if (!engine) return { kind: "error", message: "ast-grep engine unavailable" };

	try {
		if (isBundled(lang)) return { kind: "ok", root: parse(engine, lang, source) };
		if (declined.has(lang)) {
			return { kind: "declined", pkg: packageForLanguage(lang) ?? lang };
		}

		let ready = await ensureLanguage(lang);
		if (ready.kind === "needs-install") {
			if (!consent || !(await consent(ready.pkg))) {
				declined.add(lang);
				return { kind: "declined", pkg: ready.pkg };
			}
			const installed = await installGrammar(ready.pkg);
			if (!installed.ok) {
				return { kind: "error", message: installed.message ?? `failed to install ${ready.pkg}` };
			}
			ready = await ensureLanguage(lang);
		}
		if (ready.kind !== "ready") return ready;
		return { kind: "ok", root: parseDynamic(engine, lang, source) };
	} catch (err) {
		return { kind: "error", message: err instanceof Error ? err.message : String(err) };
	}
}
