/**
 * toolbox.ts — /toolbox command for user-driven tool gating
 *
 * Registers a `/toolbox` slash command that opens a TUI picker listing every
 * registered tool (built-in and MCP). Direct tools can be toggled on/off —
 * this controls which tools are described in the system prompt via
 * pi.setActiveTools(). Deferred tools stay available through tool_search.
 *
 * Also supports headless usage:
 *   /toolbox enable <names>   — enable tool(s) by name
 *   /toolbox disable <names>  — disable tool(s) by name
 *   /toolbox list [query]     — text search (no picker)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
	ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	decodeKittyPrintable,
	fuzzyFilter,
	Input,
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
	terminalModalHeight,
} from "@xynogen/pix-pretty/modal-frame";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Tools that can never be disabled — always prompt-visible. */
export const CORE_TOOLS: ReadonlySet<string> = new Set(["bash", "edit", "read", "write"]);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToolRow {
	name: string;
	description: string;
	mcp: boolean;
	source?: string;
	exposure?: string;
}

/** Callbacks for toggleTool / renderList — test seam. */
export interface ToggleOps {
	isActive: (name: string) => boolean;
	onActivate: (name: string) => boolean;
	onDeactivate: (name: string) => boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isMcpTool(info: ToolInfo): boolean {
	return /mcp/i.test(info.sourceInfo?.source ?? "");
}

export function buildRows(tools: ToolInfo[]): ToolRow[] {
	return (
		tools
			.filter((t) => !CORE_TOOLS.has(t.name))
			.map((t) => ({
				name: t.name,
				description: firstSentence(t.description ?? ""),
				mcp: isMcpTool(t),
				source: t.sourceInfo?.source,
				exposure: (t as ToolInfo & { exposure?: string }).exposure ?? "direct",
			}))
			// Normal tools first, MCP tools last. Inside a group: direct before deferred, then by name.
			.sort(
				(a, b) =>
					Number(a.mcp) - Number(b.mcp) ||
					Number(a.exposure === "deferred") - Number(b.exposure === "deferred") ||
					a.name.localeCompare(b.name),
			)
	);
}

const firstSentence = (desc: string): string => {
	const clean = (desc ?? "").replace(/\s+/g, " ").trim();
	const m = clean.match(/^.*?[.!?](?=\s|$)/);
	return (m ? m[0] : clean).slice(0, 120);
};

export function parseTargets(raw: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of raw.split(/[\s,]+/)) {
		const name = t.trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		out.push(name);
	}
	return out;
}

export function renderList(
	rows: ToolRow[],
	isActive: (name: string) => boolean,
	query?: string,
): string {
	const filtered = query
		? rows.filter(
				(r) =>
					r.name.toLowerCase().includes(query.toLowerCase()) ||
					r.description.toLowerCase().includes(query.toLowerCase()),
			)
		: rows;

	if (!filtered.length) {
		return query ? `No tools matched "${query}".` : "No tools registered.";
	}

	const lines: string[] = [];
	let group = "";
	for (const row of filtered) {
		const nextGroup = row.mcp ? "MCP" : "Tools";
		if (group !== nextGroup) {
			group = nextGroup;
			lines.push(`${lines.length ? "\n" : ""}${group}:`);
		}
		const status =
			row.exposure === "deferred" ? "deferred" : isActive(row.name) ? "✓ active" : "# gated";
		const kind = row.mcp ? "MCP" : "tool";
		lines.push(`${status}  ${row.name}  [${kind}]  ${row.description}`);
	}
	return lines.join("\n");
}

export function toggleTool(
	action: "enable" | "disable",
	name: string,
	rows: ToolRow[],
	ops: ToggleOps,
): string {
	const row = rows.find((r) => r.name === name);
	if (!row) return `Unknown tool "${name}".`;
	if (row.exposure === "deferred") return `${name} is deferred. Use tool_search to load it.`;

	if (action === "enable") {
		const did = ops.onActivate(name);
		return did ? `Enabled ${name} — now prompt-visible.` : `${name} is already active.`;
	}
	const did = ops.onDeactivate(name);
	return did ? `Disabled ${name} — hidden from prompt.` : `${name} is already gated.`;
}

// ─── Persistence ───────────────────────────────────────────────────────────

/**
 * Persisted gate state. Stores the tools the user turned OFF, so a newly
 * installed tool is active by default. `enabledTools` is the legacy form
 * (an allow-list that hid every tool installed later); it is read once and
 * migrated to `disabledTools` on the next write.
 */
interface ToolboxState {
	disabledTools?: string[];
	enabledTools?: string[];
}

function getStatePath(): string {
	return join(getAgentDir(), "toolbox.json");
}

const isStringArray = (v: unknown): v is string[] =>
	Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Disabled tool names from a saved state, or undefined when it holds none.
 * A legacy allow-list maps to "every known non-core tool not in it".
 */
export function disabledFromState(raw: unknown, allNames: string[]): string[] | undefined {
	const state = raw as ToolboxState | undefined;
	if (isStringArray(state?.disabledTools))
		return state.disabledTools.filter((n) => !CORE_TOOLS.has(n));
	if (isStringArray(state?.enabledTools)) {
		const enabled = new Set(state.enabledTools);
		return allNames.filter((n) => !enabled.has(n) && !CORE_TOOLS.has(n));
	}
	return undefined;
}

// ─── State ──────────────────────────────────────────────────────────────────

function createState(pi: ExtensionAPI) {
	let disabledTools = new Set<string>();
	let initialized = false;

	function allNames(): string[] {
		try {
			return (pi.getAllTools() ?? []).map((t) => t.name);
		} catch (err) {
			console.warn("toolbox: getAllTools failed:", err);
			return [];
		}
	}

	function persist(): void {
		const data: ToolboxState = { disabledTools: [...disabledTools].sort() };
		// Write to session so state survives branch navigation within a session
		try {
			pi.appendEntry<ToolboxState>("toolbox-config", data);
		} catch (err) {
			console.warn("toolbox: persist failed:", err);
		}
		// Write to disk so state survives across completely new sessions
		try {
			const sp = getStatePath();
			mkdirSync(dirname(sp), { recursive: true });
			writeFileSync(sp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
		} catch (err) {
			console.warn("toolbox: file persist failed:", err);
		}
	}

	/** Raw persisted state from disk, or undefined when absent/corrupt. */
	function loadFromFile(): { raw: unknown; legacy: boolean } | undefined {
		try {
			const sp = getStatePath();
			if (!existsSync(sp)) return undefined;
			const raw = JSON.parse(readFileSync(sp, "utf-8")) as ToolboxState;
			return { raw, legacy: !isStringArray(raw?.disabledTools) };
		} catch {
			// corrupt, or a test env without getAgentDir
			return undefined;
		}
	}

	/** Latest toolbox-config entry in the session, or undefined. */
	function loadFromSession(ctx: ExtensionContext): unknown {
		if (!ctx?.sessionManager) return undefined;
		// getEntries() returns ALL entries in the session file — unlike getBranch()
		// which only walks ancestors. Custom entries appended via appendCustomEntry
		// are children of the leaf, not ancestors.
		let saved: unknown;
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === "toolbox-config") saved = entry.data;
		}
		return saved;
	}

	function restoreFromBranch(ctx: ExtensionContext): void {
		// Prefer file-based persistence (survives across sessions), then session
		// entries (survive branch navigation), then nothing disabled (first run).
		const names = allNames();
		const file = loadFromFile();
		const fromFile = file ? disabledFromState(file.raw, names) : undefined;
		const disabled = fromFile ?? disabledFromState(loadFromSession(ctx), names) ?? [];
		disabledTools = new Set(disabled);
		initialized = true;
		apply();
		// Migrate a legacy allow-list file to the disabled-list form.
		if (file?.legacy && fromFile) persist();
	}

	function apply(): void {
		if (!initialized) return;
		try {
			const tools = pi.getAllTools();
			const active = new Set(pi.getActiveTools());
			pi.setActiveTools(
				tools
					.filter(
						(tool) =>
							!disabledTools.has(tool.name) &&
							(["direct", "model-only"].includes(
								(tool as ToolInfo & { exposure?: string }).exposure ?? "direct",
							) ||
								active.has(tool.name)),
					)
					.map((tool) => tool.name),
			);
		} catch (err) {
			console.warn("toolbox: setActiveTools failed:", err);
		}
	}

	function isActive(name: string): boolean {
		return pi.getActiveTools().includes(name);
	}

	function onActivate(name: string): boolean {
		if (!initialized) return false;
		if (!disabledTools.delete(name)) return false;
		apply();
		persist();
		return true;
	}

	function onDeactivate(name: string): boolean {
		if (!initialized) return false;
		if (CORE_TOOLS.has(name) || disabledTools.has(name)) return false;
		disabledTools.add(name);
		apply();
		persist();
		return true;
	}

	return {
		restoreFromBranch,
		isActive,
		onActivate,
		onDeactivate,
	};
}

// ─── Registration ───────────────────────────────────────────────────────────

export default function registerToolbox(pi: ExtensionAPI): void {
	const state = createState(pi);

	// Defer init until tools are registered — session_start fires after all extensions load.
	// Try to restore persisted state; fall back to full init if no config found.
	pi.on("session_start", async (_event, ctx) => {
		state.restoreFromBranch(ctx);
	});

	// Re-restore when navigating branch history
	pi.on("session_tree", async (_event, ctx) => {
		state.restoreFromBranch(ctx);
	});

	function getRows(): ToolRow[] {
		try {
			return buildRows(pi.getAllTools() ?? []);
		} catch {
			return [];
		}
	}

	const ops: ToggleOps = {
		isActive: state.isActive,
		onActivate: state.onActivate,
		onDeactivate: state.onDeactivate,
	};

	async function showPicker(ctx: {
		ui: {
			custom: <T>(
				f: unknown,
				opts?: {
					overlay?: boolean;
					overlayOptions?: {
						anchor?: string;
						maxHeight?: number | string;
						width?: number | string;
					};
				},
			) => Promise<T>;
			notify: (m: string, t?: "info" | "warning" | "error") => void;
		};
	}): Promise<void> {
		await ctx.ui.custom<null>(
			(tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (r: null) => void) => {
				const accent = "accent";
				const mute = (s: string) => theme.fg("muted", s);
				const guide = (key: string, action: string) =>
					theme.fg("text", key) + theme.fg("muted", ` ${action}`);
				const guideSep = theme.fg("muted", " · ");

				type RowState = "active" | "gated";
				const stateOf = (name: string): RowState => (ops.isActive(name) ? "active" : "gated");

				const labelFor = (r: ToolRow): string => {
					const active = stateOf(r.name) === "active";
					const deferred = r.exposure === "deferred";
					const marker = deferred || active ? " " : theme.fg("warning", "#");
					const name =
						active && !deferred ? theme.fg("success", r.name) : theme.fg("muted", r.name);
					const kind = mute(`[${deferred ? "deferred" : "normal"} · ${r.mcp ? "MCP" : "tool"}]`);
					return `${marker} ${name}  ${kind}`;
				};

				const descFor = (r: ToolRow): string => {
					const active = stateOf(r.name) === "active";
					const tag =
						r.exposure === "deferred"
							? mute("deferred · tool_search")
							: active
								? theme.fg("success", "active")
								: theme.fg("warning", "gated");
					return `${tag} ${mute("·")} ${r.description || "(no description)"}`;
				};

				const rows = getRows();
				const byValue = new Map<string, ToolRow>();
				const toItem = (r: ToolRow): SelectItem => {
					byValue.set(r.name, r);
					return {
						value: r.name,
						label: labelFor(r),
						description: descFor(r),
					};
				};

				const allItems = rows.map(toItem);
				const widest = allItems.reduce((w, it) => Math.max(w, visibleWidth(it.label)), 0);

				const list = new SelectList(
					allItems,
					Math.max(1, allItems.length),
					{
						selectedPrefix: (t: string) => theme.fg(accent, t),
						selectedText: (t: string) => theme.fg(accent, t),
						description: (t: string) => t,
						scrollInfo: (t: string) => theme.fg("muted", t),
						noMatch: (t: string) => theme.fg("warning", t),
					},
					{
						minPrimaryColumnWidth: widest + 2,
						maxPrimaryColumnWidth: widest + 2,
					},
				);

				// SAFETY: SelectList exposes these stable fields internally for label refreshes.
				const internal = list as unknown as {
					items: SelectItem[];
					filteredItems: SelectItem[];
					selectedIndex: number;
				};

				const search = new Input();
				let statusText = "";
				const pager = new ModalPager();

				const refreshLabels = () => {
					for (const it of internal.items) {
						const r = byValue.get(it.value);
						if (!r) continue;
						it.label = labelFor(r);
						it.description = descFor(r);
					}
					list.invalidate();
					tui.requestRender?.();
				};

				const doToggle = (action: "enable" | "disable") => {
					const sel = list.getSelectedItem();
					if (!sel) return;
					const msg = toggleTool(action, sel.value, rows, ops);
					statusText = theme.fg("dim", msg);
					refreshLabels();
				};

				const flipSelected = () => {
					const sel = list.getSelectedItem();
					if (!sel) return;
					if (stateOf(sel.value) === "active") doToggle("disable");
					else doToggle("enable");
				};

				const applyFilter = (q: string) => {
					const query = q.trim();
					const hits =
						query.length === 0
							? internal.items
							: fuzzyFilter(
									internal.items,
									query,
									(it: SelectItem) => `${it.value} ${it.description ?? ""}`,
								);
					// Keep the MCP group after normal tools, so one header can split them.
					const isMcp = (it: SelectItem) => byValue.get(it.value)?.mcp === true;
					internal.filteredItems = [...hits.filter((it) => !isMcp(it)), ...hits.filter(isMcp)];
					internal.selectedIndex = 0;
					list.invalidate();
				};

				list.onSelect = () => done(null);
				list.onCancel = () => done(null);
				search.onEscape = () => done(null);

				return {
					render(w: number) {
						const mw = modalWidth(w);
						const inner = mw - 4; // CHROME = 2 border + 2 padding
						const footer = statusText ? ["", statusText] : [""];
						// maxVisible = all items, so list line i is filteredItems[i].
						const body = list.render(inner);
						const split = internal.filteredItems.findIndex((it) => byValue.get(it.value)?.mcp);
						const mcpHeader =
							split < 0 ? [] : [...(split > 0 ? [""] : []), theme.fg("dim", "  MCP")];
						body.splice(Math.max(0, split), 0, ...mcpHeader);
						const selLine =
							internal.selectedIndex +
							(split >= 0 && internal.selectedIndex >= split ? mcpHeader.length : 0);
						footer.push(
							guide("↑↓", "navigate") +
								guideSep +
								guide("←→/PgUp/PgDn", "inspect") +
								guideSep +
								guide("e", "enable") +
								guideSep +
								guide("d", "disable") +
								guideSep +
								guide("space", "toggle") +
								guideSep +
								guide("esc", "close"),
						);
						const result = frameModal({
							width: mw,
							maxHeight: terminalModalHeight(tui.terminal.rows),
							minHeight: MIN_MODAL_HEIGHT,
							header: [
								theme.fg(accent, theme.bold("🧰  Toolbox")),
								theme.fg("dim", "Search:"),
								...search.render(inner),
								"",
							],
							body,
							selectedBodyRange: pager.selectedRange({ start: selLine, end: selLine + 1 }),
							footer,
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
						search.invalidate();
					},
					handleInput(data: string) {
						if (pager.handleInput(data, keybindings, true)) {
							tui.requestRender?.();
							return;
						}
						if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
							list.handleInput?.(data);
							pager.followSelection();
						} else if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
							done(null);
							return;
						} else if (matchesKey(data, Key.space) || matchesKey(data, Key.tab)) {
							flipSelected();
						} else {
							const printable = decodeKittyPrintable(data);
							if (printable !== undefined) {
								if (printable === "e") {
									doToggle("enable");
								} else if (printable === "d") {
									doToggle("disable");
								} else {
									search.handleInput?.(data);
									applyFilter(search.getValue?.() ?? "");
									pager.followSelection();
								}
							} else {
								search.handleInput?.(data);
								applyFilter(search.getValue?.() ?? "");
								pager.followSelection();
							}
						}
						list.invalidate();
						tui.requestRender?.();
					},
				};
			},
			{ overlay: true, overlayOptions: modalOverlayOptions() },
		);
	}

	pi.registerCommand("toolbox", {
		description:
			"Toggle tools on/off. ↑↓ navigate, e/d enable/disable, space toggle. " +
			"Headless: /toolbox enable|disable <names>, /toolbox list [query]",
		handler: async (args, ctx) => {
			const raw = (args ?? "").trim();
			const verb = raw.split(/\s+/, 1)[0]?.toLowerCase();

			if (verb === "enable" || verb === "disable") {
				const targets = parseTargets(raw.slice(verb.length).trim());
				if (!targets.length) {
					ctx.ui.notify(
						`/toolbox ${verb} needs a tool name, e.g. /toolbox ${verb} grep`,
						"warning",
					);
					return;
				}
				const rows = getRows();
				const msg = targets.map((t) => toggleTool(verb, t, rows, ops)).join("\n");
				ctx.ui.notify(msg, "info");
				return;
			}

			if (verb === "list") {
				const query = raw.slice(verb.length).trim() || undefined;
				ctx.ui.notify(renderList(getRows(), ops.isActive, query), "info");
				return;
			}

			if (typeof ctx.ui.custom === "function") {
				// SAFETY: The runtime command context satisfies showPicker's narrowed UI contract.
				await showPicker(ctx as unknown as Parameters<typeof showPicker>[0]);
			} else {
				ctx.ui.notify(renderList(getRows(), ops.isActive), "info");
			}
		},
	});
}
