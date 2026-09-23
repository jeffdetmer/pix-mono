import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDefaults, saveDefaults } from "./defaults.js";

describe("9Router defaults", () => {
	test("uses stable defaults when no file exists", () => {
		expect(loadDefaults(join(tmpdir(), "missing-9router-config.json"))).toEqual({
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
		defaults.sttModel = "dg/nova-2";
		saveDefaults(defaults, path);
		expect(loadDefaults(path).sttModel).toBe("dg/nova-2");
	});
});
