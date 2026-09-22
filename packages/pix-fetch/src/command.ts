import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
	decodeKittyPrintable,
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

type ProviderRow = { id: string; configured: boolean; env: string[] };

/** Provider rows the picker shows: `auto` first (no env), then every registered provider. */
function providerRows(): ProviderRow[] {
	return [{ id: "auto", configured: true, env: [] }, ...listAllFetchProviders()];
}

/** Which env vars are set (from the shell or saved config). */
function setEnvCount(vars: string[]): number {
	return vars.filter((name) => Boolean(process.env[name] || fetchConfig.env[name])).length;
}

/** Build the picker rows. */
function pickerItems(theme: Theme): SelectItem[] {
	const accent = "accent";
	const mute = (s: string) => theme.fg("muted", s);
	const active = fetchConfig.provider;

	const items = providerRows().map(({ id, configured, env }): SelectItem => {
		const marker = id === active ? theme.fg(accent, "\u25B6") : " ";
		const setKeys = setEnvCount(env);
		// Configured but no key set means the provider works keyless (e.g. jina-reader).
		const keyless = configured && env.length > 0 && setKeys === 0;
		const status = keyless
			? theme.fg("warning", "\u25D0 ready \u00b7 no key needed")
			: configured
				? theme.fg("success", "\u25CF connected")
				: mute("\u25CB no connection");
		const keys = env.length && !keyless ? mute(` \u00b7 ${setKeys}/${env.length} keys`) : "";
		return {
			value: id,
			label: `${marker} ${theme.fg(accent, id)}`,
			description: `${status}${keys}`,
		};
	});

	items.push({
		value: MODEL_ROW,
		label: `  ${theme.fg(accent, "9Router model")}`,
		description: mute(fetchConfig.nineRouterModel),
	});
	return items;
}

type Action = { kind: "select"; id: string } | { kind: "editEnv"; id: string } | { kind: "model" };

async function showPicker(ctx: ExtensionContext): Promise<Action | null> {
	return ctx.ui.custom<Action | null>(
		(tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (r: Action | null) => void) => {
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
			list.onCancel = () => done(null);

			// SAFETY: SelectList tracks selectedIndex internally for pager sync.
			const internal = list as unknown as { selectedIndex: number };
			const pager = new ModalPager();

			const confirm = () => {
				const sel = list.getSelectedItem();
				if (!sel) return done(null);
				if (sel.value === MODEL_ROW) return done({ kind: "model" });
				done({ kind: "select", id: sel.value });
			};
			list.onSelect = confirm;

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
							theme.fg("dim", "Default fetch provider \u00b7 API keys \u00b7 9Router model"),
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
								guide("enter", "set default") +
								guideSep +
								guide("e", "edit keys") +
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
					if (matchesKey(data, Key.enter)) return confirm();
					if (matchesKey(data, Key.escape)) return done(null);
					if (decodeKittyPrintable(data) === "e") {
						const sel = list.getSelectedItem();
						if (sel && sel.value !== MODEL_ROW) done({ kind: "editEnv", id: sel.value });
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

/** Prompt for each env var of a provider; blank input removes the saved value. */
async function editEnv(ctx: ExtensionContext, id: string): Promise<void> {
	const row = providerRows().find((r) => r.id === id);
	if (!row || row.env.length === 0) {
		ctx.ui.notify(`Provider "${id}" has no configurable keys.`, "info");
		return;
	}
	for (const name of row.env) {
		const shellValue = process.env[name];
		const current = fetchConfig.env[name] ?? "";
		const note = shellValue && !current ? ` (set in shell)` : "";
		const value = await ctx.ui.input(`${name}${note} — blank clears`, current);
		if (value == null) return; // esc cancels the whole edit
		const trimmed = value.trim();
		if (trimmed) {
			fetchConfig.env[name] = trimmed;
			process.env[name] = trimmed;
		} else {
			if (current && process.env[name] === current) delete process.env[name];
			delete fetchConfig.env[name];
		}
	}
	saveFetchConfig(fetchConfig);
	ctx.ui.notify(`Saved keys for ${id}.`, "info");
}

export function registerFetchCommand(pi: ExtensionAPI): void {
	pi.registerCommand("fetch", {
		description: "Set the default fetch provider, provider API keys, and 9Router model",
		handler: async (_args, ctx) => {
			// Native fallback for headless/test contexts without a TUI.
			if (typeof ctx.ui.custom !== "function") {
				const providers = providerRows().map(({ id }) => id);
				const provider = await ctx.ui.select("Default fetch provider", providers);
				if (provider) {
					fetchConfig.provider = provider;
					saveFetchConfig(fetchConfig);
				}
				return;
			}

			while (true) {
				const action = await showPicker(ctx);
				if (!action) return;
				if (action.kind === "model") {
					const model = await ctx.ui.input("9Router fetch model", fetchConfig.nineRouterModel);
					if (model?.trim()) {
						fetchConfig.nineRouterModel = model.trim();
						saveFetchConfig(fetchConfig);
						ctx.ui.notify(`Default model: ${fetchConfig.nineRouterModel}`, "info");
					}
					continue;
				}
				if (action.kind === "editEnv") {
					await editEnv(ctx, action.id);
					continue;
				}
				fetchConfig.provider = action.id;
				saveFetchConfig(fetchConfig);
				ctx.ui.notify(`Default provider: ${action.id}`, "info");
				return;
			}
		},
	});
}
