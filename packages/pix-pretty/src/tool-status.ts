/**
 * tool-status.ts — one wording + surface for pix-runtime binary downloads.
 *
 * `ensureTool()` (pix-runtime/binaries) reports progress through `onStatus`;
 * runtime cannot import UI. Consumers pass this adapter so every package shows
 * downloads the same way: a footer status while downloading (live activity),
 * then one transient line when installed or failed (AGENTS.md UI surfaces).
 */

import { icon } from "./icon-catalog.ts";
import { showTransientMessage, type TransientErrorUI } from "./transient-error.ts";

/** Structural mirror of pix-runtime's ToolStatus (kept local: pretty depends on runtime, not its types). */
export type ToolStatusEvent =
	| { kind: "downloading"; name: string; version: string; url: string; size?: string }
	| { kind: "installed"; name: string; path: string; version: string; verified: boolean }
	| { kind: "failed"; name: string; error: string; hint: string };

export type ToolStatusUI = TransientErrorUI & {
	setStatus?(key: string, text: string | undefined): void;
};

const STATUS_KEY = "pix-binaries";

/** Human wording for one status event. */
export function formatToolStatus(s: ToolStatusEvent): string {
	if (s.kind === "downloading") {
		const size = s.size ? ` (${s.size})` : "";
		return `downloading ${s.name} ${s.version}${size} from ${s.url}`;
	}
	if (s.kind === "installed") {
		return `installed ${s.name} ${s.version} → ${s.path}${s.verified ? " (sha256 verified)" : ""}`;
	}
	return `${s.name} unavailable: ${s.error}${s.hint ? ` — install: ${s.hint}` : ""}`;
}

/** Build an `onStatus` callback that routes events to the standard surfaces. */
export function reportToolStatus(ui: ToolStatusUI | undefined): (s: ToolStatusEvent) => void {
	return (s) => {
		if (!ui) return;
		if (s.kind === "downloading") {
			ui.setStatus?.(STATUS_KEY, `${icon("status.running")} ${s.name} ${s.version}`);
			showTransientMessage(ui, formatToolStatus(s), "info");
			return;
		}
		ui.setStatus?.(STATUS_KEY, undefined);
		showTransientMessage(ui, formatToolStatus(s), s.kind === "installed" ? "info" : "warning");
	};
}
