/**
 * Pure formatting helpers for download status — kept separate from the tool and
 * daemon so they are unit-testable without spawning aria2 or a TUI.
 */

import type { Aria2DownloadStatus } from "maria2";

/** aria2 status shape we actually read (fields are strings — bytes can exceed 2^53). */
export type DlStatus = Pick<
	Aria2DownloadStatus,
	"gid" | "status" | "totalLength" | "completedLength" | "downloadSpeed"
> & {
	files?: { path?: string; uris?: { uri: string }[] }[];
	errorMessage?: string;
};

/** Human byte size (IEC). Mirrors pix-pretty humanSize but works on bigint-safe strings. */
export function humanBytes(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "0 B";
	const units = ["B", "KiB", "MiB", "GiB", "TiB"];
	let i = 0;
	let v = n;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	const rounded = v >= 100 || i === 0 || Number.isInteger(v) ? Math.round(v) : Number(v.toFixed(1));
	return `${rounded} ${units[i]}`;
}

/** Completion fraction 0..1; 0 when total is unknown/zero. */
export function fraction(s: DlStatus): number {
	const total = Number(s.totalLength);
	const done = Number(s.completedLength);
	if (!total || total <= 0) return 0;
	return Math.min(1, done / total);
}

/** Seconds remaining at current speed, or undefined when unknowable. */
export function etaSeconds(s: DlStatus): number | undefined {
	const total = Number(s.totalLength);
	const done = Number(s.completedLength);
	const speed = Number(s.downloadSpeed);
	if (!total || !speed || speed <= 0 || done >= total) return undefined;
	return Math.ceil((total - done) / speed);
}

function humanEta(secs: number | undefined): string {
	if (secs === undefined) return "";
	if (secs < 60) return `${secs}s`;
	if (secs < 3600) return `${Math.floor(secs / 60)}m${secs % 60}s`;
	return `${Math.floor(secs / 3600)}h${Math.floor((secs % 3600) / 60)}m`;
}

/** Best-effort human name for a download: file basename, else first URI, else gid. */
export function downloadName(s: DlStatus): string {
	const path = s.files?.[0]?.path;
	if (path) {
		const base = path.split("/").pop();
		if (base) return base;
	}
	const uri = s.files?.[0]?.uris?.[0]?.uri;
	if (uri) return uri.split("/").pop() || uri;
	return s.gid;
}

/** One-line progress string, e.g. `dl-id video.mp4 · 42% · 4.2 MiB/5.0 GiB · 1.2 MiB/s · eta 2m3s`. */
export function progressLine(handle: string, s: DlStatus): string {
	const name = downloadName(s);
	const pct = Math.round(fraction(s) * 100);
	const done = humanBytes(Number(s.completedLength));
	const total = Number(s.totalLength) > 0 ? humanBytes(Number(s.totalLength)) : "?";
	const speed = Number(s.downloadSpeed) > 0 ? `${humanBytes(Number(s.downloadSpeed))}/s` : "";
	const eta = humanEta(etaSeconds(s));
	const parts = [`${pct}%`, `${done}/${total}`, speed, eta && `eta ${eta}`].filter(Boolean);
	return `${handle} ${name} · ${parts.join(" · ")}`;
}
