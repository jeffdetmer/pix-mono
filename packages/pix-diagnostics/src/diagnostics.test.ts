import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderWidget } from "./diagnostics.ts";
import { DiagnosticStore } from "./store.ts";

const theme = {
	fg: (role: string, text: string) => `[${role}]${text}[/${role}]`,
};

describe("diagnostic widget", () => {
	test("shows the LSP role, severity counts, and recent files", () => {
		const store = new DiagnosticStore();
		store.set({
			filePath: "/repo/src/a.ts",
			checkedAt: 2,
			state: "findings",
			diagnostics: [
				{ filePath: "/repo/src/a.ts", severity: "error", message: "bad", line: 1, column: 1 },
				{ filePath: "/repo/src/a.ts", severity: "warning", message: "warn", line: 2, column: 1 },
			],
		});

		const text = renderWidget(store, 120, theme as never).join("\n");
		expect(text).toMatch(/LSP.*1 error.*1 warning.*a\.ts/);
	});

	test("returns no row before a file has state", () => {
		expect(renderWidget(new DiagnosticStore(), 80, theme as never)).toEqual([]);
	});

	test("fits the row to the terminal width", () => {
		const store = new DiagnosticStore();
		store.set({
			filePath: "/repo/a-very-long-file-name.ts",
			checkedAt: 1,
			state: "clean",
			diagnostics: [],
		});
		const [line] = renderWidget(store, 24, theme as never);
		expect(visibleWidth(line ?? "")).toBeLessThanOrEqual(24);
	});
});
