import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerBuiltinProviders } from "./builtin.ts";
import { splitModel } from "./http.ts";
import { listProviders, registerProvider, resolveProvider } from "./providers.ts";

const saved = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
	process.env = { ...saved };
	globalThis.fetch = originalFetch;
});

interface Captured {
	url: string;
	headers: Headers;
	body: unknown;
}

function captureFetch(reply: () => Response): Captured[] {
	const calls: Captured[] = [];
	globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body });
		return reply();
	}) as unknown as typeof fetch;
	return calls;
}

function audioFile(): string {
	const path = join(mkdtempSync(join(tmpdir(), "pix-voice-audio-")), "clip.wav");
	writeFileSync(path, new Uint8Array([1, 2, 3, 4]));
	return path;
}

function provider<K extends "stt" | "tts">(kind: K, id: string) {
	registerBuiltinProviders();
	const found = listProviders(kind).find((item) => item.id === id);
	if (!found) throw new Error(`${kind} provider ${id} is not registered`);
	return found;
}

describe("provider registry", () => {
	test("registers every 9Router-backed provider family", () => {
		registerBuiltinProviders();
		const ids = (kind: "stt" | "tts") => new Set(listProviders(kind).map((item) => item.id));
		for (const id of [
			"9router",
			"openai",
			"groq",
			"deepgram",
			"assemblyai",
			"gemini",
			"huggingface",
			"nvidia",
			"selfhosted",
		])
			expect(ids("stt").has(id)).toBe(true);
		for (const id of [
			"9router",
			"openai",
			"elevenlabs",
			"gemini",
			"minimax",
			"minimax-cn",
			"fish-audio",
			"cartesia",
			"inworld",
			"nvidia",
			"openrouter",
			"xiaomi-mimo",
			"selfhosted",
		])
			expect(ids("tts").has(id)).toBe(true);
	});

	test("auto takes the first configured provider in registration order", () => {
		registerProvider("stt", {
			id: "test-off",
			defaultModel: "m",
			isConfigured: () => false,
			transcribe: async () => "",
		});
		for (const name of Object.keys(process.env))
			if (name.endsWith("_KEY")) delete process.env[name];
		process.env.GROQ_API_KEY = "groq-key";
		expect(resolveProvider("stt", "auto").id).toBe("groq");
	});

	test("an explicit provider without its key fails with the missing variable", () => {
		registerBuiltinProviders();
		delete process.env.DEEPGRAM_API_KEY;
		expect(() => resolveProvider("stt", "deepgram")).toThrow(/DEEPGRAM_API_KEY/);
	});

	test("splits model and voice at the last slash", () => {
		expect(splitModel("openai/gpt-4o-mini-tts/alloy", "x")).toEqual({
			model: "openai/gpt-4o-mini-tts",
			voice: "alloy",
		});
		expect(splitModel("sonic-2", "default")).toEqual({ model: "sonic-2", voice: "default" });
	});
});

describe("built-in STT providers", () => {
	test("9router posts multipart audio with the router key", async () => {
		process.env.NINEROUTER_URL = "https://router.test";
		process.env.NINEROUTER_KEY = "router-key";
		const calls = captureFetch(() => Response.json({ text: "hello" }));
		const text = await provider("stt", "9router").transcribe({
			file: audioFile(),
			model: "dg/nova-3",
		});
		expect({
			text,
			url: calls[0]?.url,
			auth: calls[0]?.headers.get("authorization"),
			model: (calls[0]?.body as FormData).get("model"),
		}).toEqual({
			text: "hello",
			url: "https://router.test/v1/audio/transcriptions",
			auth: "Bearer router-key",
			model: "dg/nova-3",
		});
	});

	test("deepgram sends raw audio with Token auth and reads the transcript", async () => {
		process.env.DEEPGRAM_API_KEY = "dg-key";
		const calls = captureFetch(() =>
			Response.json({ results: { channels: [{ alternatives: [{ transcript: "hi there" }] }] } }),
		);
		const text = await provider("stt", "deepgram").transcribe({
			file: audioFile(),
			model: "nova-3",
			language: "en",
		});
		const url = new URL(calls[0]?.url ?? "");
		expect({
			text,
			auth: calls[0]?.headers.get("authorization"),
			type: calls[0]?.headers.get("content-type"),
			model: url.searchParams.get("model"),
			language: url.searchParams.get("language"),
		}).toEqual({
			text: "hi there",
			auth: "Token dg-key",
			type: "audio/wav",
			model: "nova-3",
			language: "en",
		});
	});
});

describe("built-in TTS providers", () => {
	test("openai splits model/voice and returns the requested format", async () => {
		process.env.OPENAI_API_KEY = "oa-key";
		const calls = captureFetch(() => new Response(new Uint8Array([9, 9, 9])));
		const speech = await provider("tts", "openai").synthesize({
			input: "Hi",
			model: "gpt-4o-mini-tts/nova",
			format: "wav",
		});
		expect({
			bytes: [...speech.audio],
			format: speech.format,
			body: JSON.parse(String(calls[0]?.body)),
		}).toEqual({
			bytes: [9, 9, 9],
			format: "wav",
			body: { model: "gpt-4o-mini-tts", voice: "nova", input: "Hi", response_format: "wav" },
		});
	});

	test("gemini wraps 24 kHz PCM in a WAV header", async () => {
		process.env.GEMINI_API_KEY = "g-key";
		const pcm = Buffer.from([1, 0, 2, 0]).toString("base64");
		captureFetch(() =>
			Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: pcm } }] } }] }),
		);
		const speech = await provider("tts", "gemini").synthesize({
			input: "Hi",
			model: "gemini-2.5-flash-preview-tts/Kore",
			format: "mp3",
		});
		const header = Buffer.from(speech.audio.slice(0, 44));
		expect({
			format: speech.format,
			riff: header.toString("ascii", 0, 4),
			rate: header.readUInt32LE(24),
			size: speech.audio.byteLength,
		}).toEqual({ format: "wav", riff: "RIFF", rate: 24_000, size: 48 });
	});

	test("minimax decodes hex audio and surfaces a status error", async () => {
		process.env.MINIMAX_API_KEY = "mm-key";
		captureFetch(() => Response.json({ base_resp: { status_code: 0 }, data: { audio: "0aff" } }));
		const ok = await provider("tts", "minimax").synthesize({
			input: "Hi",
			model: "speech-2.8-hd/Narrator",
			format: "mp3",
		});
		expect([...ok.audio]).toEqual([10, 255]);

		captureFetch(() =>
			Response.json({ base_resp: { status_code: 1004, status_msg: "invalid api key" } }),
		);
		await expect(
			provider("tts", "minimax").synthesize({ input: "Hi", model: "speech-2.8-hd", format: "mp3" }),
		).rejects.toThrow("invalid api key");
	});
});
