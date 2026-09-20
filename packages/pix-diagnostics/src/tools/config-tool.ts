/**
 * config-tool.ts — the `effective_config` tool.
 *
 * Explain the project-owned LSP setup and whether each selected server exists.
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { frameToolResult } from "@xynogen/pix-pretty/utils";
import { findExecutable } from "@xynogen/pix-runtime/which";
import { Type } from "typebox";
import { loadProjectServers } from "../lsp/server-registry.ts";

export interface ConfigToolDeps {
	cwd: string;
}

export function registerConfigTool(pi: ExtensionAPI, deps: ConfigToolDeps): void {
	const { cwd } = deps;

	pi.registerTool({
		name: "effective_config",
		label: "Effective config",
		description:
			"Show the project LSP configuration and whether each selected server exists on PATH. " +
			"Read-only.",
		promptSnippet: "effective_config() — project-selected LSP servers.",
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
			const configPath = `${cwd}/.pi/lsp.json`;
			const servers = loadProjectServers(cwd);
			const rows: string[] = [`cwd: ${cwd}`, `config: ${configPath}`, "", "LSP servers:"];

			let available = 0;
			for (const spec of servers) {
				const command = spec.commands[0] ?? "";
				const found = await findExecutable(command);
				if (found) available++;
				const mark = found ? "found" : "missing";
				rows.push(`  ${spec.id}  [${mark}]  ${command}  ${spec.extensions.join(" ")}`);
			}
			if (servers.length === 0) rows.push("  none — create .pi/lsp.json for this project");
			rows.push("", `${available}/${servers.length} project server binaries found on PATH.`);

			return {
				content: [{ type: "text" as const, text: rows.join("\n") }],
				details: {
					_type: "pixConfig",
					outcome: "success",
					servers: servers.length,
					available,
				},
			};
		},
	});
}
