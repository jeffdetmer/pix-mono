/**
 * astgrep.test.ts — one behavior check per tool over a temp fixture tree.
 *
 * These run the real @ast-grep/napi engine. No fake, no network. Each test
 * captures the registered tool and calls its execute against files on disk.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerAstGrep from "./astgrep.ts";

interface Tool {
	name: string;
	execute: (
		id: string,
		params: Record<string, unknown>,
	) => Promise<{ content: Array<{ text: string }>; details?: unknown; isError?: boolean }>;
}

function capture(cwd: string): Map<string, Tool> {
	const tools = new Map<string, Tool>();
	const pi = {
		on() {},
		registerTool(def: Tool) {
			tools.set(def.name, def);
		},
	};
	const prev = process.cwd();
	process.chdir(cwd);
	registerAstGrep(pi as never);
	process.chdir(prev);
	return tools;
}

function fixture(): string {
	const dir = mkdtempSync(join(tmpdir(), "pix-astgrep-"));
	writeFileSync(
		join(dir, "a.ts"),
		[
			"export function greet(name: string): string {",
			"  return 'hi ' + name;",
			"}",
			"const x = greet('a');",
			"const y = greet('b');",
		].join("\n"),
	);
	writeFileSync(join(dir, "b.ts"), "export class Widget {}\nconst w = new Widget();\n");
	return dir;
}

describe("pix-astgrep tools", () => {
	test("registers exactly the six tools", () => {
		const tools = capture(fixture());
		expect([...tools.keys()].sort()).toEqual([
			"ast_grep_outline",
			"ast_grep_replace",
			"ast_grep_search",
			"read_enclosing",
			"read_symbol",
			"symbol_search",
		]);
	});

	test("ast_grep_outline lists top-level declarations with line numbers", async () => {
		const dir = fixture();
		const tool = capture(dir).get("ast_grep_outline");
		if (!tool) throw new Error("tool missing");
		const res = await tool.execute("t", { path: "." });
		expect((res.details as { symbols: number }).symbols).toBeGreaterThanOrEqual(2);
		expect(res.content[0]?.text).toContain("greet");
		expect(res.content[0]?.text).toContain("Widget");
	});

	test("read_enclosing returns the symbol covering a line", async () => {
		const dir = fixture();
		const tool = capture(dir).get("read_enclosing");
		if (!tool) throw new Error("tool missing");
		// Line 2 is inside greet's body.
		const res = await tool.execute("t", { path: "a.ts", line: 2 });
		expect((res.details as { outcome: string }).outcome).toBe("success");
		expect(res.content[0]?.text).toContain("function greet");
	});

	test("ast_grep_replace previews without writing, applies on request", async () => {
		const dir = fixture();
		const tool = capture(dir).get("ast_grep_replace");
		if (!tool) throw new Error("tool missing");
		const preview = await tool.execute("t", {
			pattern: "greet($A)",
			rewrite: "welcome($A)",
			paths: ["a.ts"],
		});
		expect((preview.details as { applied: boolean; edits: number }).applied).toBe(false);
		expect((preview.details as { edits: number }).edits).toBe(2);
		// File is unchanged after a preview.
		expect(readFileSync(join(dir, "a.ts"), "utf8")).toContain("greet('a')");

		const applied = await tool.execute("t", {
			pattern: "greet($A)",
			rewrite: "welcome($A)",
			paths: ["a.ts"],
			apply: true,
		});
		expect((applied.details as { applied: boolean }).applied).toBe(true);
		expect(readFileSync(join(dir, "a.ts"), "utf8")).toContain("welcome('a')");
	});

	test("ast_grep_search finds every call of a pattern", async () => {
		const dir = fixture();
		const tool = capture(dir).get("ast_grep_search");
		if (!tool) throw new Error("tool missing");
		const res = await tool.execute("t", { pattern: "greet($A)", paths: ["."] });
		expect((res.details as { matches: number }).matches).toBe(2);
		expect(res.content[0]?.text).toContain("a.ts:");
	});

	test("read_symbol returns one symbol body with a header line", async () => {
		const dir = fixture();
		const tool = capture(dir).get("read_symbol");
		if (!tool) throw new Error("tool missing");
		const res = await tool.execute("t", { path: "a.ts", symbol: "greet" });
		expect((res.details as { outcome: string }).outcome).toBe("success");
		expect(res.content[0]?.text).toContain("function greet");
		expect(res.content[0]?.text).toContain("a.ts:1");
	});

	test("read_symbol reports a missing symbol as an error", async () => {
		const dir = fixture();
		const tool = capture(dir).get("read_symbol");
		if (!tool) throw new Error("tool missing");
		const res = await tool.execute("t", { path: "a.ts", symbol: "nope" });
		expect(res.isError).toBe(true);
		expect(res.content[0]?.text).toContain("not found");
	});

	test("symbol_search ranks files by identifier and returns the match count", async () => {
		const dir = fixture();
		const tool = capture(dir).get("symbol_search");
		if (!tool) throw new Error("tool missing");
		const res = await tool.execute("t", { query: "greet" });
		const details = res.details as { count: number };
		expect(details.count).toBeGreaterThanOrEqual(1);
		expect(res.content[0]?.text).toContain("a.ts");
	});

	test("symbol_search AND-matches every term", async () => {
		const dir = fixture();
		const tool = capture(dir).get("symbol_search");
		if (!tool) throw new Error("tool missing");
		const res = await tool.execute("t", { query: "greet Widget" });
		// No single file contains both identifiers.
		expect((res.details as { count: number }).count).toBe(0);
	});
});
