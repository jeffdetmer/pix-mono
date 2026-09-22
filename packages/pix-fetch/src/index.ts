import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { once } from "@xynogen/pix-runtime/once";
import { registerBuiltinProviders } from "./builtin.js";
import { registerFetchCommand } from "./command.js";
import { registerFetchTool } from "./tools.js";

export * from "./providers.js";
export * from "./runner.js";

export default function registerPixFetch(pi: ExtensionAPI): void {
	registerBuiltinProviders();
	once(pi, "pix-fetch", () => {
		registerFetchCommand(pi);
		registerFetchTool(pi);
	});
}
