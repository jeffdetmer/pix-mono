/**
 * pix-9router — Pi extension bundle
 *
 * Registers:
 *   - 9router provider  (model list from self-hosted router API)
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
import registerProvider from "./provider.js";
import registerSttCommand from "./stt-command.js";
import registerTranscribe from "./transcribe.js";
import registerTts from "./tts.js";

export default async function (pi: ExtensionAPI): Promise<void> {
	await registerProvider(pi);
	registerRouterCommand(pi);
	registerSttCommand(pi);
	registerTranscribe(pi);
	registerTts(pi);
}
