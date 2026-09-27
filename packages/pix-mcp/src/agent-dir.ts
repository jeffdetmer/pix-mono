import { join } from "node:path";
import { agentDir } from "@xynogen/pix-runtime/paths";

/** Pi agent dir (PI_CODING_AGENT_DIR, else ~/.pi/agent) — shared pix-runtime helper. */
export const getAgentDir = agentDir;

export function getAgentPath(...segments: string[]): string {
	return join(agentDir(), ...segments);
}
