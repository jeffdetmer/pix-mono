/**
 * pix-voice — provider-neutral speech tools for Pi.
 *
 * Registers the `transcribe` and `speak` tools, the `/stt` microphone command,
 * and the `/voice` settings command. Other packages can add providers through
 * `@xynogen/pix-voice/providers`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { once } from "@xynogen/pix-runtime/once";
import { registerBuiltinProviders } from "./builtin.js";
import registerVoiceCommand from "./command.js";
import registerSpeak from "./speak.js";
import registerSttCommand from "./stt-command.js";
import registerTranscribe from "./transcribe.js";

export default function registerPixVoice(pi: ExtensionAPI): void {
	registerBuiltinProviders();
	once(pi, "pix-voice", () => {
		registerVoiceCommand(pi);
		registerSttCommand(pi);
		registerTranscribe(pi);
		registerSpeak(pi);
	});
}
