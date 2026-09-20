import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSpeechRequest, playerCommand, saveSpeech } from "./tts.js";

const oldBase = process.env.ROUTER_API_BASE;
const oldApiKey = process.env.ROUTER_API_KEY;
const oldUrl = process.env.NINEROUTER_URL;
const oldKey = process.env.NINEROUTER_KEY;

afterEach(() => {
	if (oldBase === undefined) delete process.env.ROUTER_API_BASE;
	else process.env.ROUTER_API_BASE = oldBase;
	if (oldApiKey === undefined) delete process.env.ROUTER_API_KEY;
	else process.env.ROUTER_API_KEY = oldApiKey;
	if (oldUrl === undefined) delete process.env.NINEROUTER_URL;
	else process.env.NINEROUTER_URL = oldUrl;
	if (oldKey === undefined) delete process.env.NINEROUTER_KEY;
	else process.env.NINEROUTER_KEY = oldKey;
});

describe("9Router TTS", () => {
	test("builds the upstream speech request from the existing router env", () => {
		process.env.ROUTER_API_BASE = "https://router.test/v1";
		process.env.ROUTER_API_KEY = "secret";
		const request = buildSpeechRequest("Hello", "openai/tts-1/alloy", "mp3");
		expect(request.url).toBe("https://router.test/v1/audio/speech?response_format=mp3");
		expect(request.init.headers).toEqual({
			Authorization: "Bearer secret",
			"Content-Type": "application/json",
		});
		expect(request.init.body).toBe(JSON.stringify({ model: "openai/tts-1/alloy", input: "Hello" }));
	});

	test("accepts canonical upstream environment names", () => {
		delete process.env.ROUTER_API_BASE;
		delete process.env.ROUTER_API_KEY;
		process.env.NINEROUTER_URL = "https://router.test";
		process.env.NINEROUTER_KEY = "canonical-secret";
		const request = buildSpeechRequest("Hello", "edge-tts/en-US-AriaNeural", "mp3");
		expect(request.url).toBe("https://router.test/v1/audio/speech?response_format=mp3");
		expect(request.init.headers).toMatchObject({ Authorization: "Bearer canonical-secret" });
	});

	test("canonical environment names override legacy aliases", () => {
		process.env.NINEROUTER_URL = "https://canonical.test";
		process.env.NINEROUTER_KEY = "canonical-secret";
		process.env.ROUTER_API_BASE = "https://legacy.test/v1";
		process.env.ROUTER_API_KEY = "legacy-secret";
		const request = buildSpeechRequest("Hello", "openai/tts-1", "mp3");
		expect(request.url).toStartWith("https://canonical.test/v1/");
		expect(request.init.headers).toMatchObject({ Authorization: "Bearer canonical-secret" });
	});

	test("selects one supported local player command", () => {
		expect(playerCommand("/tmp/speech.mp3", new Set(["ffplay"]))).toEqual([
			"ffplay",
			"-nodisp",
			"-autoexit",
			"-loglevel",
			"error",
			"/tmp/speech.mp3",
		]);
		expect(playerCommand("/tmp/speech.mp3", new Set())).toBeUndefined();
	});

	test("saves audio bytes without text conversion", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pix-tts-"));
		const path = join(dir, "speech.mp3");
		await saveSpeech(path, new Uint8Array([0, 255, 17, 128]));
		expect([...new Uint8Array(await readFile(path))]).toEqual([0, 255, 17, 128]);
		await rm(dir, { recursive: true, force: true });
	});
});
