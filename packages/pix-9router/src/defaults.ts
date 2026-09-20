import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface RouterDefaults {
	searchModel: string;
	fetchModel: string;
	sttModel: string;
	ttsModel: string;
	ttsPlay: boolean;
}

export const DEFAULTS_PATH = join(homedir(), ".pi", "agent", "9router.json");

const FALLBACK: RouterDefaults = {
	searchModel: "exa",
	fetchModel: "exa",
	sttModel: "dg/nova-3",
	ttsModel: "edge-tts/en-US-AriaNeural",
	ttsPlay: true,
};

export function loadDefaults(path = DEFAULTS_PATH): RouterDefaults {
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return { ...FALLBACK };
	}
	if (!value || typeof value !== "object") return { ...FALLBACK };
	const item = value as Record<string, unknown>;
	return {
		searchModel: typeof item.searchModel === "string" ? item.searchModel : FALLBACK.searchModel,
		fetchModel: typeof item.fetchModel === "string" ? item.fetchModel : FALLBACK.fetchModel,
		sttModel: typeof item.sttModel === "string" ? item.sttModel : FALLBACK.sttModel,
		ttsModel: typeof item.ttsModel === "string" ? item.ttsModel : FALLBACK.ttsModel,
		ttsPlay: typeof item.ttsPlay === "boolean" ? item.ttsPlay : FALLBACK.ttsPlay,
	};
}

export function saveDefaults(defaults: RouterDefaults, path = DEFAULTS_PATH): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(defaults, null, 2)}\n`, { mode: 0o600 });
}

/** Shared in-memory defaults. Tool calls never fetch the catalog. */
export const routerDefaults = loadDefaults();
