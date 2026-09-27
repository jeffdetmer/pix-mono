/**
 * persist.ts — /optimizer tool states live in pix.json `optimizer` (owned by
 * pix-runtime). Replaces the old `optimizer.json` sidecar, which pix-runtime
 * imports and archives on init; writing it again made two sources of truth
 * that overwrote each other.
 */

import { config, updateConfig } from "@xynogen/pix-runtime/config";
import { type OptimizerConfig, optimizerSection } from "@xynogen/pix-runtime/sections";
import type { OptimizerTool } from "./status.ts";

/** Read a tool's value from pix.json (section defaults when unset). */
export function loadOptValue(tool: OptimizerTool): string {
	return config(optimizerSection)[tool];
}

/**
 * Persist a tool's value into pix.json. Invalid values are rejected by the
 * section parser and snap to the default. Rejects on write failure so the UI
 * caller can render it.
 */
export async function saveOptValue(tool: OptimizerTool, value: string): Promise<void> {
	await updateConfig(optimizerSection, { [tool]: value } as Partial<OptimizerConfig>, {
		origin: "command",
		source: "pix-optimizer",
	});
}
