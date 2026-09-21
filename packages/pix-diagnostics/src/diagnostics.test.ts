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

	test("shows only files with findings and caps the list at three", () => {
		const store = new DiagnosticStore();
		for (const [index, name] of ["clean.ts", "a.ts", "b.ts", "c.ts", "d.ts"].entries()) {
			store.set({
				filePath: `/repo/${name}`,
				checkedAt: index,
				state: name === "clean.ts" ? "clean" : "findings",
				diagnostics:
					name === "clean.ts"
						? []
						: [
								{
									filePath: `/repo/${name}`,
									severity: "error",
									message: "bad",
									line: 1,
									column: 1,
								},
							],
			});
		}

		const text = renderWidget(store, 200, theme as never).join("\n");
		expect(text).toMatch(/d\.ts, c\.ts, b\.ts \+1/);
		expect(text).not.toContain("clean.ts");
	});

	test("shows the checked file count without findings", () => {
		const store = new DiagnosticStore();
		store.set({ filePath: "/repo/a.ts", checkedAt: 1, state: "clean", diagnostics: [] });
		store.set({ filePath: "/repo/b.ts", checkedAt: 2, state: "unconfirmed", diagnostics: [] });
		store.set({ filePath: "/repo/touched.ts", checkedAt: 3, state: "touched", diagnostics: [] });
		const text = renderWidget(store, 80, theme as never).join("\n");
		expect(text).toMatch(/LSP.*2 files/);
	});

	test("returns no row before LSP checks a file", () => {
		const store = new DiagnosticStore();
		store.set({ filePath: "/repo/touched.ts", checkedAt: 1, state: "touched", diagnostics: [] });
		expect(renderWidget(store, 80, theme as never)).toEqual([]);
	});

	test("fits the row to the terminal width", () => {
		const store = new DiagnosticStore();
		store.set({
			filePath: "/repo/a-very-long-file-name.ts",
			checkedAt: 1,
			state: "findings",
			diagnostics: [
				{
					filePath: "/repo/a-very-long-file-name.ts",
					severity: "error",
					message: "bad",
					line: 1,
					column: 1,
				},
			],
		});
		const [line] = renderWidget(store, 24, theme as never);
		expect(visibleWidth(line ?? "")).toBeLessThanOrEqual(24);
	});
});
