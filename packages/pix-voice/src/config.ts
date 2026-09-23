import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface VoiceConfig {
	/** Default STT provider id, or "auto" for the first configured provider. */
	sttProvider: string;
	/** Default TTS provider id, or "auto" for the first configured provider. */
	ttsProvider: string;
	/** STT model for 9router. Other providers use their default model, the same as pix-web. */
	sttNineRouterModel: string;
	/** TTS "model/voice" for 9router. Other providers use their default model. */
	ttsNineRouterModel: string;
	ttsPlay: boolean;
	sttDevice: string;
	/** Dictation language as an ISO 639-1 code, e.g. "en". "auto" lets the provider detect it. */
	sttLanguage: string;
	/** Push-to-talk key, in Pi key syntax. Read once when Pi starts. */
	sttShortcut: string;
	/** Dictation cleanup model: "off", "current" (the session model), or "provider/model". */
	sttCleanup: string;
}

export const CONFIG_PATH = join(homedir(), ".pi", "agent", "voice.json");
/** pix-9router <= 0.6 kept audio defaults here. Read once as a seed, never written. */
export const LEGACY_PATH = join(homedir(), ".pi", "agent", "9router.json");

function fallback(): VoiceConfig {
	return {
		sttProvider: "auto",
		ttsProvider: "auto",
		sttNineRouterModel: "dg/nova-3",
		ttsNineRouterModel: "edge-tts/en-US-AriaNeural",
		ttsPlay: true,
		sttDevice: "default",
		sttLanguage: "auto",
		sttShortcut: "ctrl+alt+z",
		// Opt-in: cleanup sends each dictation to an LLM and costs tokens.
		sttCleanup: "off",
	};
}

function read(path: string): Record<string, unknown> | undefined {
	try {
		const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
		return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
}

function text(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Normalize a typed language: "" or "auto" means detect. Throws on a value that is not a code. */
export function parseLanguage(value: string): string {
	const code = value.trim().toLowerCase();
	if (!code || code === "auto") return "auto";
	// ISO 639-1 (en), 639-3 (fil), or a region tag (pt-br, zh-cn).
	if (!/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/.test(code))
		throw new Error(
			`"${value}" is not a language code. Use a code like en, id, or pt-br, or auto.`,
		);
	return code;
}

/** The model a provider runs: the typed model for 9router, else the provider default. */
export function voiceModel(
	kind: "stt" | "tts",
	provider: { id: string; defaultModel: string },
): string {
	if (provider.id !== "9router") return provider.defaultModel;
	return kind === "stt" ? voiceConfig.sttNineRouterModel : voiceConfig.ttsNineRouterModel;
}

export function loadConfig(path = CONFIG_PATH, legacyPath = LEGACY_PATH): VoiceConfig {
	const config = fallback();
	const item = read(path);
	if (!item) {
		// ponytail: one-way seed from the old pix-9router audio defaults, so an
		// upgrade keeps the user's models. Remove after pix-9router 0.6 is gone.
		const legacy = read(legacyPath);
		if (!legacy) return config;
		config.sttNineRouterModel = text(legacy.sttModel, config.sttNineRouterModel);
		config.ttsNineRouterModel = text(legacy.ttsModel, config.ttsNineRouterModel);
		if (typeof legacy.ttsPlay === "boolean") config.ttsPlay = legacy.ttsPlay;
		if (typeof legacy.sttDevice === "string") config.sttDevice = legacy.sttDevice;
		return config;
	}
	if (typeof item.sttProvider === "string") config.sttProvider = item.sttProvider;
	if (typeof item.ttsProvider === "string") config.ttsProvider = item.ttsProvider;
	config.sttNineRouterModel = text(item.sttNineRouterModel, config.sttNineRouterModel);
	config.ttsNineRouterModel = text(item.ttsNineRouterModel, config.ttsNineRouterModel);
	if (typeof item.ttsPlay === "boolean") config.ttsPlay = item.ttsPlay;
	if (typeof item.sttDevice === "string") config.sttDevice = item.sttDevice;
	config.sttLanguage = text(item.sttLanguage, config.sttLanguage).toLowerCase();
	config.sttShortcut = text(item.sttShortcut, config.sttShortcut);
	config.sttCleanup = text(item.sttCleanup, config.sttCleanup);
	return config;
}

export function saveConfig(config: VoiceConfig, path = CONFIG_PATH): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

/** Shared in-memory config. Tool calls never fetch a catalog. */
export const voiceConfig = loadConfig();
