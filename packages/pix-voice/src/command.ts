import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, type SelectItem, SelectList } from "@earendil-works/pi-tui";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import {
	frameModal,
	MIN_MODAL_HEIGHT,
	ModalPager,
	modalOverlayOptions,
	modalWidth,
	selectListTheme,
	terminalModalHeight,
} from "@xynogen/pix-pretty/modal-frame";
import {
	type SettingsRow,
	showProviderPicker,
	showSettingsPicker,
} from "@xynogen/pix-pretty/provider-picker";
import { groupVoice } from "./catalog.js";
import { saveConfig, voiceConfig } from "./config.js";
import { isConfigured, listProviders, type VoiceKind } from "./providers.js";

async function pick(
	ctx: ExtensionContext,
	title: string,
	values: string[],
	current?: string,
): Promise<string | undefined> {
	const items: SelectItem[] = [...new Set(current ? [current, ...values] : values)].map(
		(value) => ({
			value,
			label: value,
			description: value === current ? "current" : undefined,
		}),
	);
	if (items.length === 0) return undefined;

	return (
		(await ctx.ui.custom<string | null>(
			(tui, theme, _keybindings, done) => {
				const list = new SelectList(items, items.length, selectListTheme(theme));
				const currentIndex = items.findIndex((item) => item.value === current);
				if (currentIndex >= 0) list.setSelectedIndex(currentIndex);
				list.onSelect = (item) => done(item.value);
				list.onCancel = () => done(null);
				const pager = new ModalPager();

				return {
					render(width: number) {
						const result = frameModal({
							width: modalWidth(width),
							maxHeight: terminalModalHeight(tui.terminal?.rows),
							minHeight: MIN_MODAL_HEIGHT,
							header: [theme.fg("accent", theme.bold(title)), ""],
							body: list.render(modalWidth(width) - 4),
							bodyOffset: pager.bodyOffset,
							footer: ["", theme.fg("muted", "↑↓ navigate · enter select · esc cancel")],
							color: (text) => theme.fg("accent", text),
							bg: (text) => theme.bg("customMessageBg", text),
							fg: (text) => theme.fg("text", text),
						});
						pager.sync(result);
						return result.lines;
					},
					invalidate: () => list.invalidate(),
					handleInput(data: string) {
						if (pager.handleInput(data, undefined, true)) tui.requestRender();
						else if (matchesKey(data, "escape")) done(null);
						else list.handleInput(data);
					},
				};
			},
			{ overlay: true, overlayOptions: modalOverlayOptions() },
		)) ?? undefined
	);
}

const MANUAL = "enter a model id…";

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

function modelLabel(kind: VoiceKind): string {
	const provider = selectedProvider(kind);
	if (!provider) return "no configured provider";
	const models = kind === "stt" ? voiceConfig.sttModels : voiceConfig.ttsModels;
	return `${provider.id}/${models[provider.id] || provider.defaultModel}`;
}

const ROUTER_ALIASES = { NINEROUTER_URL: "ROUTER_API_BASE", NINEROUTER_KEY: "ROUTER_API_KEY" };

/** Color-coded provider tree, the same view as /web. */
async function pickProvider(ctx: ExtensionContext, kind: VoiceKind): Promise<void> {
	const models = kind === "stt" ? voiceConfig.sttModels : voiceConfig.ttsModels;
	const action = await showProviderPicker(ctx.ui, {
		title: `${icon("settings")} ${kind === "stt" ? "Speech to Text" : "Text to Speech"}`,
		subtitle: `Default ${kind.toUpperCase()} provider · shell variables · model`,
		rows: [
			{ id: "auto", configured: true, env: [] },
			...listProviders(kind).map((provider) => ({
				id: provider.id,
				configured: isConfigured(provider),
				env: provider.env ?? [],
				model: models[provider.id] || provider.defaultModel,
			})),
		],
		current: kind === "stt" ? voiceConfig.sttProvider : voiceConfig.ttsProvider,
		envAliases: ROUTER_ALIASES,
		modelEdit: "action",
	});
	if (!action) return;
	if (action.kind === "model") return pickModel(ctx, kind, action.id);
	if (kind === "stt") voiceConfig.sttProvider = action.id;
	else voiceConfig.ttsProvider = action.id;
	saveConfig(voiceConfig);
}

async function pickModel(ctx: ExtensionContext, kind: VoiceKind, id?: string): Promise<void> {
	const provider = id ? listProviders(kind).find((item) => item.id === id) : selectedProvider(kind);
	if (!provider) {
		ctx.ui.notify(`No configured ${kind} provider. Pick a provider first.`, "warning");
		return;
	}
	const models = kind === "stt" ? voiceConfig.sttModels : voiceConfig.ttsModels;
	const current = models[provider.id] || provider.defaultModel;
	const choices = [...((await provider.models?.()) ?? [])];
	let value: string | undefined;
	if (kind === "tts" && provider.id === "9router" && choices.length > 0) {
		// The 9Router catalog lists hundreds of voices: narrow by language, then upstream provider.
		const voices = choices.map(groupVoice);
		const language = await pick(
			ctx,
			"TTS · 1/3 · language",
			[...new Set(voices.map((voice) => voice.language))].sort(),
		);
		if (!language) return;
		const inLanguage = voices.filter((voice) => voice.language === language);
		const upstream = await pick(
			ctx,
			`TTS · 2/3 · ${language} · provider`,
			[...new Set(inLanguage.map((voice) => voice.provider))].sort(),
		);
		if (!upstream) return;
		value = await pick(
			ctx,
			`TTS · 3/3 · ${language} · ${upstream}`,
			inLanguage.filter((voice) => voice.provider === upstream).map((voice) => voice.id),
			current,
		);
	} else {
		value = await pick(
			ctx,
			`${provider.id} ${kind.toUpperCase()} model · current: ${current}`,
			[...choices, MANUAL],
			current,
		);
		if (value === MANUAL) value = (await ctx.ui.input(`${provider.id} model id`, current))?.trim();
	}
	if (!value) return;
	models[provider.id] = value;
	saveConfig(voiceConfig);
}

export default function registerVoiceCommand(pi: ExtensionAPI): void {
	pi.registerCommand("voice", {
		description: "Set the speech-to-text and text-to-speech providers, models, and playback",
		handler: async (_args, ctx) => {
			while (true) {
				const setting = await showSettingsPicker(ctx.ui, `${icon("settings")} Voice Settings`, [
					{
						key: "sttProvider",
						section: "Speech to text",
						label: "provider",
						...providerValue("stt"),
					},
					{ key: "sttModel", section: "Speech to text", label: "model", value: modelLabel("stt") },
					{
						key: "ttsProvider",
						section: "Text to speech",
						label: "provider",
						...providerValue("tts"),
					},
					{
						key: "ttsModel",
						section: "Text to speech",
						label: "model or voice",
						value: modelLabel("tts"),
					},
					{
						key: "playback",
						section: "Text to speech",
						label: "play after generation",
						value: voiceConfig.ttsPlay ? "on" : "off",
						tone: voiceConfig.ttsPlay ? "success" : "muted",
					},
				]);
				if (!setting) return;
				try {
					if (setting === "sttProvider" || setting === "ttsProvider") {
						await pickProvider(ctx, setting === "sttProvider" ? "stt" : "tts");
					} else if (setting === "sttModel" || setting === "ttsModel") {
						await pickModel(ctx, setting === "sttModel" ? "stt" : "tts");
					} else if (setting === "playback") {
						const value = await pick(ctx, "Play generated speech by default", ["on", "off"]);
						if (!value) continue;
						voiceConfig.ttsPlay = value === "on";
						saveConfig(voiceConfig);
					}
				} catch (error) {
					ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				}
			}
		},
	});
}
