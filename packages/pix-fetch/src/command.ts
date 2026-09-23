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
import { saveSearchConfig, searchConfig } from "./search-config.js";
import { listAllSearchProviders } from "./search-providers.js";

type ProviderRow = { id: string; configured: boolean; env: string[] };
type ProviderConfig = { provider: string; nineRouterModel: string };
type PickerSettings = {
	command: "fetch" | "search";
	title: string;
	config: ProviderConfig;
	save: (config: ProviderConfig) => void;
	providers: () => ProviderRow[];
	order: string[];
	noKey: Set<string>;
};

function providerRows(settings: PickerSettings): ProviderRow[] {
	const providers = settings.providers().sort((a, b) => {
		const aIndex = settings.order.indexOf(a.id);
		const bIndex = settings.order.indexOf(b.id);
		if (aIndex === -1 && bIndex === -1) return 0;
		if (aIndex === -1) return 1;
		if (bIndex === -1) return -1;
		return aIndex - bIndex;
	});
	return [{ id: "auto", configured: true, env: [] }, ...providers];
}

const LEGACY_ENV: Record<string, string> = {
	NINEROUTER_URL: "ROUTER_API_BASE",
	NINEROUTER_KEY: "ROUTER_API_KEY",
};

function envIsSet(name: string): boolean {
	const legacy = LEGACY_ENV[name];
	return Boolean(process.env[name] || (legacy && process.env[legacy]));
}

function envExample(name: string): string {
	if (name === "SEARXNG_URL") return `export ${name}="https://search.example.com"`;
	if (name === "GOOGLE_PSE_CX") return `export ${name}="your-search-engine-id"`;
	return name.endsWith("_URL")
		? `export ${name}="https://9router.example.com/v1"`
		: `export ${name}="your-api-key"`;
}

type Node =
	| { kind: "provider"; row: ProviderRow }
	| { kind: "env"; name: string }
	| { kind: "model" };

type Action = { kind: "select"; id: string } | { kind: "model"; value: string };

const NINE_ROUTER = "9router";

function canExpand(row: ProviderRow): boolean {
	return row.id === NINE_ROUTER || row.env.some((name) => !envIsSet(name));
}

function buildNodes(rows: ProviderRow[], expanded: Set<string>): Node[] {
	const nodes: Node[] = [];
	for (const row of rows) {
		nodes.push({ kind: "provider", row });
		if (!expanded.has(row.id)) continue;
		for (const name of row.env) nodes.push({ kind: "env", name });
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
	settings: PickerSettings,
): string[] {
	const mute = (value: string) => theme.fg("muted", value);
	const marker = cursor ? theme.fg("accent", "\u25B6") : " ";
	if (node.kind === "model") {
		const label = `${marker}     ${theme.fg("accent", "model")}:`;
		if (!field) return [`${label} ${mute(settings.config.nineRouterModel)}`];
		return [`${label} ${field.render(Math.max(10, width - 15))[0] ?? ""}`];
	}
	if (node.kind === "env") {
		// ponytail: show only presence. Pix never reads or stores the secret value.
		const names = LEGACY_ENV[node.name] ? `${node.name} / ${LEGACY_ENV[node.name]}` : node.name;
		if (envIsSet(node.name)) {
			return [`${marker}     ${theme.fg("accent", names)} ${theme.fg("success", "\u25CF set")}`];
		}
		return [
			`${marker}     ${theme.fg("accent", names)} ${mute("\u25CB not set")}`,
			`        ${theme.fg("warning", envExample(node.name))}`,
		];
	}
	const { id, configured, env } = node.row;
	const setCount = env.filter(envIsSet).length;
	const unset = env.length - setCount;
	const arrow = canExpand(node.row) ? mute(expanded.has(id) ? "\u25BE" : "\u25B8") : " ";
	const isDefault = settings.config.provider === id;
	const dot = isDefault ? theme.fg("accent", "\u25CF") : mute("\u25CB");
	const status =
		id === "auto"
			? mute("choice")
			: configured
				? theme.fg("success", settings.noKey.has(id) ? "no API key needed" : "connected")
				: theme.fg("warning", `${unset} variable${unset === 1 ? "" : "s"} not set`);
	const tail = isDefault ? mute(" \u00b7 default") : "";
	return [`${marker} ${arrow} ${dot} ${theme.fg("accent", id)} ${status}${tail}`];
}

async function showPicker(ctx: ExtensionContext, settings: PickerSettings): Promise<Action | null> {
	return ctx.ui.custom<Action | null>(
		(tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (r: Action | null) => void) => {
			const guide = (key: string, action: string) =>
				theme.fg("text", key) + theme.fg("muted", ` ${action}`);
			const guideSep = theme.fg("muted", " \u00b7 ");
			const rows = providerRows(settings);
			const expanded = new Set<string>();
			let nodes = buildNodes(rows, expanded);
			let cursor = Math.max(
				0,
				nodes.findIndex(
					(node) => node.kind === "provider" && node.row.id === settings.config.provider,
				),
			);
			const pager = new ModalPager();
			let field: Input | null = null;

			const move = (delta: number) => {
				cursor = Math.min(nodes.length - 1, Math.max(0, cursor + delta));
				pager.followSelection();
			};

			const openField = () => {
				const input = new Input({ prompt: "" });
				input.setValue(settings.config.nineRouterModel);
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

			const toggle = () => {
				const node = nodes[cursor];
				if (node?.kind !== "provider" || !canExpand(node.row)) return;
				if (expanded.has(node.row.id)) expanded.delete(node.row.id);
				else expanded.add(node.row.id);
				nodes = buildNodes(rows, expanded);
			};

			const select = () => {
				const node = nodes[cursor];
				if (node?.kind === "provider") return done({ kind: "select", id: node.row.id });
				if (node?.kind === "model") openField();
			};

			return {
				render(width: number) {
					const mw = modalWidth(width);
					const body: string[] = [];
					let selStart = 0;
					let selEnd = 1;
					nodes.forEach((node, index) => {
						const lines = renderNode(
							node,
							index === cursor,
							expanded,
							theme,
							field,
							mw - 4,
							settings,
						);
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
							theme.fg("accent", theme.bold(settings.title)),
							theme.fg(
								"dim",
								`Default ${settings.command} provider \u00b7 shell variables \u00b7 provider settings`,
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
						color: (value) => theme.fg("accent", value),
						bg: (value) => theme.bg("customMessageBg", value),
						fg: (value) => theme.fg("text", value),
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
					if (matchesKey(data, Key.up) || keybindings.matches(data, "tui.select.up")) move(-1);
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

function registerProviderCommand(pi: ExtensionAPI, settings: PickerSettings): void {
	pi.registerCommand(settings.command, {
		description: `Set the default ${settings.command} provider and 9Router model`,
		handler: async (_args, ctx) => {
			if (typeof ctx.ui.custom !== "function") {
				const provider = await ctx.ui.select(
					`Default ${settings.command} provider`,
					providerRows(settings).map(({ id }) => id),
				);
				if (provider) {
					settings.config.provider = provider;
					settings.save(settings.config);
				}
				return;
			}

			while (true) {
				const action = await showPicker(ctx, settings);
				if (!action) return;
				if (action.kind === "model") {
					settings.config.nineRouterModel = action.value;
					settings.save(settings.config);
					ctx.ui.notify(`Default model: ${settings.config.nineRouterModel}`, "info");
					continue;
				}
				settings.config.provider = action.id;
				settings.save(settings.config);
				ctx.ui.notify(`Default provider: ${action.id}`, "info");
				return;
			}
		},
	});
}

export function registerFetchCommand(pi: ExtensionAPI): void {
	registerProviderCommand(pi, {
		command: "fetch",
		title: "Web Fetch",
		config: fetchConfig,
		save: saveFetchConfig,
		providers: listAllFetchProviders,
		order: ["curl", "jina-reader", "9router"],
		noKey: new Set(["curl", "jina-reader"]),
	});
}

export function registerSearchCommand(pi: ExtensionAPI): void {
	registerProviderCommand(pi, {
		command: "search",
		title: "Web Search",
		config: searchConfig,
		save: saveSearchConfig,
		providers: listAllSearchProviders,
		order: [
			"searxng",
			"9router",
			"exa",
			"tavily",
			"perplexity",
			"serper",
			"brave-search",
			"youcom",
			"google-pse",
			"searchapi",
			"linkup",
			"xquik",
			"ollama-search",
		],
		noKey: new Set(["searxng"]),
	});
}
