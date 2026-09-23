export interface VoiceChoice {
	id: string;
	language: string;
	provider: string;
}

/** Group a 9Router voice id ("provider/voice") by locale and upstream provider. */
export function groupVoice(id: string): VoiceChoice {
	const [provider = "other", ...rest] = id.split("/");
	const voice = rest.join("/") || provider;
	const locale = voice.match(/(?:^|[^A-Za-z])([a-z]{2,3})[-_]([A-Z]{2})(?:[^A-Za-z]|$)/);
	return { id, language: locale ? `${locale[1]}-${locale[2]}` : "Other", provider };
}
