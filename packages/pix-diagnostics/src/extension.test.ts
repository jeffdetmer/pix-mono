import { describe, expect, test } from "bun:test";
import registerExtension from "./extension.ts";

interface Handler {
	event: string;
	fn: (event: unknown, ctx: unknown) => unknown;
}

function mockPi() {
	const handlers: Handler[] = [];
	const tools: Array<{ name: string }> = [];
	const widgetKeys: string[] = [];
	const statuses: Array<{ key: string; value?: string }> = [];
	const pi = {
		on(event: string, fn: (e: unknown, c: unknown) => unknown) {
			handlers.push({ event, fn });
		},
		registerTool(def: { name: string }) {
			tools.push(def);
		},
		registerCommand() {},
	};
	const ctx = {
		ui: {
			setWidget(key: string) {
				widgetKeys.push(key);
			},
			setStatus(key: string, value?: string) {
				statuses.push({ key, value });
			},
		},
	};
	return { pi, ctx, handlers, tools, widgetKeys, statuses };
}

describe("pix-diagnostics extension", () => {
	test("registers exactly the four tools and starts no process", () => {
		const m = mockPi();
		registerExtension(m.pi as never);
		expect(m.tools.map((t) => t.name)).toEqual([
			"lens_diagnostics",
			"lsp_navigation",
			"lens_diagnostic_mark",
			"effective_config",
		]);
	});

	test("uses the footer status instead of an editor widget", () => {
		const m = mockPi();
		registerExtension(m.pi as never);
		const start = m.handlers.find((h) => h.event === "session_start");
		start?.fn({}, m.ctx);
		expect(m.widgetKeys).toEqual([]);
		expect(m.statuses).toContainEqual({ key: "pi-lens-lsp", value: undefined });
	});

	test("a write result sends the touched file to the footer", async () => {
		const m = mockPi();
		registerExtension(m.pi as never);
		const start = m.handlers.find((h) => h.event === "session_start");
		start?.fn({}, m.ctx);

		const toolResult = m.handlers.find((h) => h.event === "tool_result");
		await toolResult?.fn({ toolName: "write", input: { path: "/repo/a.ts" } }, m.ctx);
		expect(m.statuses).toContainEqual({ key: "pi-lens-lsp", value: "LSP a.ts" });
	});

	test("session_shutdown clears the status and shuts down the manager", async () => {
		const m = mockPi();
		registerExtension(m.pi as never);
		const shutdown = m.handlers.find((h) => h.event === "session_shutdown");
		await shutdown?.fn({}, m.ctx);
		expect(m.statuses).toContainEqual({ key: "pi-lens-lsp", value: undefined });
	});

	test("registering twice keeps one set of tools", () => {
		const m = mockPi();
		registerExtension(m.pi as never);
		registerExtension(m.pi as never);
		expect(m.tools.map((t) => t.name)).toEqual([
			"lens_diagnostics",
			"lsp_navigation",
			"lens_diagnostic_mark",
			"effective_config",
		]);
	});
});
