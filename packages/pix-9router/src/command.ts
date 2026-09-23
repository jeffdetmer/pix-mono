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
import { catalogModels, catalogVoices } from "./catalog.js";
import { routerDefaults, saveDefaults } from "./defaults.js";

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
							title: `${icon("settings")} 9Router Settings`,
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

async function choose(
	ctx: ExtensionContext,
	title: string,
	current: string,
	load: () => Promise<string[]>,
): Promise<string | undefined> {
	return pick(ctx, `${title} · current: ${current}`, await load(), current);
}

export default function registerRouterCommand(pi: ExtensionAPI): void {
	pi.registerCommand("9router", {
		description: "Set default models, voice, and TTS playback",
		handler: async (_args, ctx) => {
			while (true) {
				const setting = await pickSetting(ctx, [
					{ key: "stt", section: "Audio", label: "STT model", value: routerDefaults.sttModel },
					{
						key: "tts",
						section: "Audio",
						label: "TTS voice",
						value: routerDefaults.ttsModel,
					},
					{
						key: "playback",
						section: "Audio",
						label: "play after generation",
						value: routerDefaults.ttsPlay ? "on" : "off",
					},
				]);
				if (!setting) return;

				try {
					let value: string | undefined;
					if (setting === "stt") {
						value = await choose(ctx, "STT model", routerDefaults.sttModel, () =>
							catalogModels("stt"),
						);
						if (value) routerDefaults.sttModel = value;
					} else if (setting === "tts") {
						const voices = await catalogVoices();
						const language = await pick(
							ctx,
							"TTS · 1/3 · language",
							[...new Set(voices.map((voice) => voice.language))].sort(),
						);
						if (!language) continue;
						const languageVoices = voices.filter((voice) => voice.language === language);
						const provider = await pick(
							ctx,
							`TTS · 2/3 · ${language} · provider`,
							[...new Set(languageVoices.map((voice) => voice.provider))].sort(),
						);
						if (!provider) continue;
						value = await pick(
							ctx,
							`TTS · 3/3 · ${language} · ${provider}`,
							languageVoices
								.filter((voice) => voice.provider === provider)
								.map((voice) => voice.id),
							routerDefaults.ttsModel,
						);
						if (value) routerDefaults.ttsModel = value;
					} else if (setting === "playback") {
						value = await pick(ctx, "Play generated speech by default", ["on", "off"]);
						if (value) routerDefaults.ttsPlay = value === "on";
					}
					if (value) saveDefaults(routerDefaults);
				} catch (error) {
					ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				}
			}
		},
	});
}
