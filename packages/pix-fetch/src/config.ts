import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface FetchConfig {
	provider: string;
	nineRouterModel: string;
	/** Provider env vars saved as plaintext, applied into process.env on start. */
	env: Record<string, string>;
}

export const FETCH_CONFIG_PATH = join(homedir(), ".pi", "agent", "fetch.json");

const DEFAULT_CONFIG: FetchConfig = {
	provider: "auto",
	nineRouterModel: "exa",
	env: {},
};

function sanitizeEnv(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const out: Record<string, string> = {};
	for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
		if (typeof val === "string") out[key] = val;
	}
	return out;
}

export function loadFetchConfig(path = FETCH_CONFIG_PATH): FetchConfig {
	try {
		const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		return {
			provider: typeof value.provider === "string" ? value.provider : DEFAULT_CONFIG.provider,
			nineRouterModel:
				typeof value.nineRouterModel === "string"
					? value.nineRouterModel
					: DEFAULT_CONFIG.nineRouterModel,
			env: sanitizeEnv(value.env),
		};
	} catch {
		return { ...DEFAULT_CONFIG, env: {} };
	}
}

export function saveFetchConfig(config: FetchConfig, path = FETCH_CONFIG_PATH): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

/** Apply saved env vars into process.env without clobbering an existing shell value. */
export function applyFetchEnv(config: FetchConfig = fetchConfig): void {
	for (const [key, val] of Object.entries(config.env)) {
		if (val && process.env[key] === undefined) process.env[key] = val;
	}
}

export const fetchConfig = loadFetchConfig();
