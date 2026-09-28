import { describe, expect, it } from "bun:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager, type TUI, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { PlanModal, type PlanModalResult } from "./plan-modal.ts";

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
		false,
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

	it("hands edit to the model with e", () => {
		const { m, result } = open();
		m.handleInput(DOWN);
		m.handleInput("e");
		expect(result()).toEqual({ kind: "edit", plan });
	});

	it("shows plan mode state and toggles it with t", () => {
		const { m, text, result } = open();
		expect(text()).toMatch(/plan mode off[\s\S]*t toggle mode/);
		m.handleInput("t");
		expect(result()).toEqual({ kind: "toggle" });
	});
});
