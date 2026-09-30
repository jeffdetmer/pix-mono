import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "@xynogen/pix-runtime/paths";
import { patchOutBuiltinMcp } from "../src/patch-builtin.ts";

describe("disable built-in MCP in settings", () => {
	it("adds one exclusion without changing other settings on repeated loads", () => {
		const path = join(mkdtempSync(join(tempDir(), "pix-mcp-settings-")), "settings.json");
		writeFileSync(path, '{"theme":"system","extensions":["other"]}\n');
		expect(patchOutBuiltinMcp(path)).toBe(true);
		const first = readFileSync(path, "utf8");
		expect(JSON.parse(first)).toEqual({
			theme: "system",
			extensions: ["other", "-builtin:mcp"],
		});
		expect(patchOutBuiltinMcp(path)).toBe(false);
		expect(readFileSync(path, "utf8")).toBe(first);
	});

	it("does not overwrite invalid settings or an explicit inclusion", () => {
		const path = join(mkdtempSync(join(tempDir(), "pix-mcp-settings-")), "settings.json");
		writeFileSync(path, "{invalid");
		expect(() => patchOutBuiltinMcp(path)).toThrow();
		expect(readFileSync(path, "utf8")).toBe("{invalid");
		const explicit = '{"extensions":["+builtin:mcp"]}\n';
		writeFileSync(path, explicit);
		expect(patchOutBuiltinMcp(path)).toBe(false);
		expect(readFileSync(path, "utf8")).toBe(explicit);
	});
});
