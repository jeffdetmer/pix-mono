import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDefaults, saveDefaults } from "./defaults.js";

describe("9Router defaults", () => {
	test("uses stable defaults when no file exists", () => {
		expect(loadDefaults(join(tmpdir(), "missing-9router-config.json"))).toEqual({
			searchModel: "exa",
			fetchModel: "exa",
			sttModel: "dg/nova-3",
			ttsModel: "edge-tts/en-US-AriaNeural",
			ttsPlay: true,
			sttDevice: "default",
		});
	});

	test("persists selected defaults", () => {
		const dir = mkdtempSync(join(tmpdir(), "pix-9router-defaults-"));
		const path = join(dir, "defaults.json");
		const defaults = loadDefaults(path);
		defaults.searchModel = "tavily";
		saveDefaults(defaults, path);
		expect(loadDefaults(path).searchModel).toBe("tavily");
	});
});
