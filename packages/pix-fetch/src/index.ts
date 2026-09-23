import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { once } from "@xynogen/pix-runtime/once";
import { registerBuiltinProviders } from "./builtin.js";
import { registerFetchCommand, registerSearchCommand } from "./command.js";
import { registerBuiltinSearchProviders } from "./search-builtin.js";
import { registerSearchTool } from "./search-tool.js";
import { registerFetchTool } from "./tools.js";

export * from "./providers.js";
export * from "./runner.js";

export default function registerPixFetch(pi: ExtensionAPI): void {
	registerBuiltinProviders();
	registerBuiltinSearchProviders();
	once(pi, "pix-fetch", () => {
		registerFetchCommand(pi);
		registerSearchCommand(pi);
		registerFetchTool(pi);
		registerSearchTool(pi);
	});
}
