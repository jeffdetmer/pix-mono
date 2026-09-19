/**
 * diagnostics.ts — the single Pix diagnostic widget and runtime wiring.
 *
 * `renderWidget` reads a `DiagnosticStore` and renders one compact line:
 *
 *   <LSP icon> LSP  <N error>  <N warning>  <recent files>
 *
 * The render path does no file I/O — it reads only in-memory store state. The
 * default export wires one store, one lazy LSP manager, the two tools, and the
 * session lifecycle. `write`/`edit` results only mark files as touched.
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { DispositionStore } from "./dispositions.ts";
import { createManager, type LspManager } from "./lsp/manager.ts";
import { DiagnosticStore } from "./store.ts";
import { registerConfigTool } from "./tools/config-tool.ts";
import { registerDiagnosticsTool } from "./tools/diagnostics-tool.ts";
import { registerMarkTool } from "./tools/mark-tool.ts";
import { registerNavigationTool } from "./tools/navigation-tool.ts";

type ThemeLike = Pick<Theme, "fg">;

const MAX_RECENT = 3;
const STATUS_KEY = "pi-lens-lsp";

/** Count errors and warnings across every stored snapshot. */
function severityCounts(store: DiagnosticStore): { errors: number; warnings: number } {
	let errors = 0;
	let warnings = 0;
	for (const snap of store.all()) {
		for (const d of snap.diagnostics) {
			if (d.severity === "error") errors++;
			else if (d.severity === "warning") warnings++;
		}
	}
	return { errors, warnings };
}

/** Render the one-line widget, or `[]` when no file has state yet. */
export function renderWidget(store: DiagnosticStore, width: number, theme: ThemeLike): string[] {
	const w = Math.max(1, width || 80);
	const recent = store.recent(MAX_RECENT);
	if (recent.length === 0 && store.all().length === 0) return [];

	const { errors, warnings } = severityCounts(store);
	const parts: string[] = [theme.fg("toolTitle", `${icon("lsp")} LSP`)];
	if (errors > 0) parts.push(theme.fg("error", `${icon("status.error")} ${errors} error`));
	if (warnings > 0) parts.push(theme.fg("warning", `${icon("status.warn")} ${warnings} warning`));

	const files = recent.map((snap) => snap.filePath.split("/").pop() ?? snap.filePath);
	const total = store.all().length;
	const more = total > files.length ? ` +${total - files.length} more` : "";
	const fileList = files.length > 0 ? theme.fg("dim", files.join(", ") + more) : "";
	if (fileList) parts.push(fileList);

	return [truncateToWidth(` ${parts.join("  ")}`, w, "…")];
}

// ─── Extension ────────────────────────────────────────────────────────────────

/** Test seam: inject a manager and cwd. Production uses the real ones. */
export interface DiagnosticsOptions {
	manager?: LspManager;
	cwd?: string;
}

export default function registerDiagnostics(
	pi: ExtensionAPI,
	options: DiagnosticsOptions = {},
): void {
	const cwd = options.cwd ?? process.cwd();
	const store = new DiagnosticStore();
	const dispositions = new DispositionStore();
	const manager = options.manager ?? createManager(cwd);
	let requestRenderFn: (() => void) | null = null;

	registerDiagnosticsTool(pi, { store, manager, cwd });
	registerNavigationTool(pi, { manager, cwd });
	registerMarkTool(pi, { store: dispositions, cwd });
	registerConfigTool(pi, { cwd });

	pi.on("session_start", (_event, ctx) => {
		store.clear();
		dispositions.clear();
		if (!ctx.ui.setWidget) return;
		ctx.ui.setWidget(
			"pix-diagnostics",
			(tui, theme: Theme) => {
				requestRenderFn = () => {
					tui.requestRender();
					updateStatus(ctx, store);
				};
				const unsubscribe = store.subscribe(() => requestRenderFn?.());
				return {
					render: (width: number) => renderWidget(store, width, theme),
					dispose() {
						unsubscribe();
						requestRenderFn = null;
					},
					invalidate() {},
				};
			},
			{ placement: "belowEditor" },
		);
	});

	pi.on("tool_result", async (event, _ctx) => {
		if (event.toolName === "write" || event.toolName === "edit") {
			const filePath = (event.input as { path?: string })?.path;
			if (typeof filePath === "string") {
				store.set({ filePath, diagnostics: [], checkedAt: Date.now(), state: "touched" });
			}
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus?.(STATUS_KEY, undefined);
		store.clear();
		dispositions.clear();
		requestRenderFn = null;
		await manager.shutdown();
	});
}

function updateStatus(
	ctx: { ui: { setStatus?: (k: string, v?: string) => void } },
	store: DiagnosticStore,
): void {
	const active = store.all().filter((s) => s.state !== "touched").length;
	ctx.ui.setStatus?.(STATUS_KEY, active > 0 ? `LSP Active (${active})` : undefined);
}
