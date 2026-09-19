/**
 * integration.test.ts — one end-to-end check with the fake LSP server.
 *
 * It wires the real extension, store, manager, and transport, and points the
 * manager at the temp fake server. It confirms the lazy lifecycle: no child
 * before the first LSP tool call, one child after, and no child after shutdown.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import registerDiagnostics from "./diagnostics.ts";
import { createManagerWith, type ManagerDeps, type ResolveResult } from "./lsp/manager.ts";
import type { LspServerSpec, ResolvedLspServer } from "./lsp/server-registry.ts";
import { LspTransport } from "./lsp/transport.ts";

const fakeServerPath = join(import.meta.dir, "lsp", "fake-server.fixture.ts");

const spec: LspServerSpec = {
	id: "typescript",
	name: "Fake TS",
	extensions: [".ts"],
	commands: [process.execPath],
	args: [fakeServerPath],
	rootMarkers: ["package.json"],
	languageId: () => "typescript",
};

interface CapturedTool {
	name: string;
	execute: (
		id: string,
		params: Record<string, unknown>,
	) => Promise<{ content: Array<{ text: string }>; details?: unknown }>;
}

function harness(cwd: string) {
	let starts = 0;
	const deps: ManagerDeps = {
		async resolve(): Promise<ResolveResult> {
			const resolved: ResolvedLspServer = { spec, command: process.execPath, root: cwd };
			return { kind: "ok", resolved };
		},
		async start(resolved) {
			starts++;
			return LspTransport.start({
				command: resolved.command,
				args: [...resolved.spec.args],
				cwd: resolved.root,
				rootUri: pathToFileURL(resolved.root).href,
				serverId: resolved.spec.id,
			});
		},
		readFile: async () => "const x: number = 'bad';\n",
		now: () => Date.now(),
		setTimer: (fn, ms) => {
			const h = setTimeout(fn, ms);
			h.unref?.();
			return h as never;
		},
		clearTimer: (h) => clearTimeout(h as never),
	};
	const manager = createManagerWith(deps, { idleMs: 60_000 });

	const tools: CapturedTool[] = [];
	const handlers = new Map<string, (e: unknown, c: unknown) => unknown>();
	const pi = {
		on(event: string, fn: (e: unknown, c: unknown) => unknown) {
			handlers.set(event, fn);
		},
		registerTool(def: CapturedTool) {
			tools.push(def);
		},
	};
	registerDiagnostics(pi as never, { manager, cwd });

	return {
		tools,
		handlers,
		manager,
		get starts() {
			return starts;
		},
	};
}

describe("pix-diagnostics end-to-end", () => {
	test("stays lazy, checks, caches, navigates, and shuts down", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pix-int-"));
		const file = join(cwd, "a.ts");
		writeFileSync(file, "const x: number = 'bad';\n");
		writeFileSync(join(cwd, "package.json"), "{}\n");

		const h = harness(cwd);
		const diag = h.tools.find((t) => t.name === "lens_diagnostics");
		const nav = h.tools.find((t) => t.name === "lsp_navigation");
		if (!diag || !nav) throw new Error("tools missing");

		// A write result must not start any process.
		await h.handlers.get("tool_result")?.({ toolName: "write", input: { path: file } }, {});
		expect(h.starts).toBe(0);

		// The first LSP tool call starts exactly one server and finds one error.
		const fresh = await diag.execute("t1", { source: "lsp", paths: [file] });
		expect(h.starts).toBe(1);
		expect(fresh.content[0]?.text).toContain("Type mismatch");
		expect((fresh.details as { findings: number }).findings).toBe(1);

		// The cached read returns the same finding without another start.
		const cached = await diag.execute("t2", { source: "session" });
		expect(h.starts).toBe(1);
		expect(cached.content[0]?.text).toContain("Type mismatch");

		// Navigation returns one location and reuses the running server.
		const located = await nav.execute("t3", {
			operation: "definition",
			path: file,
			line: 1,
			character: 7,
		});
		expect((located.details as { results: number }).results).toBe(1);

		// Shutdown stops the child.
		await h.handlers.get("session_shutdown")?.({}, { ui: { setStatus() {} } });
		expect(h.manager.activeServerIds()).toHaveLength(0);
	});
});
