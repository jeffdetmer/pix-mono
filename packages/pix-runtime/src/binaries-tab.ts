/**
 * binaries-tab.ts — the `/pix` Binaries tab: every catalogued binary, where it
 * resolved from, its version, and controls to install / set / clear a path.
 *
 * Pure view-controller over `binaries/*`; pix-command.ts owns the frame + tabs.
 */

import { Input, matchesKey } from "@earendil-works/pi-tui";
import { ensureTool, type ToolStatus } from "./binaries/ensure.ts";
import { listTools, type ToolLookup, toolVersion } from "./binaries/resolve.ts";
import { readBinaryStore, setBinaryChoice, syncBinaryStore } from "./binaries/store.ts";
import { type IconKey, icon } from "./icon-catalog.ts";

export interface TabTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

export interface BinariesTabOptions {
	env: NodeJS.ProcessEnv;
	theme: TabTheme;
	requestRender(): void;
}

export interface TabView {
	header: string[];
	body: string[];
	selectedBodyLine?: number;
	/** Key/action guide pairs. */
	footer: Array<[string, string]>;
}

const STATE_ICON: Record<ToolLookup["state"], IconKey> = {
	ok: "status.ok",
	missing: "status.error",
	broken: "status.warn",
	unsupported: "status.pending",
};
const STATE_COLOR: Record<ToolLookup["state"], string> = {
	ok: "success",
	missing: "error",
	broken: "warning",
	unsupported: "muted",
};

export function describeStatus(s: ToolStatus): { text: string; color: string } {
	if (s.kind === "downloading")
		return {
			text: `downloading ${s.name} ${s.version}${s.size ? ` (${s.size})` : ""} from ${s.url}`,
			color: "accent",
		};
	if (s.kind === "installed")
		return {
			text: `installed ${s.name} ${s.version} → ${s.path}${s.verified ? " (sha256 verified)" : ""}`,
			color: "success",
		};
	return { text: `${s.name}: ${s.error}${s.hint ? ` — install: ${s.hint}` : ""}`, color: "error" };
}

/** Rows needed on this OS first (alphabetical), then other-platform entries. */
function ordered(rows: ToolLookup[]): ToolLookup[] {
	const here = rows.filter((r) => r.state !== "unsupported");
	const other = rows.filter((r) => r.state === "unsupported");
	return [...here, ...other];
}

export function createBinariesTab(opts: BinariesTabOptions) {
	const { env, theme } = opts;
	let rows: ToolLookup[] = [];
	let selected = 0;
	let status: { text: string; color: string } | undefined;
	let storeError: string | undefined;
	let storePath = "";
	const versions = new Map<string, string | null>();
	const installing = new Set<string>();
	let editor: { name: string; input: Input } | undefined;

	const refresh = () => {
		const store = syncBinaryStore(env);
		storeError = store.error;
		storePath = store.path;
		rows = ordered(listTools({ env, store: readBinaryStore(env) }));
		selected = Math.min(selected, Math.max(0, rows.length - 1));
		for (const row of rows) {
			const key = `${row.name}\0${row.path ?? ""}`;
			if (row.state !== "ok" || !row.path || versions.has(key)) continue;
			versions.set(key, null);
			void toolVersion(row.name, row.path).then((v) => {
				versions.set(key, v ?? "");
				opts.requestRender();
			});
		}
	};

	const install = (row: ToolLookup) => {
		if (installing.has(row.name)) return;
		installing.add(row.name);
		void ensureTool(row.name, {
			env,
			onStatus: (s) => {
				status = describeStatus(s);
				opts.requestRender();
			},
		})
			.catch((err: unknown) => {
				if (status?.color !== "error")
					status = { text: err instanceof Error ? err.message : String(err), color: "error" };
			})
			.finally(() => {
				installing.delete(row.name);
				refresh();
				opts.requestRender();
			});
	};

	const save = (name: string, value: string | null) => {
		try {
			setBinaryChoice(name, value, env);
			status = value
				? { text: `${name} → ${value} (saved to binary.json)`, color: "success" }
				: { text: `${name} → automatic (saved to binary.json)`, color: "success" };
		} catch (err) {
			status = { text: err instanceof Error ? err.message : String(err), color: "error" };
		}
		refresh();
	};

	refresh();

	return {
		/** True while the path editor owns the keyboard (esc/tab must not leave the tab). */
		get editing(): boolean {
			return editor !== undefined;
		},

		refresh,

		handleInput(data: string, keys: { up: boolean; down: boolean; enter: boolean }): boolean {
			if (editor) {
				editor.input.handleInput(data);
				return true;
			}
			const row = rows[selected];
			if (keys.up) selected = (selected - 1 + rows.length) % Math.max(1, rows.length);
			else if (keys.down) selected = (selected + 1) % Math.max(1, rows.length);
			else if (keys.enter && row) {
				if (row.downloadable && row.state === "missing") install(row);
				else {
					refresh();
					status = { text: `re-checked ${row.name}`, color: "muted" };
				}
			} else if (matchesKey(data, "e") && row) {
				const input = new Input({ prompt: `${row.name} path: ` });
				input.focused = true;
				input.setValue(row.choice ?? row.path ?? "");
				input.onSubmit = (value) => {
					editor = undefined;
					save(row.name, value.trim() ? value : null);
					opts.requestRender();
				};
				input.onEscape = () => {
					editor = undefined;
					opts.requestRender();
				};
				editor = { name: row.name, input };
			} else if (matchesKey(data, "d") && row) save(row.name, null);
			else if (matchesKey(data, "r")) {
				versions.clear();
				refresh();
				status = { text: "re-checked all binaries", color: "muted" };
			} else return false;
			return true;
		},

		view(width: number): TabView {
			const nameW = Math.max(6, ...rows.map((r) => r.name.length));
			const body: string[] = [];
			let selectedBodyLine: number | undefined;
			let otherHeader = false;
			for (let i = 0; i < rows.length; i++) {
				const row = rows[i] as ToolLookup;
				if (row.state === "unsupported" && !otherHeader) {
					otherHeader = true;
					body.push("", theme.fg("dim", "  Other platforms"));
				}
				const sel = i === selected;
				const cursor = sel ? theme.fg("accent", "→") : " ";
				const soft = row.optional && row.state === "missing";
				const glyph = soft
					? theme.fg("muted", icon("status.pending"))
					: theme.fg(STATE_COLOR[row.state], icon(STATE_ICON[row.state]));
				const name = theme.fg(sel ? "accent" : "text", row.name.padEnd(nameW));
				const busy = installing.has(row.name);
				let detail: string;
				if (row.state === "ok") {
					const version = versions.get(`${row.name}\0${row.path ?? ""}`);
					const meta = [row.source === "user" ? "binary.json" : row.source, version || undefined]
						.filter(Boolean)
						.join(" · ");
					detail = `${theme.fg("dim", row.path ?? "")} ${theme.fg("muted", `· ${meta}`)}`;
				} else if (row.state === "broken") {
					detail = `${theme.fg("warning", `${row.choice} (not found)`)} ${theme.fg("muted", "· binary.json")}`;
				} else if (busy) {
					detail = theme.fg("accent", "installing…");
				} else if (soft) {
					detail = theme.fg("muted", `not installed (optional) · ${row.hint}`);
				} else if (row.state === "missing") {
					detail = row.downloadable
						? `${theme.fg("warning", "missing")} ${theme.fg("muted", "· enter to install")}`
						: `${theme.fg("warning", "missing")} ${theme.fg("muted", `· ${row.hint}`)}`;
				} else {
					detail = theme.fg("muted", `not used on this OS · ${row.hint}`);
				}
				if (sel) selectedBodyLine = body.length;
				body.push(`${cursor} ${glyph} ${name}  ${detail}`);
				if (sel && row.usedBy.length > 0)
					body.push(theme.fg("muted", `      used by ${row.usedBy.join(", ")}`));
			}

			const header: string[] = [];
			if (storeError)
				header.push(theme.fg("error", `binary.json is invalid: ${storeError} — fix ${storePath}`));
			else
				header.push(
					theme.fg("muted", `paths: ${storePath} · null = automatic (bin → PATH → download)`),
				);
			if (editor) header.push(editor.input.render(Math.max(10, width - 4))[0] ?? "");
			else if (status) header.push(theme.fg(status.color, status.text));

			const footer: Array<[string, string]> = editor
				? [
						["enter", "save (empty = automatic)"],
						["esc", "cancel"],
					]
				: [
						["enter", "install/re-check"],
						["e", "set path"],
						["d", "automatic"],
						["r", "refresh"],
					];
			return { header, body, selectedBodyLine, footer };
		},

		/** Plain-text block for headless `/pix`. */
		summary(): string[] {
			return rows.map((r) => {
				const where =
					r.state === "ok"
						? `${r.path} (${r.source})`
						: r.state === "broken"
							? `${r.choice} (broken)`
							: r.state;
				return `  ${r.name}: ${where}`;
			});
		},
	};
}

export type BinariesTab = ReturnType<typeof createBinariesTab>;
