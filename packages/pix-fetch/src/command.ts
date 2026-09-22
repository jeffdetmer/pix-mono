import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Input, Key, type KeybindingsManager, matchesKey, type TUI } from "@earendil-works/pi-tui";
import {
	frameModal,
	MIN_MODAL_HEIGHT,
	ModalPager,
	modalOverlayOptions,
	modalWidth,
	terminalModalHeight,
} from "@xynogen/pix-pretty/modal-frame";
import { fetchConfig, saveFetchConfig } from "./config.js";
import { listAllFetchProviders } from "./providers.js";

type ProviderRow = { id: string; configured: boolean; env: string[] };

/** Provider rows the picker shows: `auto` first (no env), then every registered provider. */
function providerRows(): ProviderRow[] {
	return [{ id: "auto", configured: true, env: [] }, ...listAllFetchProviders()];
}

function envExample(name: string): string {
	return name.endsWith("_URL")
		? `export ${name}="https://9router.example.com/v1"`
		: `export ${name}="your-api-key"`;
}

/** One selectable line in the tree: a provider, an unset env under it, or the model row. */
type Node =
	| { kind: "provider"; row: ProviderRow }
	| { kind: "env"; name: string }
	| { kind: "model" };

type Action = { kind: "select"; id: string } | { kind: "model"; value: string };

/** Provider id whose row also carries the model setting. */
const NINE_ROUTER = "9router";

/** A provider row opens when it has unset env, or when it owns extra settings. */
function canExpand(row: ProviderRow): boolean {
	return row.id === NINE_ROUTER || row.env.some((name) => !process.env[name]);
}

/** Flatten providers into visible rows. Open providers list unset env names and own settings. */
function buildNodes(expanded: Set<string>): Node[] {
	const nodes: Node[] = [];
	for (const row of providerRows()) {
		nodes.push({ kind: "provider", row });
		if (!expanded.has(row.id)) continue;
		for (const name of row.env) {
			if (!process.env[name]) nodes.push({ kind: "env", name });
		}
		if (row.id === NINE_ROUTER) nodes.push({ kind: "model" });
	}
	return nodes;
}

function renderNode(
	node: Node,
	cursor: boolean,
	expanded: Set<string>,
	theme: Theme,
	field: Input | null,
	width: number,
): string[] {
	const mute = (s: string) => theme.fg("muted", s);
	const marker = cursor ? theme.fg("accent", "\u25B6") : " ";
	if (node.kind === "model") {
		const label = `${marker}     ${theme.fg("accent", "model")}`;
		if (!field) return [`${label} ${mute(fetchConfig.nineRouterModel)}`];
		return [label, ...field.render(Math.max(10, width - 8)).map((line) => `        ${line}`)];
	}
	if (node.kind === "env") {
		// ponytail: procedure only. Pix never reads or stores the secret value.
		return [
			`${marker}     ${theme.fg("accent", node.name)} ${mute("\u25CB not set")}`,
			`        ${theme.fg("warning", envExample(node.name))}`,
		];
	}
	const { id, configured, env } = node.row;
	const setCount = env.filter((name) => Boolean(process.env[name])).length;
	const unset = env.length - setCount;
	const arrow = canExpand(node.row) ? mute(expanded.has(id) ? "\u25BE" : "\u25B8") : " ";
	const isDefault = fetchConfig.provider === id;
	const dot = isDefault ? theme.fg("accent", "\u25CF") : mute("\u25CB");
	const status =
		id === "auto"
			? mute("choice")
			: configured
				? theme.fg("success", "connected")
				: theme.fg("warning", `${unset} variable${unset === 1 ? "" : "s"} not set`);
	const tail = isDefault ? mute(" \u00b7 default") : "";
	return [`${marker} ${arrow} ${dot} ${theme.fg("accent", id)} ${status}${tail}`];
}

async function showPicker(ctx: ExtensionContext): Promise<Action | null> {
	return ctx.ui.custom<Action | null>(
		(tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (r: Action | null) => void) => {
			const guide = (key: string, action: string) =>
				theme.fg("text", key) + theme.fg("muted", ` ${action}`);
			const guideSep = theme.fg("muted", " \u00b7 ");

			const expanded = new Set<string>();
			let nodes = buildNodes(expanded);
			let cursor = Math.max(
				0,
				nodes.findIndex((n) => n.kind === "provider" && n.row.id === fetchConfig.provider),
			);
			const pager = new ModalPager();
			// Text field under the model row while editing. null means not editing.
			let field: Input | null = null;

			const move = (delta: number) => {
				cursor = Math.min(nodes.length - 1, Math.max(0, cursor + delta));
				pager.followSelection();
			};

			const openField = () => {
				const input = new Input({ prompt: theme.fg("accent", "> ") });
				input.setValue(fetchConfig.nineRouterModel);
				input.focused = true;
				input.onEscape = () => {
					field = null;
				};
				input.onSubmit = (raw) => {
					const value = raw.trim();
					field = null;
					if (value) done({ kind: "model", value });
				};
				field = input;
			};

			/** space: open or close a provider row. */
			const toggle = () => {
				const node = nodes[cursor];
				if (node?.kind !== "provider" || !canExpand(node.row)) return;
				if (expanded.has(node.row.id)) expanded.delete(node.row.id);
				else expanded.add(node.row.id);
				nodes = buildNodes(expanded);
			};

			/** enter: set a provider as default, or edit the model row. */
			const select = () => {
				const node = nodes[cursor];
				if (node?.kind === "provider") return done({ kind: "select", id: node.row.id });
				if (node?.kind === "model") openField();
			};

			return {
				render(w: number) {
					const mw = modalWidth(w);
					const body: string[] = [];
					let selStart = 0;
					let selEnd = 1;
					nodes.forEach((node, index) => {
						const lines = renderNode(node, index === cursor, expanded, theme, field, mw - 4);
						if (index === cursor) {
							selStart = body.length;
							selEnd = body.length + lines.length;
						}
						body.push(...lines);
					});
					const result = frameModal({
						width: mw,
						maxHeight: terminalModalHeight(tui.terminal.rows),
						minHeight: MIN_MODAL_HEIGHT,
						header: [
							theme.fg("accent", theme.bold("Web Fetch")),
							theme.fg(
								"dim",
								"Default fetch provider \u00b7 shell variables \u00b7 provider settings",
							),
							"",
						],
						body,
						selectedBodyRange: pager.selectedRange({ start: selStart, end: selEnd }),
						footer: [
							"",
							!field
								? guide("\u2191\u2193", "navigate") +
									guideSep +
									guide("enter", "set default") +
									guideSep +
									guide("space", "open") +
									guideSep +
									guide("esc", "close")
								: guide("enter", "submit") + guideSep + guide("esc", "cancel"),
						],
						bodyOffset: pager.bodyOffset,
						color: (s) => theme.fg("accent", s),
						bg: (s) => theme.bg("customMessageBg", s),
						fg: (s) => theme.fg("text", s),
					});
					pager.sync(result);
					return result.lines;
				},
				invalidate() {},
				handleInput(data: string) {
					if (field) {
						field.handleInput(data);
						tui.requestRender?.();
						return;
					}
					if (pager.handleInput(data, keybindings, true)) {
						tui.requestRender?.();
						return;
					}
					if (matchesKey(data, Key.escape)) return done(null);
					if (matchesKey(data, Key.enter)) return select();
					else if (matchesKey(data, Key.up) || keybindings.matches(data, "tui.select.up")) move(-1);
					else if (matchesKey(data, Key.down) || keybindings.matches(data, "tui.select.down"))
						move(1);
					else if (matchesKey(data, Key.space)) toggle();
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
					fetchConfig.nineRouterModel = action.value;
					saveFetchConfig(fetchConfig);
					ctx.ui.notify(`Default model: ${fetchConfig.nineRouterModel}`, "info");
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
