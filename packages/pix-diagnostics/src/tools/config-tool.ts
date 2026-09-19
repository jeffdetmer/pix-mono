/**
 * config-tool.ts — the `effective_config` tool.
 *
 * Explain the resolved diagnostics setup for this workspace: the shared config
 * file path, and each known LSP server with whether its binary is on PATH. It
 * makes the "why is this language not checked?" question answerable without
 * guessing. Read-only.
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { frameToolResult } from "@xynogen/pix-pretty/utils";
import { findExecutable } from "@xynogen/pix-runtime/which";
import { Type } from "typebox";
import { LSP_SERVERS } from "../lsp/server-registry.ts";

export interface ConfigToolDeps {
	cwd: string;
}

export function registerConfigTool(pi: ExtensionAPI, deps: ConfigToolDeps): void {
	const { cwd } = deps;

	pi.registerTool({
		name: "effective_config",
		label: "Effective config",
		description:
			"Explain the resolved diagnostics setup: the shared config path and each known LSP " +
			"server with whether its binary is on PATH. Use it to see why a language is or is not " +
			"checked. Read-only.",
		promptSnippet: "effective_config() — resolved LSP servers and config path.",
		parameters: Type.Object({}),

		renderCall(_args, theme) {
			const t = theme as Theme;
			return new Text(t.fg("toolTitle", t.bold("effective_config")), 0, 0);
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

		async execute() {
			const configPath = `${process.env.HOME ?? "~"}/.pi/agent/pix.json`;
			const rows: string[] = [`cwd: ${cwd}`, `config: ${configPath}`, "", "LSP servers:"];

			let available = 0;
			for (const spec of LSP_SERVERS) {
				let found: string | undefined;
				for (const cmd of spec.commands) {
					found = await findExecutable(cmd);
					if (found) break;
				}
				if (found) available++;
				const mark = found ? "found" : "missing";
				const langs = spec.extensions.slice(0, 4).join(" ");
				rows.push(`  ${spec.id}  [${mark}]  ${langs}`);
			}
			rows.push("", `${available}/${LSP_SERVERS.length} server binaries found on PATH.`);

			return {
				content: [{ type: "text" as const, text: rows.join("\n") }],
				details: {
					_type: "pixConfig",
					outcome: "success",
					servers: LSP_SERVERS.length,
					available,
				},
			};
		},
	});
}
