import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createResolver, loadProjectServers, rootForFile } from "./server-registry.ts";

const access = async (path: string) => path === "/repo/package.json";

function project(config?: unknown): string {
	const cwd = mkdtempSync(join(tmpdir(), "pix-lsp-"));
	if (config !== undefined) {
		mkdirSync(join(cwd, ".pi"));
		writeFileSync(join(cwd, ".pi", "lsp.json"), JSON.stringify(config));
	}
	return cwd;
}

const pythonConfig = {
	servers: {
		python: {
			command: "pyright-langserver",
			args: ["--stdio"],
			extensions: [".py", ".pyi"],
			languageId: "python",
			rootMarkers: ["pyproject.toml", ".git"],
		},
	},
};

describe("project LSP configuration", () => {
	test("has no built-in server choices", () => {
		const cwd = project();
		expect(loadProjectServers(cwd)).toEqual([]);
		expect(createResolver(cwd).specFor(join(cwd, "main.py"))).toBeUndefined();
	});

	test("loads the server selected by the project", () => {
		const cwd = project(pythonConfig);
		const spec = createResolver(cwd).specFor(join(cwd, "main.py"));
		expect(spec?.id).toBe("python");
		expect(spec?.commands).toEqual(["pyright-langserver"]);
		expect(spec?.args).toEqual(["--stdio"]);
		expect(spec?.languageId("main.py")).toBe("python");
	});

	test("ignores invalid project configuration", () => {
		const cwd = project({ servers: { python: { command: 42 } } });
		expect(loadProjectServers(cwd)).toEqual([]);
	});

	test("uses the nearest root marker", async () => {
		expect(await rootForFile("/repo/src/a.ts", ["package.json"], access)).toBe("/repo");
	});
});
