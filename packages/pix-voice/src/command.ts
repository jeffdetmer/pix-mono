import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import {
	type SettingsRow,
	showProviderPicker,
	showSettingsPicker,
} from "@xynogen/pix-pretty/provider-picker";
import { saveConfig, voiceConfig } from "./config.js";
import { isConfigured, listProviders, type VoiceKind } from "./providers.js";

const NINE_ROUTER = "9router";
const ROUTER_ALIASES = { NINEROUTER_URL: "ROUTER_API_BASE", NINEROUTER_KEY: "ROUTER_API_KEY" };
const SECTION: Record<VoiceKind, string> = { stt: "Speech to text", tts: "Text to speech" };

function selectedProvider(kind: VoiceKind) {
	const selected = kind === "stt" ? voiceConfig.sttProvider : voiceConfig.ttsProvider;
	const providers = listProviders(kind);
	return selected === "auto"
		? providers.find(isConfigured)
		: providers.find((item) => item.id === selected);
}

/** Provider value plus its status color: connected, or which variables are missing. */
function providerValue(kind: VoiceKind): Pick<SettingsRow, "value" | "tone"> {
	const id = kind === "stt" ? voiceConfig.sttProvider : voiceConfig.ttsProvider;
	const provider = selectedProvider(kind);
	if (!provider) return { value: `${id} · not configured`, tone: "warning" };
	const label = id === "auto" ? `auto → ${provider.id}` : id;
	return isConfigured(provider)
		? { value: `${label} · connected`, tone: "success" }
		: { value: `${label} · set ${provider.env?.join(", ")}`, tone: "warning" };
}

function nineRouterModel(kind: VoiceKind): string {
	return kind === "stt" ? voiceConfig.sttNineRouterModel : voiceConfig.ttsNineRouterModel;
}

function saveNineRouterModel(kind: VoiceKind, value: string | undefined): void {
	const model = value?.trim();
	if (!model) return;
	if (kind === "stt") voiceConfig.sttNineRouterModel = model;
	else voiceConfig.ttsNineRouterModel = model;
	saveConfig(voiceConfig);
}

/** Color-coded provider tree, the same view as /web. Only 9router has a model field. */
async function editProvider(ctx: ExtensionContext, kind: VoiceKind): Promise<void> {
	while (true) {
		const action = await showProviderPicker(ctx.ui, {
			title: `${icon("settings")} ${SECTION[kind]}`,
			subtitle: `Default ${kind.toUpperCase()} provider · shell variables · provider settings`,
			rows: [
				{ id: "auto", configured: true, env: [] },
				...listProviders(kind).map((provider) => ({
					id: provider.id,
					configured: isConfigured(provider),
					env: provider.env ?? [],
					model: provider.id === NINE_ROUTER ? nineRouterModel(kind) : undefined,
				})),
			],
			current: kind === "stt" ? voiceConfig.sttProvider : voiceConfig.ttsProvider,
			envAliases: ROUTER_ALIASES,
		});
		if (!action) return;
		if (action.kind === "model") {
			saveNineRouterModel(kind, action.value);
			continue;
		}
		if (kind === "stt") voiceConfig.sttProvider = action.id;
		else voiceConfig.ttsProvider = action.id;
		saveConfig(voiceConfig);
		return;
	}
}

function settingsRows(): SettingsRow[] {
	const rows = (["stt", "tts"] as const).flatMap((kind): SettingsRow[] => [
		{ key: `${kind}:provider`, section: SECTION[kind], label: "provider", ...providerValue(kind) },
		{
			key: `${kind}:model`,
			section: SECTION[kind],
			label: "9router model",
			value: nineRouterModel(kind),
			tone: selectedProvider(kind)?.id === NINE_ROUTER ? "success" : "muted",
			editable: true,
		},
	]);
	rows.push({
		key: "tts:play",
		section: SECTION.tts,
		label: "play after generation",
		value: voiceConfig.ttsPlay ? "on" : "off",
		tone: voiceConfig.ttsPlay ? "success" : "muted",
	});
	return rows;
}

export default function registerVoiceCommand(pi: ExtensionAPI): void {
	pi.registerCommand("voice", {
		description:
			"Set the speech-to-text and text-to-speech providers, 9Router models, and playback",
		handler: async (_args, ctx) => {
			let cursor = 0;
			while (true) {
				const rows = settingsRows();
				const action = await showSettingsPicker(
					ctx.ui,
					`${icon("settings")} Voice Settings`,
					rows,
					cursor,
				);
				if (!action) return;
				cursor = rows.findIndex((row) => row.key === action.key);
				const [kind, field] = action.key.split(":") as [VoiceKind, string];
				try {
					if (field === "provider") await editProvider(ctx, kind);
					else if (field === "model") saveNineRouterModel(kind, action.value);
					else {
						voiceConfig.ttsPlay = !voiceConfig.ttsPlay;
						saveConfig(voiceConfig);
					}
				} catch (error) {
					ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				}
			}
		},
	});
}
