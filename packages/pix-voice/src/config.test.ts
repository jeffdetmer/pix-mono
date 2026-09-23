import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig } from "./config.js";

const missing = join(tmpdir(), "pix-voice-missing.json");

describe("voice config", () => {
	test("uses auto providers and playback when no file exists", () => {
		expect(loadConfig(missing, missing)).toEqual({
			sttProvider: "auto",
			ttsProvider: "auto",
			sttModels: {},
			ttsModels: {},
			ttsPlay: true,
			sttDevice: "default",
		});
	});

	test("persists a provider and a per-provider model", () => {
		const dir = mkdtempSync(join(tmpdir(), "pix-voice-config-"));
		const path = join(dir, "voice.json");
		const config = loadConfig(path, missing);
		config.sttProvider = "groq";
		config.sttModels.groq = "whisper-large-v3";
		saveConfig(config, path);
		expect(loadConfig(path, missing)).toMatchObject({
			sttProvider: "groq",
			sttModels: { groq: "whisper-large-v3" },
		});
	});

	test("seeds 9router models from the old pix-9router file", () => {
		const dir = mkdtempSync(join(tmpdir(), "pix-voice-legacy-"));
		const legacy = join(dir, "9router.json");
		writeFileSync(
			legacy,
			JSON.stringify({ sttModel: "dg/nova-2", ttsModel: "openai/tts-1/nova", ttsPlay: false }),
		);
		expect(loadConfig(join(dir, "voice.json"), legacy)).toMatchObject({
			sttModels: { "9router": "dg/nova-2" },
			ttsModels: { "9router": "openai/tts-1/nova" },
			ttsPlay: false,
		});
	});
});
