import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fetchConfig, saveFetchConfig } from "./config.js";
import { listFetchProviders } from "./providers.js";

export function registerFetchCommand(pi: ExtensionAPI): void {
	pi.registerCommand("fetch", {
		description: "Set the default fetch provider and 9Router model",
		handler: async (_args, ctx) => {
			while (true) {
				const setting = await ctx.ui.select("Fetch settings", [
					`Provider: ${fetchConfig.provider}`,
					`9Router model: ${fetchConfig.nineRouterModel}`,
				]);
				if (!setting) return;

				if (setting.startsWith("Provider:")) {
					const providers = ["auto", ...listFetchProviders().map(({ id }) => id)];
					const provider = await ctx.ui.select("Default fetch provider", [...new Set(providers)]);
					if (!provider) continue;
					fetchConfig.provider = provider;
				} else {
					const model = await ctx.ui.input("9Router fetch model", fetchConfig.nineRouterModel);
					if (!model?.trim()) continue;
					fetchConfig.nineRouterModel = model.trim();
				}
				saveFetchConfig(fetchConfig);
			}
		},
	});
}
