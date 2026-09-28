/**
 * pix-core plan mode — `/plan` opens a modal to toggle plan mode and manage
 * saved plans in `<cwd>/.pi/plans/*.md`.
 *
 * While plan mode is on:
 *   - active tools shrink to `read` + `write` + `bash` (previous set restored on exit);
 *   - `write` may only target `.pi/plans/` (tool_call guard, visible block);
 *   - no hidden prompt: "+ New plan" pastes PLAN_GUIDE into the prompt bar as a chip (sent as <paste>).
 *
 * Plan file format: YAML-ish frontmatter (`title`, `description`) + markdown
 * body (the plan itself). Executing a plan sends a normal, visible user
 * message — no hidden automation.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { modalOverlayOptions } from "@xynogen/pix-pretty/modal-frame";
import { PlanModal, type PlanModalResult } from "./plan-modal.ts";

// ponytail: bash is not sandboxed here; PLAN_GUIDE asks for read-only use and pix-gate
// still guards destructive commands. Add an allowlist guard if the model abuses it.
const PLAN_TOOLS = ["read", "write", "bash"];
const PLAN_DIR = join(".pi", "plans");
const STATE_ENTRY = "pix-plan-mode";

// Visible guide: /plan → "+ New plan" pastes this into the prompt bar as a chip for the user
// to read, edit, and send. Nothing is injected into the system prompt.
export const PLAN_GUIDE = `[PLAN MODE] Write an implementation plan. Do not change project code.
Explore with \`read\` and read-only \`bash\` (git log/status/diff, ls, rg, --help). Never use bash to edit, install, commit, or delete.
Save ONE plan with \`write\` to \`.pi/plans/YYYY-MM-DD-<feature-name>.md\` (writes elsewhere are blocked).

Format:
---
title: <Feature name>
description: <One sentence: what this builds and why>
---
# <Feature Name> Implementation Plan
**Goal:** <one sentence>
**Architecture:** <2-3 sentences>
**Tech Stack:** <key technologies>
---
### Task N: <Component Name>
**Files:** Create/Modify/Test with exact paths
**Step 1: Write the failing test** — exact test code
**Step 2: Run test to verify it fails** — exact command + expected FAIL output
**Step 3: Write minimal implementation** — exact code
**Step 4: Run test to verify it passes** — exact command + expected PASS
**Step 5: Commit** — \`git commit -m "feat: ..."\`

Rules: exact file paths, complete code, exact commands with expected output, bite-sized steps (2-5 min each), TDD first, DRY, YAGNI. Never git-add the plan.
When done, say: "Plan saved to <path>. Use /plan to run it."
The goal follows this guide.`;

export interface Plan {
	file: string;
	title: string;
	description: string;
	body: string;
}

/** Parse `---\ntitle: …\ndescription: …\n---\nbody`. Missing frontmatter → file name as title. */
export function parsePlan(file: string, text: string): Plan {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
	const meta = m?.[1] ?? "";
	const field = (k: string) => new RegExp(`^${k}:\\s*(.*)$`, "m").exec(meta)?.[1]?.trim() ?? "";
	return {
		file,
		title: field("title") || file.replace(/\.md$/, ""),
		description: field("description"),
		body: m ? (m[2] ?? "") : text,
	};
}

/** True when `path` (relative to cwd or absolute) resolves inside `<cwd>/.pi/plans/`. */
export function isPlanPath(cwd: string, path: string): boolean {
	const rel = relative(resolve(cwd, PLAN_DIR), resolve(cwd, path));
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function listPlans(cwd: string): Plan[] {
	const dir = resolve(cwd, PLAN_DIR);
	let files: string[];
	try {
		files = readdirSync(dir).filter((f) => f.endsWith(".md"));
	} catch {
		return [];
	}
	return files
		.sort()
		.reverse()
		.map((f) => parsePlan(f, readFileSync(join(dir, f), "utf-8")));
}

export default function registerPlanMode(pi: ExtensionAPI): void {
	let enabled = false;
	let toolsBefore: string[] | undefined;

	function apply(ctx: ExtensionContext, on: boolean): void {
		if (on && !enabled) {
			toolsBefore = pi.getActiveTools();
			pi.setActiveTools(PLAN_TOOLS);
			mkdirSync(resolve(ctx.cwd, PLAN_DIR), { recursive: true });
		} else if (!on && enabled) {
			if (toolsBefore) pi.setActiveTools(toolsBefore);
			toolsBefore = undefined;
		}
		enabled = on;
		ctx.ui.setStatus("plan", on ? ctx.ui.theme.fg("warning", "plan") : undefined);
		pi.appendEntry(STATE_ENTRY, { enabled, toolsBefore });
	}

	async function openModal(ctx: ExtensionContext): Promise<void> {
		let requestRender = () => {};
		const result = await ctx.ui.custom<PlanModalResult | undefined>(
			(tui, theme, kb, done) => {
				requestRender = () => tui.requestRender();
				return new PlanModal(listPlans(ctx.cwd), PLAN_DIR, tui, theme, kb, done);
			},
			{ overlay: true, overlayOptions: modalOverlayOptions() },
		);
		if (!result) return;
		if (result.kind === "new") {
			// pix-display turns <prompt name="plan"> into a "plan prompt" chip and sends
			// the tag verbatim, so the model sees the guide and the user sees a chip.
			// pix-display adds the trailing space after the chip.
			ctx.ui.setEditorText("");
			ctx.ui.pasteToEditor(`<prompt name="plan">${PLAN_GUIDE}</prompt>`);
			// pasteToEditor does not repaint; without this the chip waits for the next
			// unrelated render (footer tick, keypress), which felt like a 2 s lag.
			requestRender();
			return;
		}
		const path = join(PLAN_DIR, result.plan.file);
		if (result.kind === "save") {
			writeFileSync(resolve(ctx.cwd, path), result.text);
			ctx.ui.notify(`Saved ${path}`, "info");
			return openModal(ctx);
		}
		if (result.kind === "delete") {
			rmSync(resolve(ctx.cwd, path));
			ctx.ui.notify(`Deleted ${path}`, "info");
			return openModal(ctx);
		}
		apply(ctx, false);
		pi.sendUserMessage(`Execute the plan in \`${path}\`. Follow its tasks in order.`);
	}

	pi.registerCommand("plan", {
		description: "Toggle plan mode; on enter, pick a saved plan (.pi/plans)",
		handler: async (_args, ctx) => {
			apply(ctx, !enabled);
			ctx.ui.notify(
				enabled
					? "Plan mode on: read + bash + write (.pi/plans only)."
					: "Plan mode off: tools restored.",
			);
			// Esc closes the list and keeps plan mode on, so the user can still prompt freely.
			if (enabled) await openModal(ctx);
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!enabled) return;
		if (!PLAN_TOOLS.includes(event.toolName)) {
			return {
				block: true,
				reason: `Plan mode: only read, bash, and write are allowed. Exit with /plan.`,
			};
		}
		if (isToolCallEventType("write", event) && !isPlanPath(ctx.cwd, event.input.path)) {
			return {
				block: true,
				reason: `Plan mode: write only inside ${PLAN_DIR}/. Got: ${event.input.path}`,
			};
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		const entry = ctx.sessionManager
			.getEntries()
			.filter(
				(e: { type: string; customType?: string }) =>
					e.type === "custom" && e.customType === STATE_ENTRY,
			)
			.pop() as { data?: { enabled?: boolean; toolsBefore?: string[] } } | undefined;
		if (!entry?.data?.enabled) return;
		toolsBefore = entry.data.toolsBefore;
		enabled = true;
		pi.setActiveTools(PLAN_TOOLS);
		ctx.ui.setStatus("plan", ctx.ui.theme.fg("warning", "plan"));
	});
}
