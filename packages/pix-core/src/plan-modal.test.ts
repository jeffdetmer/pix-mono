import { describe, expect, it } from "bun:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager, type TUI, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { PlanModal, type PlanModalResult, planToText } from "./plan-modal.ts";
import { parsePlan } from "./plan-mode.ts";

const theme = {
	fg: (_c: string, t: string) => t,
	bg: (_c: string, t: string) => t,
	bold: (t: string) => t,
} as unknown as Theme;
const tui = { requestRender: () => {}, terminal: { rows: 40 } } as unknown as TUI;
const plan = { file: "a.md", title: "Auth", description: "Add login", body: "### Task 1: x" };
const ENTER = "\r";
const DOWN = "\u001b[B";

function open() {
	let result: PlanModalResult | undefined | null = null;
	const m = new PlanModal(
		[plan],
		".pi/plans",
		tui,
		theme,
		new KeybindingsManager(TUI_KEYBINDINGS),
		(r) => {
			result = r;
		},
	);
	const type = (s: string) => {
		for (const ch of s) m.handleInput(ch);
	};
	return { m, type, result: () => result, text: () => m.render(100).join("\n") };
}

describe("PlanModal", () => {
	it("lists New plan first, then saved plans, inside a rounded frame", () => {
		const { text } = open();
		expect(text()).toMatch(/^╭[\s\S]*\+ New plan[\s\S]*Auth[\s\S]*╰/);
	});

	it("opens a plan and executes it", () => {
		const { m, text, result } = open();
		m.handleInput(DOWN);
		m.handleInput(ENTER);
		expect(text()).toMatch(/Auth[\s\S]*Add login[\s\S]*Task 1[\s\S]*Execute/);
		m.handleInput(ENTER);
		expect(result()).toEqual({ kind: "execute", plan });
	});

	it("returns new on + New plan", () => {
		const { m, result } = open();
		m.handleInput(ENTER);
		expect(result()).toEqual({ kind: "new" });
	});

	it("deletes from the list with d after confirm", () => {
		const { m, text, result } = open();
		m.handleInput(DOWN);
		m.handleInput("d");
		expect(text()).toMatch(/Delete a\.md\?[\s\S]*Cancel/);
		m.handleInput(ENTER);
		expect(result()).toEqual({ kind: "delete", plan });
	});

	it("edits with e, keeps Enter as newline, saves with ctrl+s", () => {
		const { m, type, result } = open();
		m.handleInput(DOWN);
		m.handleInput("e");
		m.handleInput("\u001b[F"); // end: stay on first line is fine; append at end below
		type("!");
		m.handleInput(ENTER);
		m.handleInput("\u0013");
		const saved = result() as unknown as { kind: string; text: string };
		expect(saved.kind).toBe("save");
		expect(saved.text).toMatch(/^---\ntitle: Auth[\s\S]*\n$/);
	});
});

describe("planToText", () => {
	it("round-trips through parsePlan", () => {
		expect(parsePlan("a.md", planToText(plan))).toEqual(plan);
	});
});
