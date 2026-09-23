import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface VoiceConfig {
	/** Default STT provider id, or "auto" for the first configured provider. */
	sttProvider: string;
	/** Default TTS provider id, or "auto" for the first configured provider. */
	ttsProvider: string;
	/** Model per STT provider id. A missing entry uses the provider default. */
	sttModels: Record<string, string>;
	/** Model or voice per TTS provider id. A missing entry uses the provider default. */
	ttsModels: Record<string, string>;
	ttsPlay: boolean;
	sttDevice: string;
}

export const CONFIG_PATH = join(homedir(), ".pi", "agent", "voice.json");
/** pix-9router <= 0.6 kept audio defaults here. Read once as a seed, never written. */
export const LEGACY_PATH = join(homedir(), ".pi", "agent", "9router.json");

function fallback(): VoiceConfig {
	return {
		sttProvider: "auto",
		ttsProvider: "auto",
		sttModels: {},
		ttsModels: {},
		ttsPlay: true,
		sttDevice: "default",
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

function stringMap(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object") return {};
	return Object.fromEntries(
		Object.entries(value).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
}

export function loadConfig(path = CONFIG_PATH, legacyPath = LEGACY_PATH): VoiceConfig {
	const config = fallback();
	const item = read(path);
	if (!item) {
		// ponytail: one-way seed from the old pix-9router audio defaults, so an
		// upgrade keeps the user's models. Remove after pix-9router 0.6 is gone.
		const legacy = read(legacyPath);
		if (!legacy) return config;
		if (typeof legacy.sttModel === "string") config.sttModels["9router"] = legacy.sttModel;
		if (typeof legacy.ttsModel === "string") config.ttsModels["9router"] = legacy.ttsModel;
		if (typeof legacy.ttsPlay === "boolean") config.ttsPlay = legacy.ttsPlay;
		if (typeof legacy.sttDevice === "string") config.sttDevice = legacy.sttDevice;
		return config;
	}
	if (typeof item.sttProvider === "string") config.sttProvider = item.sttProvider;
	if (typeof item.ttsProvider === "string") config.ttsProvider = item.ttsProvider;
	config.sttModels = stringMap(item.sttModels);
	config.ttsModels = stringMap(item.ttsModels);
	if (typeof item.ttsPlay === "boolean") config.ttsPlay = item.ttsPlay;
	if (typeof item.sttDevice === "string") config.sttDevice = item.sttDevice;
	return config;
}

export function saveConfig(config: VoiceConfig, path = CONFIG_PATH): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

/** Shared in-memory config. Tool calls never fetch a catalog. */
export const voiceConfig = loadConfig();
