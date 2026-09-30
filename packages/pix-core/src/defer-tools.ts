/**
 * Keep the prompt lean: only the core tools are declared up front. Every other
 * `direct` tool a bundled member registers becomes `deferred`, and `tool_search`
 * is activated so the model can find and load them on demand.
 *
 * It patches `registerTool` on pix-core's own `pi` object. Pi gives each
 * extension its own API object, so tools of standalone installs and other
 * extensions keep their declared exposure.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const CORE_TOOLS: ReadonlySet<string> = new Set(["read", "bash", "edit", "write"]);
const TOOL_SEARCH = "tool_search";

export default function deferNonCoreTools(pi: ExtensionAPI): void {
	// SAFETY: the pinned Pi types predate `exposure`. The running host reads it.
	type Tool = { name: string; exposure?: string };
	const register = pi.registerTool.bind(pi) as (tool: Tool) => void;
	pi.registerTool = ((tool: Tool) =>
		register(
			CORE_TOOLS.has(tool.name) || (tool.exposure ?? "direct") !== "direct"
				? tool
				: { ...tool, exposure: "deferred" },
		)) as unknown as ExtensionAPI["registerTool"];

	// Pi registers tool_search inactive. Without it, deferred tools are unreachable.
	pi.on("session_start", () => {
		const active = pi.getActiveTools();
		if (active.includes(TOOL_SEARCH)) return;
		if (!pi.getAllTools().some((t) => t.name === TOOL_SEARCH)) return;
		pi.setActiveTools([...active, TOOL_SEARCH]);
	});
}
