import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
	Key,
	type KeybindingsManager,
	matchesKey,
	type SelectItem,
	SelectList,
	type TUI,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	frameModal,
	MIN_MODAL_HEIGHT,
	ModalPager,
	modalOverlayOptions,
	modalWidth,
	selectListTheme,
	terminalModalHeight,
} from "@xynogen/pix-pretty/modal-frame";
import { fetchConfig, saveFetchConfig } from "./config.js";
import { listAllFetchProviders } from "./providers.js";

/** Sentinel value for the "edit 9Router model" row. */
const MODEL_ROW = "\u0000model";

/** Build the picker rows: `auto`, every provider with its status, then the model row. */
function pickerItems(theme: Theme): SelectItem[] {
	const accent = "accent";
	const mute = (s: string) => theme.fg("muted", s);
	const active = fetchConfig.provider;

	const providerItems = [{ id: "auto", configured: true }, ...listAllFetchProviders()].map(
		({ id, configured }): SelectItem => {
			const marker = id === active ? theme.fg(accent, "\u25B6") : " ";
			const status = configured
				? theme.fg("success", "\u25CF connected")
				: mute("\u25CB no connection");
			return {
				value: id,
				label: `${marker} ${theme.fg(accent, id)}`,
				description: status,
			};
		},
	);

	providerItems.push({
		value: MODEL_ROW,
		label: `  ${theme.fg(accent, "9Router model")}`,
		description: mute(fetchConfig.nineRouterModel),
	});
	return providerItems;
}

async function showPicker(ctx: ExtensionContext): Promise<string | null> {
	return ctx.ui.custom<string | null>(
		(tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (r: string | null) => void) => {
			const accent = "accent";
			const guide = (key: string, action: string) =>
				theme.fg("text", key) + theme.fg("muted", ` ${action}`);
			const guideSep = theme.fg("muted", " \u00b7 ");

			const items = pickerItems(theme);
			const widest = items.reduce((w, it) => Math.max(w, visibleWidth(it.label)), 0);
			const list = new SelectList(items, Math.max(1, items.length), selectListTheme(theme), {
				minPrimaryColumnWidth: widest + 2,
				maxPrimaryColumnWidth: widest + 2,
			});
			const activeIdx = items.findIndex((it) => it.value === fetchConfig.provider);
			if (activeIdx >= 0) list.setSelectedIndex(activeIdx);
			list.onSelect = (item) => done(item.value);
			list.onCancel = () => done(null);

			// SAFETY: SelectList tracks selectedIndex internally for pager sync.
			const internal = list as unknown as { selectedIndex: number };
			const pager = new ModalPager();

			return {
				render(w: number) {
					const mw = modalWidth(w);
					const inner = mw - 4; // CHROME = 2 border + 2 padding
					const result = frameModal({
						width: mw,
						maxHeight: terminalModalHeight(tui.terminal.rows),
						minHeight: MIN_MODAL_HEIGHT,
						header: [
							theme.fg(accent, theme.bold("Web Fetch")),
							theme.fg("dim", "Default fetch provider \u00b7 9Router model"),
							"",
						],
						body: list.render(inner),
						selectedBodyRange: pager.selectedRange({
							start: internal.selectedIndex,
							end: internal.selectedIndex + 1,
						}),
						footer: [
							"",
							guide("\u2191\u2193", "navigate") +
								guideSep +
								guide("enter", "select") +
								guideSep +
								guide("esc", "close"),
						],
						bodyOffset: pager.bodyOffset,
						color: (s) => theme.fg(accent, s),
						bg: (s) => theme.bg("customMessageBg", s),
						fg: (s) => theme.fg("text", s),
					});
					pager.sync(result);
					return result.lines;
				},
				invalidate() {
					list.invalidate();
				},
				handleInput(data: string) {
					if (pager.handleInput(data, keybindings, true)) {
						tui.requestRender?.();
						return;
					}
					if (matchesKey(data, Key.enter)) {
						const sel = list.getSelectedItem();
						done(sel ? sel.value : null);
						return;
					}
					if (matchesKey(data, Key.escape)) {
						done(null);
						return;
					}
					list.handleInput?.(data);
					pager.followSelection();
					tui.requestRender?.();
				},
			};
		},
		{ overlay: true, overlayOptions: modalOverlayOptions() },
	);
}

export function registerFetchCommand(pi: ExtensionAPI): void {
	pi.registerCommand("fetch", {
		description: "Set the default fetch provider and 9Router model",
		handler: async (_args, ctx) => {
			// Native fallback for headless/test contexts without a TUI.
			if (typeof ctx.ui.custom !== "function") {
				const providers = ["auto", ...listAllFetchProviders().map(({ id }) => id)];
				const provider = await ctx.ui.select("Default fetch provider", providers);
				if (provider) {
					fetchConfig.provider = provider;
					saveFetchConfig(fetchConfig);
				}
				return;
			}

			while (true) {
				const choice = await showPicker(ctx);
				if (!choice) return;
				if (choice === MODEL_ROW) {
					const model = await ctx.ui.input("9Router fetch model", fetchConfig.nineRouterModel);
					if (model?.trim()) {
						fetchConfig.nineRouterModel = model.trim();
						saveFetchConfig(fetchConfig);
					}
					continue;
				}
				fetchConfig.provider = choice;
				saveFetchConfig(fetchConfig);
				return;
			}
		},
	});
}
