/**
 * pix-pretty/provider-picker — color-coded provider settings used by /web and /voice.
 *
 * `showSettingsPicker` shows the sectioned overview. `showProviderPicker` shows the tree:
 *
 * One row per provider: default dot, status (connected / no API key needed / N variables
 * not set), and an expandable list of shell variables with set state and an export
 * example. A provider row with a `model` also shows a model row when expanded.
 */

import { Input, Key, type KeybindingsManager, matchesKey } from "@earendil-works/pi-tui";
import {
	frameModal,
	MIN_MODAL_HEIGHT,
	ModalPager,
	modalOverlayOptions,
	modalWidth,
	terminalModalHeight,
} from "./modal-frame.js";

export interface ProviderPickerRow {
	id: string;
	configured: boolean;
	env: string[];
	/** Show "no API key needed" in place of "connected". */
	noKey?: boolean;
	/** Current model. When set, the expanded row shows an editable model line. */
	model?: string;
}

export interface ProviderPickerOptions {
	title: string;
	subtitle: string;
	/** Rows in display order. An `auto` row renders as a choice, not a provider. */
	rows: ProviderPickerRow[];
	current: string;
	/** Canonical name → legacy alias. Either one counts as set. */
	envAliases?: Record<string, string>;
	envExample?: (name: string) => string;
}

export type ProviderPickerAction =
	| { kind: "select"; id: string }
	| { kind: "model"; id: string; value: string };

interface PickerTheme {
	fg(color: string, text: string): string;
	bg(color: string, text: string): string;
	bold(text: string): string;
}

export interface ProviderPickerUI {
	custom<T>(
		cb: (
			tui: { requestRender(): void; terminal?: { rows?: number } },
			theme: PickerTheme,
			keybindings: KeybindingsManager,
			done: (value: T) => void,
		) => {
			render(width: number): string[];
			invalidate(): void;
			handleInput(data: string): void;
		},
		opts?: { overlay?: boolean; overlayOptions?: ReturnType<typeof modalOverlayOptions> },
	): Promise<T | undefined>;
}

type Node =
	| { kind: "provider"; row: ProviderPickerRow }
	| { kind: "env"; name: string }
	| { kind: "model"; row: ProviderPickerRow };

function defaultExample(name: string): string {
	return name.endsWith("_URL")
		? `export ${name}="https://example.com"`
		: `export ${name}="your-api-key"`;
}

/** Render the tree body. Exported for tests. */
export function renderProviderRows(
	opts: ProviderPickerOptions,
	theme: Pick<PickerTheme, "fg">,
	state: { cursor: number; expanded: Set<string>; field?: { render(width: number): string[] } },
	width: number,
): { lines: string[]; nodes: Node[]; selected: { start: number; end: number } } {
	const aliases = opts.envAliases ?? {};
	const envIsSet = (name: string) => {
		const alias = aliases[name];
		return Boolean(process.env[name] || (alias && process.env[alias]));
	};
	const expandable = (row: ProviderPickerRow) =>
		row.model !== undefined || row.env.some((name) => !envIsSet(name));
	const nodes: Node[] = [];
	for (const row of opts.rows) {
		nodes.push({ kind: "provider", row });
		if (!state.expanded.has(row.id)) continue;
		for (const name of row.env) nodes.push({ kind: "env", name });
		if (row.model !== undefined) nodes.push({ kind: "model", row });
	}
	const mute = (value: string) => theme.fg("muted", value);
	const lines: string[] = [];
	let selected = { start: 0, end: 1 };
	nodes.forEach((node, index) => {
		const marker = index === state.cursor ? theme.fg("accent", "\u25B6") : " ";
		const start = lines.length;
		if (node.kind === "model") {
			const label = `${marker}     ${theme.fg("accent", "model")}:`;
			const field = index === state.cursor ? state.field : undefined;
			lines.push(
				field
					? `${label} ${field.render(Math.max(10, width - 15))[0] ?? ""}`
					: `${label} ${mute(node.row.model ?? "")}`,
			);
		} else if (node.kind === "env") {
			// ponytail: show only presence. Pix never reads or stores the secret value.
			const names = aliases[node.name] ? `${node.name} / ${aliases[node.name]}` : node.name;
			if (envIsSet(node.name)) {
				lines.push(
					`${marker}     ${theme.fg("accent", names)} ${theme.fg("success", "\u25CF set")}`,
				);
			} else {
				lines.push(
					`${marker}     ${theme.fg("accent", names)} ${mute("\u25CB not set")}`,
					`        ${theme.fg("warning", (opts.envExample ?? defaultExample)(node.name))}`,
				);
			}
		} else {
			const { id, configured, env, noKey } = node.row;
			const unset = env.filter((name) => !envIsSet(name)).length;
			const arrow = expandable(node.row) ? mute(state.expanded.has(id) ? "\u25BE" : "\u25B8") : " ";
			const isDefault = opts.current === id;
			const dot = isDefault ? theme.fg("accent", "\u25CF") : mute("\u25CB");
			const status =
				id === "auto"
					? mute("choice")
					: configured
						? theme.fg("success", noKey ? "no API key needed" : "connected")
						: theme.fg("warning", `${unset} variable${unset === 1 ? "" : "s"} not set`);
			const tail = isDefault ? mute(" \u00b7 default") : "";
			lines.push(`${marker} ${arrow} ${dot} ${theme.fg("accent", id)} ${status}${tail}`);
		}
		if (index === state.cursor) selected = { start, end: lines.length };
	});
	return { lines, nodes, selected };
}

export interface SettingsRow {
	key: string;
	section: string;
	label: string;
	value: string;
	/** Theme role for the value. Default `success`. */
	tone?: "success" | "warning" | "muted";
	/** Enter edits `value` in a text field inside the row, not in a new dialog. */
	editable?: boolean;
}

export type SettingsAction = { key: string; value?: string };

/** Render the sectioned settings overview body. Exported for tests. */
export function renderSettingsRows(
	rows: SettingsRow[],
	theme: Pick<PickerTheme, "fg">,
	selected: number,
	field?: { render(width: number): string[] },
	width = 80,
): { lines: string[]; rowLines: number[] } {
	const labelWidth = Math.max(...rows.map((row) => row.label.length));
	const lines: string[] = [];
	const rowLines: number[] = [];
	let section = "";
	rows.forEach((row, index) => {
		if (row.section !== section) {
			if (section) lines.push("");
			lines.push(theme.fg("dim", `  ${row.section}`));
			section = row.section;
		}
		const active = index === selected;
		rowLines[index] = lines.length;
		const label = `${active ? theme.fg("accent", "→") : " "} ${theme.fg(active ? "accent" : "text", row.label.padEnd(labelWidth))}  `;
		const editing = active ? field : undefined;
		lines.push(
			editing
				? `${label}${editing.render(Math.max(10, width - labelWidth - 4))[0] ?? ""}`
				: `${label}${theme.fg(row.tone ?? "success", row.value)}`,
		);
	});
	return { lines, rowLines };
}

/**
 * Show the sectioned settings overview. Resolves the chosen row key, or null on escape.
 * For an `editable` row, enter opens a text field in the row and resolves with its value.
 * `selected` restores the cursor when the caller shows the overview again.
 */
export async function showSettingsPicker(
	ui: ProviderPickerUI,
	title: string,
	rows: SettingsRow[],
	selected = 0,
): Promise<SettingsAction | null> {
	const result = await ui.custom<SettingsAction | null>(
		(tui, theme, keybindings, done) => {
			let field: Input | undefined;
			const edit = (row: SettingsRow) => {
				const input = new Input({ prompt: "" });
				input.setValue(row.value);
				input.focused = true;
				input.onEscape = () => {
					field = undefined;
				};
				input.onSubmit = (raw) => {
					const value = raw.trim();
					field = undefined;
					if (value && value !== row.value) done({ key: row.key, value });
				};
				field = input;
			};
			return {
				render(width: number) {
					const mw = modalWidth(width);
					const body = renderSettingsRows(rows, theme, selected, field, mw - 4);
					return frameModal({
						width: mw,
						maxHeight: terminalModalHeight(tui.terminal?.rows),
						minHeight: MIN_MODAL_HEIGHT,
						title,
						titleColor: (text) => theme.fg("accent", theme.bold(text)),
						header: [""],
						body: body.lines,
						footer: [
							"",
							theme.fg(
								"muted",
								field ? "enter save · esc cancel" : "↑↓ move · enter change · esc close",
							),
						],
						selectedBodyLine: body.rowLines[selected],
						color: (text) => theme.fg("accent", text),
						bg: (text) => theme.bg("customMessageBg", text),
					}).lines;
				},
				invalidate() {},
				handleInput(data: string) {
					if (field) {
						field.handleInput(data);
						return tui.requestRender();
					}
					if (keybindings.matches(data, "tui.select.cancel")) return done(null);
					const row = rows[selected];
					if (matchesKey(data, Key.enter)) {
						if (!row) return;
						if (!row.editable) return done({ key: row.key });
						edit(row);
						return tui.requestRender();
					}
					if (keybindings.matches(data, "tui.select.up"))
						selected = (selected - 1 + rows.length) % rows.length;
					else if (keybindings.matches(data, "tui.select.down"))
						selected = (selected + 1) % rows.length;
					else return;
					tui.requestRender();
				},
			};
		},
		{ overlay: true, overlayOptions: modalOverlayOptions() },
	);
	return result ?? null;
}

/** Show the provider tree. Resolves the chosen action, or null on escape. */
export async function showProviderPicker(
	ui: ProviderPickerUI,
	opts: ProviderPickerOptions,
): Promise<ProviderPickerAction | null> {
	const result = await ui.custom<ProviderPickerAction | null>(
		(tui, theme, keybindings, done) => {
			const guide = (key: string, action: string) =>
				theme.fg("text", key) + theme.fg("muted", ` ${action}`);
			const sep = theme.fg("muted", " \u00b7 ");
			const expanded = new Set<string>();
			const pager = new ModalPager();
			let field: Input | undefined;
			let nodes = renderProviderRows(opts, theme, { cursor: -1, expanded }, 80).nodes;
			let cursor = Math.max(
				0,
				nodes.findIndex((node) => node.kind === "provider" && node.row.id === opts.current),
			);

			const openField = (row: ProviderPickerRow) => {
				const input = new Input({ prompt: "" });
				input.setValue(row.model ?? "");
				input.focused = true;
				input.onEscape = () => {
					field = undefined;
				};
				input.onSubmit = (raw) => {
					const value = raw.trim();
					field = undefined;
					if (value) done({ kind: "model", id: row.id, value });
				};
				field = input;
			};

			const select = () => {
				const node = nodes[cursor];
				if (node?.kind === "provider") return done({ kind: "select", id: node.row.id });
				if (node?.kind !== "model") return;
				openField(node.row);
			};

			const toggle = () => {
				const node = nodes[cursor];
				if (node?.kind !== "provider") return;
				if (expanded.has(node.row.id)) expanded.delete(node.row.id);
				else expanded.add(node.row.id);
				nodes = renderProviderRows(opts, theme, { cursor, expanded }, 80).nodes;
			};

			return {
				render(width: number) {
					const mw = modalWidth(width);
					const body = renderProviderRows(opts, theme, { cursor, expanded, field }, mw - 4);
					nodes = body.nodes;
					const frame = frameModal({
						width: mw,
						maxHeight: terminalModalHeight(tui.terminal?.rows),
						minHeight: MIN_MODAL_HEIGHT,
						header: [
							theme.fg("accent", theme.bold(opts.title)),
							theme.fg("dim", opts.subtitle),
							"",
						],
						body: body.lines,
						selectedBodyRange: pager.selectedRange(body.selected),
						footer: [
							"",
							field
								? guide("enter", "submit") + sep + guide("esc", "cancel")
								: guide("\u2191\u2193", "navigate") +
									sep +
									guide("enter", "set default") +
									sep +
									guide("space", "open") +
									sep +
									guide("esc", "close"),
						],
						bodyOffset: pager.bodyOffset,
						color: (value) => theme.fg("accent", value),
						bg: (value) => theme.bg("customMessageBg", value),
						fg: (value) => theme.fg("text", value),
					});
					pager.sync(frame);
					return frame.lines;
				},
				invalidate() {},
				handleInput(data: string) {
					if (field) field.handleInput(data);
					else if (pager.handleInput(data, keybindings, true)) {
						// paged
					} else if (matchesKey(data, Key.escape)) return done(null);
					else if (matchesKey(data, Key.enter)) return select();
					else if (matchesKey(data, Key.space)) toggle();
					else if (matchesKey(data, Key.up) || keybindings.matches(data, "tui.select.up")) {
						cursor = Math.max(0, cursor - 1);
						pager.followSelection();
					} else if (matchesKey(data, Key.down) || keybindings.matches(data, "tui.select.down")) {
						cursor = Math.min(nodes.length - 1, cursor + 1);
						pager.followSelection();
					}
					tui.requestRender();
				},
			};
		},
		{ overlay: true, overlayOptions: modalOverlayOptions() },
	);
	return result ?? null;
}
