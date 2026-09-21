/**
 * pix-9router — Pi extension bundle
 *
 * Registers:
 *   - 9router provider  (model list from self-hosted router API)
 *   - fetch tool        (web page fetch via exa through router)
 *   - search tool       (web/news search via exa through router)
 *   - transcribe tool   (speech-to-text via audio transcription API)
 *   - tts tool          (text-to-speech via audio speech API)
 *
 * Environment:
 *   NINEROUTER_URL   — canonical base URL
 *   NINEROUTER_KEY   — canonical bearer token
 *   ROUTER_API_BASE / ROUTER_API_KEY — legacy aliases
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerRouterCommand from "./command.js";
import registerFetch from "./fetch.js";
import registerProvider from "./provider.js";
import registerSearch from "./search.js";
import registerSttCommand from "./stt-command.js";
import registerTranscribe from "./transcribe.js";
import registerTts from "./tts.js";

export default async function (pi: ExtensionAPI): Promise<void> {
	await registerProvider(pi);
	registerRouterCommand(pi);
	registerFetch(pi);
	registerSearch(pi);
	registerSttCommand(pi);
	registerTranscribe(pi);
	registerTts(pi);
}
