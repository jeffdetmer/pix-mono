import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseLanguage, saveConfig } from "./config.js";

const missing = join(tmpdir(), "pix-voice-missing.json");

describe("voice config", () => {
	test("uses auto providers and playback when no file exists", () => {
		expect(loadConfig(missing, missing)).toEqual({
			sttProvider: "auto",
			ttsProvider: "auto",
			sttNineRouterModel: "dg/nova-3",
			ttsNineRouterModel: "edge-tts/en-US-AriaNeural",
			ttsPlay: true,
			sttDevice: "default",
			sttLanguage: "auto",
			sttShortcut: "ctrl+alt+z",
			sttCleanup: "off",
		});
	});

	test("persists a provider and the 9router model", () => {
		const dir = mkdtempSync(join(tmpdir(), "pix-voice-config-"));
		const path = join(dir, "voice.json");
		const config = loadConfig(path, missing);
		config.sttProvider = "groq";
		config.sttNineRouterModel = "dg/nova-2";
		saveConfig(config, path);
		expect(loadConfig(path, missing)).toMatchObject({
			sttProvider: "groq",
			sttNineRouterModel: "dg/nova-2",
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
			sttNineRouterModel: "dg/nova-2",
			ttsNineRouterModel: "openai/tts-1/nova",
			ttsPlay: false,
		});
	});

	test("accepts language codes and auto, and rejects other text", () => {
		expect(parseLanguage(" EN ")).toBe("en");
		expect(parseLanguage("pt-BR")).toBe("pt-br");
		expect(parseLanguage("")).toBe("auto");
		expect(() => parseLanguage("English")).toThrow(/not a language code/);
	});
});
