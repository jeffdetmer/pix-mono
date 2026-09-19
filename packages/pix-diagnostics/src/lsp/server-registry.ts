/**
 * server-registry.ts — data-only LSP server catalog and root detection.
 *
 * This module never spawns a process or installs a binary. It maps a file to
 * one language-server spec and finds the nearest project root by walking parent
 * directories for a named marker. The manager resolves the actual command with
 * `findExecutable` and launches it.
 *
 * Only servers that launch with a direct standard-input command are listed.
 * Special launch protocols (PowerShell Editor Services, OmniSharp, JDTLS) are
 * deferred.
 */

import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { findExecutable } from "@xynogen/pix-runtime/which";

export interface LspServerSpec {
	id: string;
	name: string;
	extensions: readonly string[];
	filenames?: readonly string[];
	commands: readonly string[];
	args: readonly string[];
	rootMarkers: readonly string[];
	languageId(filePath: string): string;
}

export interface ResolvedLspServer {
	spec: LspServerSpec;
	command: string;
	root: string;
}

const GIT = ".git";

export const LSP_SERVERS: readonly LspServerSpec[] = [
	{
		id: "typescript",
		name: "TypeScript Language Server",
		extensions: [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"],
		commands: ["typescript-language-server"],
		args: ["--stdio"],
		rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json", GIT],
		languageId(filePath) {
			if (filePath.endsWith(".tsx")) return "typescriptreact";
			if (filePath.endsWith(".jsx")) return "javascriptreact";
			return /\.[mc]?js$/.test(filePath) ? "javascript" : "typescript";
		},
	},
	{
		id: "python",
		name: "Pyright Language Server",
		extensions: [".py", ".pyi"],
		commands: ["pyright-langserver", "basedpyright-langserver"],
		args: ["--stdio"],
		rootMarkers: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", GIT],
		languageId: () => "python",
	},
	{
		id: "go",
		name: "gopls",
		extensions: [".go"],
		commands: ["gopls"],
		args: [],
		rootMarkers: ["go.work", "go.mod", GIT],
		languageId: () => "go",
	},
	{
		id: "rust",
		name: "rust-analyzer",
		extensions: [".rs"],
		commands: ["rust-analyzer"],
		args: [],
		rootMarkers: ["Cargo.toml", "Cargo.lock", GIT],
		languageId: () => "rust",
	},
	{
		id: "cpp",
		name: "clangd",
		extensions: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx", ".inl", ".ipp"],
		commands: ["clangd"],
		args: ["--background-index"],
		rootMarkers: ["compile_commands.json", "compile_flags.txt", "CMakeLists.txt", GIT],
		languageId: (filePath) => (/\.(c|h)$/.test(filePath) ? "c" : "cpp"),
	},
	{
		id: "ruby",
		name: "Ruby LSP",
		extensions: [".rb", ".rake", ".ru", ".gemspec"],
		commands: ["ruby-lsp"],
		args: [],
		rootMarkers: ["Gemfile", ".ruby-version", GIT],
		languageId: () => "ruby",
	},
	{
		id: "php",
		name: "Intelephense",
		extensions: [".php"],
		commands: ["intelephense"],
		args: ["--stdio"],
		rootMarkers: ["composer.json", "composer.lock", GIT],
		languageId: () => "php",
	},
	{
		id: "lua",
		name: "Lua Language Server",
		extensions: [".lua"],
		commands: ["lua-language-server"],
		args: [],
		rootMarkers: [".luarc.json", ".luacheckrc", GIT],
		languageId: () => "lua",
	},
	{
		id: "zig",
		name: "ZLS",
		extensions: [".zig", ".zon"],
		commands: ["zls"],
		args: [],
		rootMarkers: ["build.zig", GIT],
		languageId: () => "zig",
	},
	{
		id: "haskell",
		name: "Haskell Language Server",
		extensions: [".hs", ".lhs"],
		commands: ["haskell-language-server-wrapper", "haskell-language-server"],
		args: ["--lsp"],
		rootMarkers: ["stack.yaml", "cabal.project", GIT],
		languageId: () => "haskell",
	},
	{
		id: "elixir",
		name: "Expert",
		extensions: [".ex", ".exs"],
		commands: ["expert"],
		args: ["--stdio"],
		rootMarkers: ["mix.exs", GIT],
		languageId: () => "elixir",
	},
	{
		id: "gleam",
		name: "Gleam LSP",
		extensions: [".gleam"],
		commands: ["gleam"],
		args: ["lsp"],
		rootMarkers: ["gleam.toml", GIT],
		languageId: () => "gleam",
	},
	{
		id: "dart",
		name: "Dart Analysis Server",
		extensions: [".dart"],
		commands: ["dart"],
		args: ["language-server", "--protocol=lsp"],
		rootMarkers: ["pubspec.yaml", GIT],
		languageId: () => "dart",
	},
	{
		id: "kotlin",
		name: "Kotlin Language Server",
		extensions: [".kt", ".kts"],
		commands: ["kotlin-lsp", "kotlin-language-server"],
		args: [],
		rootMarkers: ["build.gradle.kts", "build.gradle", "pom.xml", GIT],
		languageId: () => "kotlin",
	},
	{
		id: "fsharp",
		name: "FSAutocomplete",
		extensions: [".fs", ".fsi", ".fsx"],
		commands: ["fsautocomplete"],
		args: [],
		rootMarkers: [".git"],
		languageId: () => "fsharp",
	},
	{
		id: "ocaml",
		name: "ocamllsp",
		extensions: [".ml", ".mli"],
		commands: ["ocamllsp"],
		args: [],
		rootMarkers: ["dune-project", "opam", GIT],
		languageId: () => "ocaml",
	},
	{
		id: "clojure",
		name: "Clojure LSP",
		extensions: [".clj", ".cljc", ".cljs", ".edn"],
		commands: ["clojure-lsp"],
		args: [],
		rootMarkers: ["deps.edn", "project.clj", GIT],
		languageId: () => "clojure",
	},
	{
		id: "cue",
		name: "CUE Language Server",
		extensions: [".cue"],
		commands: ["cue"],
		args: ["lsp", "serve"],
		rootMarkers: ["cue.mod", GIT],
		languageId: () => "cue",
	},
	{
		id: "terraform",
		name: "Terraform LSP",
		extensions: [".tf", ".tfvars"],
		commands: ["terraform-ls"],
		args: ["serve"],
		rootMarkers: [".terraform.lock.hcl", ".terraform", GIT],
		languageId: () => "terraform",
	},
	{
		id: "nix",
		name: "nixd",
		extensions: [".nix"],
		commands: ["nixd"],
		args: [],
		rootMarkers: ["flake.nix", GIT],
		languageId: () => "nix",
	},
	{
		id: "bash",
		name: "Bash Language Server",
		extensions: [".bash", ".sh", ".zsh"],
		commands: ["bash-language-server"],
		args: ["start"],
		rootMarkers: [GIT],
		languageId: () => "shellscript",
	},
	{
		id: "fish",
		name: "Fish Language Server",
		extensions: [".fish"],
		commands: ["fish-lsp"],
		args: ["start"],
		rootMarkers: [GIT],
		languageId: () => "fish",
	},
	{
		id: "cmake",
		name: "CMake Language Server",
		extensions: [".cmake"],
		filenames: ["CMakeLists.txt"],
		commands: ["cmake-language-server"],
		args: [],
		rootMarkers: ["CMakeLists.txt", GIT],
		languageId: () => "cmake",
	},
	{
		id: "docker",
		name: "Dockerfile Language Server",
		extensions: [".dockerfile"],
		filenames: ["Dockerfile"],
		commands: ["docker-langserver"],
		args: ["--stdio"],
		rootMarkers: [GIT],
		languageId: () => "dockerfile",
	},
	{
		id: "yaml",
		name: "YAML Language Server",
		extensions: [".yaml", ".yml"],
		commands: ["yaml-language-server"],
		args: ["--stdio"],
		rootMarkers: [GIT],
		languageId: () => "yaml",
	},
	{
		id: "json",
		name: "VSCode JSON Language Server",
		extensions: [".json", ".json5", ".jsonc"],
		commands: ["vscode-json-language-server"],
		args: ["--stdio"],
		rootMarkers: [GIT],
		languageId: (filePath) => (filePath.endsWith(".jsonc") ? "jsonc" : "json"),
	},
	{
		id: "html",
		name: "VSCode HTML Language Server",
		extensions: [".htm", ".html"],
		commands: ["vscode-html-language-server"],
		args: ["--stdio"],
		rootMarkers: [GIT],
		languageId: () => "html",
	},
	{
		id: "css",
		name: "CSS Language Server",
		extensions: [".css", ".less", ".scss", ".sass"],
		commands: ["vscode-css-language-server"],
		args: ["--stdio"],
		rootMarkers: [GIT],
		languageId: (filePath) => extname(filePath).slice(1) || "css",
	},
	{
		id: "toml",
		name: "Taplo",
		extensions: [".toml"],
		commands: ["taplo"],
		args: ["lsp", "stdio"],
		rootMarkers: [GIT],
		languageId: () => "toml",
	},
	{
		id: "prisma",
		name: "Prisma Language Server",
		extensions: [".prisma"],
		commands: ["prisma-language-server"],
		args: ["--stdio"],
		rootMarkers: ["prisma/schema.prisma", "schema.prisma", GIT],
		languageId: () => "prisma",
	},
	{
		id: "swift",
		name: "SourceKit-LSP",
		extensions: [".swift"],
		commands: ["sourcekit-lsp"],
		args: [],
		rootMarkers: ["Package.swift", GIT],
		languageId: () => "swift",
	},
	{
		id: "typst",
		name: "Tinymist",
		extensions: [".typ"],
		commands: ["tinymist"],
		args: ["lsp"],
		rootMarkers: ["typst.toml", GIT],
		languageId: () => "typst",
	},
	{
		id: "markdown",
		name: "Marksman",
		extensions: [".md", ".mdx"],
		commands: ["marksman"],
		args: ["server"],
		rootMarkers: [".marksman.toml", GIT],
		languageId: () => "markdown",
	},
];

const basename = (filePath: string): string => filePath.split(/[/\\]/).pop() ?? filePath;

/** Find the server spec that owns a file's extension or exact basename. */
export function findServerSpec(filePath: string): LspServerSpec | undefined {
	const ext = extname(filePath).toLowerCase();
	const name = basename(filePath);
	return LSP_SERVERS.find(
		(spec) =>
			spec.extensions.includes(ext) ||
			(spec.filenames?.some((f) => f.toLowerCase() === name.toLowerCase()) ?? false),
	);
}

type AccessFn = (path: string) => Promise<boolean>;

const defaultAccess: AccessFn = async (path) => {
	const { access } = await import("node:fs/promises");
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
};

/**
 * Walk parent directories from the file until a marker exists. Stop at the home
 * directory or filesystem root. Return the file's directory when no marker is
 * found. Checks only the named marker paths — it never lists directory contents.
 */
export async function rootForFile(
	filePath: string,
	markers: readonly string[],
	access: AccessFn = defaultAccess,
): Promise<string> {
	const start = dirname(resolve(filePath));
	const stop = homedir();
	let dir = start;
	for (;;) {
		for (const marker of markers) {
			if (await access(join(dir, marker))) return dir;
		}
		const parent = dirname(dir);
		if (parent === dir || dir === stop) break;
		dir = parent;
	}
	return start;
}

/** Resolve a spec's command against PATH. Returns undefined when none runs. */
export async function resolveServer(
	spec: LspServerSpec,
	root: string,
): Promise<ResolvedLspServer | undefined> {
	for (const command of spec.commands) {
		const found = await findExecutable(command);
		if (found) return { spec, command: found, root };
	}
	return undefined;
}

export interface Resolver {
	specFor(filePath: string): LspServerSpec | undefined;
	rootFor(filePath: string, spec: LspServerSpec): Promise<string>;
}

/**
 * Build a resolver bound to the session cwd. JavaScript and TypeScript use the
 * session cwd as root. Other languages use the nearest marker within the cwd.
 * A path outside the cwd uses the nearest marker from its own directory.
 */
export function createResolver(cwd: string): Resolver {
	const base = resolve(cwd);
	return {
		specFor: findServerSpec,
		async rootFor(filePath, spec) {
			const abs = resolve(filePath);
			const insideCwd = abs === base || abs.startsWith(base + "/");
			if (spec.id === "typescript" && insideCwd) return base;
			return rootForFile(abs, spec.rootMarkers);
		},
	};
}
