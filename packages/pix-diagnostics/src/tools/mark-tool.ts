/**
 * mark-tool.ts — the `lens_diagnostic_mark` tool.
 *
 * Record a disposition for a diagnostic: false-positive, suppress, defer, or
 * flagged. It also lists and clears dispositions. This is visible, auditable
 * session memory — no file is changed and no analysis is hidden.
 */

import { relative, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { frameToolResult } from "@xynogen/pix-pretty/utils";
import { Type } from "typebox";
import type { Disposition, DispositionStore } from "../dispositions.ts";

export interface MarkToolDeps {
	store: DispositionStore;
	cwd: string;
}

export function registerMarkTool(pi: ExtensionAPI, deps: MarkToolDeps): void {
	const { store, cwd } = deps;

	pi.registerTool({
		name: "lens_diagnostic_mark",
		label: "Mark diagnostic",
		description:
			"Record a disposition for a diagnostic: false-positive, suppress, defer, or flagged. " +
			"action=set marks (needs path, code, disposition); action=list shows all; action=clear " +
			"removes one (path + code) or all. Session memory only — changes no file.",
		promptSnippet:
			"lens_diagnostic_mark(action, path?, code?, disposition?, note?) — mark/list/clear a finding.",
		parameters: Type.Object({
			action: StringEnum(["set", "list", "clear"] as const, { description: "What to do." }),
			path: Type.Optional(Type.String({ description: "File of the diagnostic." })),
			code: Type.Optional(Type.String({ description: "Diagnostic code or identity." })),
			disposition: Type.Optional(
				StringEnum(["false-positive", "suppress", "defer", "flagged"] as const, {
					description: "Disposition for action=set.",
				}),
			),
			note: Type.Optional(Type.String({ description: "Optional note." })),
		}),

		renderCall(args, theme) {
			const t = theme as Theme;
			const a = args as { action?: string; disposition?: string; path?: string };
			const title = t.fg("toolTitle", t.bold("lens_diagnostic_mark"));
			const act = t.fg("muted", a.action ?? "");
			const extra = a.disposition ? t.fg("dim", ` ${a.disposition}`) : "";
			return new Text(`${title} ${act}${extra}`.trimEnd(), 0, 0);
		},

		renderResult(result, options, theme, context) {
			const t = theme as Theme;
			const text = result.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
			const details = result.details as { outcome?: string } | undefined;
			const isError = context.isError || details?.outcome === "error";
			const glyph = isError ? icon("status.error") : icon("status.done");
			const role = isError ? "error" : "success";
			const body = new Text(`${t.fg(role, glyph)} ${text}`, 0, 0);
			if (options.isPartial || !details) return body;
			return frameToolResult(body, theme, isError);
		},

		async execute(_id, params) {
			const action = params.action as "set" | "list" | "clear";

			if (action === "list") {
				const rows = store.list();
				const lines = rows.map(
					(r) =>
						`${relative(cwd, r.filePath)}  ${r.code}  ${r.disposition}${r.note ? `  — ${r.note}` : ""}`,
				);
				const text = lines.length > 0 ? lines.join("\n") : "No dispositions.";
				return {
					content: [{ type: "text" as const, text }],
					details: { _type: "pixMark", outcome: "success", count: rows.length },
				};
			}

			if (action === "clear") {
				const path = params.path as string | undefined;
				const code = params.code as string | undefined;
				if (path && code) {
					const removed = store.delete(resolve(cwd, path), code);
					return {
						content: [
							{
								type: "text" as const,
								text: removed ? "Cleared 1 disposition." : "Nothing to clear.",
							},
						],
						details: { _type: "pixMark", outcome: "success", cleared: removed ? 1 : 0 },
					};
				}
				const count = store.list().length;
				store.clear();
				return {
					content: [{ type: "text" as const, text: `Cleared ${count} disposition(s).` }],
					details: { _type: "pixMark", outcome: "success", cleared: count },
				};
			}

			// action === "set"
			const path = params.path as string | undefined;
			const code = params.code as string | undefined;
			const disposition = params.disposition as Disposition | undefined;
			if (!path || !code || !disposition) {
				throw new Error("set requires path, code, and disposition");
			}
			const rec = store.set(
				resolve(cwd, path),
				code,
				disposition,
				params.note as string | undefined,
			);
			return {
				content: [
					{
						type: "text" as const,
						text: `Marked ${relative(cwd, rec.filePath)} ${rec.code} as ${rec.disposition}.`,
					},
				],
				details: { _type: "pixMark", outcome: "success", disposition: rec.disposition },
			};
		},
	});
}
