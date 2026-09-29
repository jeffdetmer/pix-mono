import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { once } from "@xynogen/pix-runtime/once";
import { registerBuiltinProviders } from "./builtin.ts";
import { registerWebCommand } from "./command.ts";
import { registerBuiltinSearchProviders } from "./search-builtin.ts";
import { registerSearchTool } from "./search-tool.ts";
import { registerFetchTool } from "./tools.ts";

export * from "./providers.ts";
export * from "./runner.ts";

export default function registerPixFetch(pi: ExtensionAPI): void {
	registerBuiltinProviders();
	registerBuiltinSearchProviders();
	once(pi, "pix-web", () => {
		registerWebCommand(pi);
		registerFetchTool(pi);
		registerSearchTool(pi);
	});
}
