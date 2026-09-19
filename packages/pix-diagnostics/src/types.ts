/**
 * types.ts — public diagnostic model for pix-diagnostics.
 *
 * These types are the contract between the LSP engine, the store, the widget,
 * and the two tools. Keep them small and Pi-host-agnostic.
 */

export type DiagnosticSeverity = "error" | "warning" | "information" | "hint";

export interface PixDiagnostic {
	filePath: string;
	severity: DiagnosticSeverity;
	message: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	source?: string;
	code?: string | number;
}

export interface DiagnosticSnapshot {
	filePath: string;
	diagnostics: readonly PixDiagnostic[];
	checkedAt: number;
	state: "touched" | "clean" | "findings" | "unconfirmed" | "unavailable";
	serverId?: string;
	reason?: string;
}
