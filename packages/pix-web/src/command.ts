import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type ProviderPickerOptions,
	showProviderPicker,
} from "@xynogen/pix-pretty/provider-picker";
import { fetchConfig, saveFetchConfig } from "./config.js";
import { listAllFetchProviders } from "./providers.js";
import { saveSearchConfig, searchConfig } from "./search-config.js";
import { listAllSearchProviders } from "./search-providers.js";

type ProviderRow = { id: string; configured: boolean; env: string[] };
type ProviderConfig = { provider: string; nineRouterModel: string };
type PickerSettings = {
	command: "fetch" | "search";
	title: string;
	config: ProviderConfig;
	save: (config: ProviderConfig) => void;
	providers: () => ProviderRow[];
	order: string[];
	noKey: Set<string>;
};

function providerRows(settings: PickerSettings): ProviderRow[] {
	const providers = settings.providers().sort((a, b) => {
		const aIndex = settings.order.indexOf(a.id);
		const bIndex = settings.order.indexOf(b.id);
		if (aIndex === -1 && bIndex === -1) return 0;
		if (aIndex === -1) return 1;
		if (bIndex === -1) return -1;
		return aIndex - bIndex;
	});
	return [{ id: "auto", configured: true, env: [] }, ...providers];
}

const LEGACY_ENV: Record<string, string> = {
	NINEROUTER_URL: "ROUTER_API_BASE",
	NINEROUTER_KEY: "ROUTER_API_KEY",
};

function envExample(name: string): string {
	if (name === "SEARXNG_URL") return `export ${name}="https://search.example.com"`;
	if (name === "GOOGLE_PSE_CX") return `export ${name}="your-search-engine-id"`;
	return name.endsWith("_URL")
		? `export ${name}="https://9router.example.com/v1"`
		: `export ${name}="your-api-key"`;
}

const NINE_ROUTER = "9router";

function pickerOptions(settings: PickerSettings): ProviderPickerOptions {
	return {
		title: settings.title,
		subtitle: `Default ${settings.command} provider \u00b7 shell variables \u00b7 provider settings`,
		rows: providerRows(settings).map((row) => ({
			...row,
			noKey: settings.noKey.has(row.id),
			model: row.id === NINE_ROUTER ? settings.config.nineRouterModel : undefined,
		})),
		current: settings.config.provider,
		envAliases: LEGACY_ENV,
		envExample,
		modelEdit: "inline",
	};
}

function registerProviderCommand(pi: ExtensionAPI, settings: PickerSettings): void {
	pi.registerCommand(settings.command, {
		description: `Set the default ${settings.command} provider and 9Router model`,
		handler: async (_args, ctx) => {
			if (typeof ctx.ui.custom !== "function") {
				const provider = await ctx.ui.select(
					`Default ${settings.command} provider`,
					providerRows(settings).map(({ id }) => id),
				);
				if (provider) {
					settings.config.provider = provider;
					settings.save(settings.config);
				}
				return;
			}

			while (true) {
				const action = await showProviderPicker(ctx.ui, pickerOptions(settings));
				if (!action) return;
				if (action.kind === "model") {
					if (!action.value) continue;
					settings.config.nineRouterModel = action.value;
					settings.save(settings.config);
					ctx.ui.notify(`Default model: ${settings.config.nineRouterModel}`, "info");
					continue;
				}
				settings.config.provider = action.id;
				settings.save(settings.config);
				ctx.ui.notify(`Default provider: ${action.id}`, "info");
				return;
			}
		},
	});
}

export function registerFetchCommand(pi: ExtensionAPI): void {
	registerProviderCommand(pi, {
		command: "fetch",
		title: "Web Fetch",
		config: fetchConfig,
		save: saveFetchConfig,
		providers: listAllFetchProviders,
		order: ["curl", "jina-reader", "9router"],
		noKey: new Set(["curl", "jina-reader"]),
	});
}

export function registerSearchCommand(pi: ExtensionAPI): void {
	registerProviderCommand(pi, {
		command: "search",
		title: "Web Search",
		config: searchConfig,
		save: saveSearchConfig,
		providers: listAllSearchProviders,
		order: [
			"searxng",
			"9router",
			"exa",
			"tavily",
			"perplexity",
			"serper",
			"brave-search",
			"youcom",
			"google-pse",
			"searchapi",
			"linkup",
			"xquik",
			"ollama-search",
		],
		noKey: new Set(["searxng"]),
	});
}
