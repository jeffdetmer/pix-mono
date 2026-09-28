/**
 * Plan manager overlay for `/plan` — one framed modal (pix-pretty frameModal)
 * with four views: plan list, plan detail, edit, and delete confirm (CRUD).
 * The modal only returns a decision; plan-mode.ts performs it visibly.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	Key,
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
import type { Plan } from "./plan-mode.ts";

export type PlanModalResult =
	| { kind: "execute"; plan: Plan }
	| { kind: "delete"; plan: Plan }
	| { kind: "save"; plan: Plan; text: string }
	| { kind: "new" };

const LIST_ROWS = 10;

type View = "list" | "plan" | "confirm" | "edit";

/** Rebuild the file text so Edit shows title, description, and plan together. */
export function planToText(plan: Plan): string {
	return `---\ntitle: ${plan.title}\ndescription: ${plan.description}\n---\n${plan.body}`;
}

export class PlanModal {
	private view: View = "list";
	private plan: Plan | undefined;
	private readonly pager = new ModalPager();
	private readonly list: SelectList;
	private actions: SelectList | undefined;
	private readonly editor: Editor;

	constructor(
		private readonly plans: Plan[],
		private readonly planDir: string,
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly kb: KeybindingsManager,
		private readonly done: (result: PlanModalResult | undefined) => void,
	) {
		const items: SelectItem[] = [
			{
				value: "new",
				label: "+ New plan",
				description: "Put the plan guide in the prompt bar",
			},
			...plans.map((p, i) => ({ value: String(i), label: p.title, description: p.description })),
		];
		this.list = new SelectList(items, LIST_ROWS, selectListTheme(theme));
		this.list.onSelect = (item) => {
			const plan = plans[Number(item.value)];
			if (item.value === "new") done({ kind: "new" });
			else if (plan) this.openPlan(plan);
		};
		this.list.onCancel = () => done(undefined);
		this.editor = new Editor(tui, {
			borderColor: (s) => theme.fg("accent", s),
			selectList: selectListTheme(theme),
		});
		// Enter inserts a newline (handled in handleInput); ctrl+s saves.
		this.editor.disableSubmit = true;
	}

	private selectedPlan(): Plan | undefined {
		return this.plans[Number(this.list.getSelectedItem()?.value)];
	}

	private edit(plan: Plan): void {
		this.plan = plan;
		this.editor.setText(planToText(plan));
		this.go("edit");
	}

	private go(view: View): void {
		this.view = view;
		this.pager.reset();
		this.editor.focused = view === "edit";
	}

	private actionList(
		items: string[],
		onSelect: (value: string) => void,
		onCancel: () => void,
	): SelectList {
		const list = new SelectList(
			items.map((v) => ({ value: v, label: v })),
			items.length,
			selectListTheme(this.theme),
		);
		list.onSelect = (item) => onSelect(item.value);
		list.onCancel = onCancel;
		return list;
	}

	private openPlan(plan: Plan): void {
		this.plan = plan;
		this.actions = this.actionList(
			["Execute", "Edit", "Delete", "Back"],
			(v) => {
				if (v === "Execute") this.done({ kind: "execute", plan });
				else if (v === "Edit") this.edit(plan);
				else if (v === "Delete") this.confirmDelete(plan);
				else this.go("list");
			},
			() => this.go("list"),
		);
		this.go("plan");
	}

	private confirmDelete(plan: Plan): void {
		this.plan = plan;
		this.actions = this.actionList(
			["Delete", "Cancel"],
			(v) => (v === "Delete" ? this.done({ kind: "delete", plan }) : this.openPlan(plan)),
			() => this.openPlan(plan),
		);
		this.go("confirm");
	}

	handleInput(data: string): void {
		if (this.view === "list") this.handleListInput(data);
		else if (this.view === "edit") this.handleEditInput(data);
		else if (!this.pager.handleInput(data, this.kb, true)) this.actions?.handleInput(data);
		this.tui.requestRender();
	}

	private handleListInput(data: string): void {
		const plan = this.selectedPlan();
		if (plan && matchesKey(data, "d")) this.confirmDelete(plan);
		else if (plan && matchesKey(data, "e")) this.edit(plan);
		else this.list.handleInput(data);
	}

	private handleEditInput(data: string): void {
		const plan = this.plan as Plan;
		if (matchesKey(data, Key.escape)) this.openPlan(plan);
		else if (matchesKey(data, Key.ctrl("s"))) {
			this.done({ kind: "save", plan, text: this.editor.getExpandedText() });
		}
		// Editor treats a bare "\n" as newline; map Enter to it so Enter edits text.
		else if (matchesKey(data, Key.enter)) this.editor.handleInput("\n");
		else this.editor.handleInput(data);
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
			header = [title("Plans"), hint(`${this.plans.length} saved · ${this.planDir}`)];
			body = this.list.render(inner);
			footer = [rule, hint("↑↓ choose • enter open • e edit • d delete • esc close")];
		} else if (this.view === "edit") {
			const plan = this.plan as Plan;
			header = [title(`Edit ${plan.file}`), hint(`${this.planDir}/${plan.file}`)];
			body = this.editor.render(inner);
			footer = [rule, hint("ctrl+s save • esc cancel")];
		} else {
			const plan = this.plan as Plan;
			const confirm = this.view === "confirm";
			header = [
				confirm ? t.fg("warning", t.bold(`Delete ${plan.file}?`)) : title(plan.title),
				...(plan.description ? [t.fg("dim", plan.description)] : []),
				hint(`${this.planDir}/${plan.file}`),
			];
			body = plan.body.split("\n");
			footer = [
				rule,
				...(this.actions?.render(inner) ?? []),
				hint("↑↓ choose • ←→/PgUp/PgDn scroll • enter select • esc back"),
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
