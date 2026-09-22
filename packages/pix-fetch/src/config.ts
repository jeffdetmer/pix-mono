import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface FetchConfig {
	provider: string;
	nineRouterModel: string;
}

export const FETCH_CONFIG_PATH = join(homedir(), ".pi", "agent", "fetch.json");

const DEFAULT_CONFIG: FetchConfig = {
	provider: "auto",
	nineRouterModel: "exa",
};

export function loadFetchConfig(path = FETCH_CONFIG_PATH): FetchConfig {
	try {
		const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		return {
			provider: typeof value.provider === "string" ? value.provider : DEFAULT_CONFIG.provider,
			nineRouterModel:
				typeof value.nineRouterModel === "string"
					? value.nineRouterModel
					: DEFAULT_CONFIG.nineRouterModel,
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export function saveFetchConfig(config: FetchConfig, path = FETCH_CONFIG_PATH): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export const fetchConfig = loadFetchConfig();
