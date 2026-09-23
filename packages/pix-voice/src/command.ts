import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, type SelectItem, SelectList } from "@earendil-works/pi-tui";
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

interface SettingRow {
	key: string;
	section: string;
	label: string;
	value: string;
}

async function pickSetting(ctx: ExtensionContext, rows: SettingRow[]): Promise<string | undefined> {
	return (
		(await ctx.ui.custom<string | null>(
			(tui, theme, keybindings, done) => {
				let selected = 0;
				const move = (direction: -1 | 1) => {
					selected = (selected + direction + rows.length) % rows.length;
				};
				return {
					render(width: number) {
						const labelWidth = Math.max(...rows.map((row) => row.label.length));
						const body: string[] = [];
						const rowLines: number[] = [];
						let section = "";
						for (let index = 0; index < rows.length; index++) {
							const row = rows[index];
							if (!row) continue;
							if (row.section !== section) {
								if (section) body.push("");
								body.push(theme.fg("dim", `  ${row.section}`));
								section = row.section;
							}
							const active = index === selected;
							rowLines[index] = body.length;
							body.push(
								`${active ? theme.fg("accent", "→") : " "} ${theme.fg(active ? "accent" : "text", row.label.padEnd(labelWidth))}  ${theme.fg("success", row.value)}`,
							);
						}
						const result = frameModal({
							width: modalWidth(width),
							maxHeight: terminalModalHeight(tui.terminal?.rows),
							minHeight: MIN_MODAL_HEIGHT,
							title: `${icon("settings")} Voice Settings`,
							titleColor: (text) => theme.fg("accent", theme.bold(text)),
							header: [""],
							body,
							footer: ["", theme.fg("muted", "↑↓ move · enter change · esc close")],
							selectedBodyLine: rowLines[selected],
							color: (text) => theme.fg("accent", text),
							bg: (text) => theme.bg("customMessageBg", text),
						});
						return result.lines;
					},
					invalidate: () => {},
					handleInput(data: string) {
						if (keybindings.matches(data, "tui.select.cancel")) done(null);
						else if (keybindings.matches(data, "tui.select.up")) move(-1);
						else if (keybindings.matches(data, "tui.select.down")) move(1);
						else if (matchesKey(data, "enter")) done(rows[selected]?.key ?? null);
						else if (matchesKey(data, Key.left) || matchesKey(data, Key.right))
							done(rows[selected]?.key ?? null);
						else return;
						tui.requestRender();
					},
				};
			},
			{ overlay: true, overlayOptions: modalOverlayOptions() },
		)) ?? undefined
	);
}

const MANUAL = "enter a model id…";
const AUTO = "auto · first configured";

function selectedProvider(kind: VoiceKind) {
	const selected = kind === "stt" ? voiceConfig.sttProvider : voiceConfig.ttsProvider;
	const providers = listProviders(kind);
	return selected === "auto"
		? providers.find(isConfigured)
		: providers.find((item) => item.id === selected);
}

function modelLabel(kind: VoiceKind): string {
	const provider = selectedProvider(kind);
	if (!provider) return "no configured provider";
	const models = kind === "stt" ? voiceConfig.sttModels : voiceConfig.ttsModels;
	return `${provider.id}/${models[provider.id] || provider.defaultModel}`;
}

async function pickProvider(ctx: ExtensionContext, kind: VoiceKind): Promise<string | undefined> {
	const current = kind === "stt" ? voiceConfig.sttProvider : voiceConfig.ttsProvider;
	const byLabel = new Map<string, string>([[AUTO, "auto"]]);
	for (const provider of listProviders(kind)) {
		// ponytail: show only env presence. Pix never reads or stores the secret value.
		const unset = (provider.env ?? []).filter((name) => !process.env[name]);
		const status = isConfigured(provider) ? "ready" : `needs ${unset.join(", ")}`;
		byLabel.set(`${provider.id} · ${status}`, provider.id);
	}
	const currentLabel = [...byLabel].find(([, id]) => id === current)?.[0];
	const choice = await pick(
		ctx,
		`${kind.toUpperCase()} provider · current: ${current}`,
		[...byLabel.keys()],
		currentLabel,
	);
	return choice ? byLabel.get(choice) : undefined;
}

async function pickModel(ctx: ExtensionContext, kind: VoiceKind): Promise<void> {
	const provider = selectedProvider(kind);
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
				const setting = await pickSetting(ctx, [
					{
						key: "sttProvider",
						section: "Speech to text",
						label: "provider",
						value: voiceConfig.sttProvider,
					},
					{ key: "sttModel", section: "Speech to text", label: "model", value: modelLabel("stt") },
					{
						key: "ttsProvider",
						section: "Text to speech",
						label: "provider",
						value: voiceConfig.ttsProvider,
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
					},
				]);
				if (!setting) return;
				try {
					if (setting === "sttProvider" || setting === "ttsProvider") {
						const kind = setting === "sttProvider" ? "stt" : "tts";
						const id = await pickProvider(ctx, kind);
						if (!id) continue;
						if (kind === "stt") voiceConfig.sttProvider = id;
						else voiceConfig.ttsProvider = id;
						saveConfig(voiceConfig);
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
