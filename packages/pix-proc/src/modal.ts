/**
 * `/proc` overlay — one framed modal (pix-pretty frameModal) with two views:
 * the process list and one process (log tail + actions). Same shape as the
 * `/plan` modal. The modal only returns a decision. index.ts runs it and
 * reports the result with a visible notify.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	type KeybindingsManager,
	matchesKey,
	type SelectItem,
	SelectList,
	type TUI,
} from "@earendil-works/pi-tui";
import {
	frameModal,
	MIN_MODAL_HEIGHT,
	ModalPager,
	modalWidth,
	selectListTheme,
	terminalModalHeight,
} from "@xynogen/pix-pretty/modal-frame";
import { humanUptime, type ProcMeta, statusWord } from "./format.ts";

export type ProcModalResult = { kind: "stop"; handle: string } | { kind: "rm"; handle: string };

/** Log lines shown in the process view. PgUp/PgDn pages through them. */
export const MODAL_LOG_LINES = 200;
const LIST_ROWS = 10;

type View = "list" | "proc";

export class ProcModal {
	private view: View = "list";
	private proc: ProcMeta | undefined;
	private log: string[] = [];
	private readonly pager = new ModalPager();
	private readonly list: SelectList;
	private actions: SelectList | undefined;
	/** Resolves when the log tail for the open process is loaded. Tests await it. */
	loading: Promise<void> = Promise.resolve();

	constructor(
		private readonly procs: ProcMeta[],
		private readonly readLog: (handle: string) => Promise<string[]>,
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly kb: KeybindingsManager,
		private readonly done: (result: ProcModalResult | undefined) => void,
	) {
		const now = Date.now();
		const items: SelectItem[] = procs.map((p) => ({
			value: p.handle,
			label: p.handle,
			description: [
				p.name ? `${p.name} (${p.command})` : p.command,
				humanUptime(now - p.startTime),
				statusWord(p),
				...(p.capped ? ["capped"] : []),
			].join(" · "),
		}));
		this.list = new SelectList(items, LIST_ROWS, selectListTheme(theme));
		this.list.onSelect = (item) => {
			const proc = procs.find((p) => p.handle === item.value);
			if (proc) this.openProc(proc);
		};
		this.list.onCancel = () => done(undefined);
	}

	private selected(): ProcMeta | undefined {
		const handle = this.list.getSelectedItem()?.value;
		return this.procs.find((p) => p.handle === handle);
	}

	private go(view: View): void {
		this.view = view;
		this.pager.reset();
	}

	/** Stop for a running process, remove for a finished one. */
	private act(proc: ProcMeta): void {
		this.done({ kind: proc.status === "running" ? "stop" : "rm", handle: proc.handle });
	}

	private openProc(proc: ProcMeta): void {
		this.proc = proc;
		this.log = ["(loading…)"];
		const primary = proc.status === "running" ? "Stop" : "Remove";
		this.actions = new SelectList(
			[primary, "Back"].map((v) => ({ value: v, label: v })),
			2,
			selectListTheme(this.theme),
		);
		this.actions.onSelect = (item) => (item.value === "Back" ? this.go("list") : this.act(proc));
		this.actions.onCancel = () => this.go("list");
		this.go("proc");
		this.loading = this.readLog(proc.handle).then(
			(lines) => {
				this.log = lines.length ? lines : ["(no output)"];
				this.tui.requestRender();
			},
			(err) => {
				this.log = [`log read failed: ${err instanceof Error ? err.message : String(err)}`];
				this.tui.requestRender();
			},
		);
	}

	handleInput(data: string): void {
		if (this.view === "list") this.handleListInput(data);
		else if (!this.pager.handleInput(data, this.kb, true)) this.actions?.handleInput(data);
		this.tui.requestRender();
	}

	private handleListInput(data: string): void {
		const proc = this.selected();
		if (proc?.status === "running" && matchesKey(data, "s")) this.act(proc);
		else if (proc && proc.status !== "running" && matchesKey(data, "r")) this.act(proc);
		else this.list.handleInput(data);
	}

	render(width: number): string[] {
		const t = this.theme;
		const mw = modalWidth(width);
		const inner = mw - 4;
		const title = (s: string) => t.fg("accent", t.bold(s));
		const hint = (s: string) => t.fg("muted", s);
		const rule = t.fg("muted", "─".repeat(inner));
		let header: string[];
		let body: string[];
		let footer: string[];

		if (this.view === "list") {
			const running = this.procs.filter((p) => p.status === "running").length;
			header = [title("Processes"), hint(`${running} running · ${this.procs.length} total`)];
			body = this.procs.length
				? this.list.render(inner)
				: [hint("no processes — the model starts one with the proc tool")];
			footer = [rule, hint("↑↓ choose • enter open • s stop • r remove finished • esc close")];
		} else {
			const p = this.proc as ProcMeta;
			const status =
				p.status === "running" ? t.fg("success", statusWord(p)) : t.fg("warning", statusWord(p));
			header = [
				`${title(p.handle)} ${status}`,
				t.fg("dim", p.name ? `${p.name} (${p.command})` : p.command),
				hint(
					`${p.cwd} · pid ${p.pid} · ${humanUptime(Date.now() - p.startTime)}${p.capped ? " · capped" : ""}`,
				),
			];
			body = this.log;
			footer = [
				rule,
				...(this.actions?.render(inner) ?? []),
				hint(
					`↑↓ choose • ←→/PgUp/PgDn scroll • enter select • esc back · last ${MODAL_LOG_LINES} lines`,
				),
			];
		}

		const result = frameModal({
			width: mw,
			maxHeight: terminalModalHeight(this.tui.terminal?.rows),
			minHeight: MIN_MODAL_HEIGHT,
			header,
			body,
			footer,
			bodyOffset: this.pager.bodyOffset,
			color: (s) => t.fg("accent", s),
			bg: (s) => t.bg("customMessageBg", s),
			fg: (s) => t.fg("text", s),
			overflowLine: ({ page, totalPages }) => hint(`←→/PgUp/PgDn scroll • ${page}/${totalPages}`),
		});
		this.pager.sync(result);
		return result.lines;
	}

	invalidate(): void {}
}
