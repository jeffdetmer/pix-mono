/**
 * ProcManager — owns spawned long-lived processes for one Pi session.
 *
 * Spawn shape (settled by design review):
 *   detached: true       → child leads its own process group (pgid === pid),
 *                          so we kill the whole tree via process.kill(-pgid).
 *   stdio: [ignore,fd,fd]→ the child writes straight to its log file; the parent
 *                          holds no pipe, so a full stdout buffer never blocks
 *                          the child and Pi can exit while the child lives.
 *   child.unref()        → the log fd + child do not keep the parent event loop
 *                          alive.
 *
 * Cap: at MAX_LOG_BYTES / MAX_LOG_LINES we STOP recording (rewrite the process's
 * stdio to /dev/null) instead of truncating — the file stays intact and complete
 * up to the cap. No disk ring buffer.
 *
 * Crash reaper: each running process writes a pidfile {pgid, startTicks}. On the
 * next session_start we find pidfiles whose pgid is still alive AND whose start
 * ticks match (PID-reuse guard), then ask the user before killing.
 */

import { type ChildProcess, spawn } from "node:child_process";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateLfid } from "@xynogen/pix-runtime/lfid";
import { type LogView, logSince, MAX_LOG_LINES, type ProcMeta, tailLines } from "./format.ts";

export const PROC_DIR = join(homedir(), ".cache", "pi", "proc");
export const MAX_LOG_BYTES = 50 * 1024 * 1024; // 50 MiB

/** Best-effort cleanup: a failed fd close / file unlink / signal is not fatal here. */
function silent(fn: () => void): void {
	try {
		fn();
	} catch {
		// intentional: cleanup and signal calls race process exit; failure is expected and harmless
	}
}

interface LiveProc {
	meta: ProcMeta;
	child?: ChildProcess;
	logPath: string;
	fd?: number;
	cursor: number; // model's byte cursor into the log
}

/** Read /proc/<pid>/stat field 22 (start time in clock ticks). Linux only. */
function readStartTicks(pid: number): string | undefined {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		// field 2 (comm) may contain spaces/parens; split after the last ')'.
		const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
		return rest[19]; // field 22 overall = index 19 after the comm split
	} catch {
		return undefined;
	}
}

/** Is a process group still alive? signal 0 tests existence without killing. */
function pgidAlive(pgid: number): boolean {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch {
		return false;
	}
}

export interface Orphan {
	handle: string;
	pgid: number;
	command: string;
}

export class ProcManager {
	private readonly procs = new Map<string, LiveProc>();

	constructor() {
		mkdirSync(PROC_DIR, { recursive: true });
	}

	/** Unique handle across the cache dir — a crashed session's handle is never reissued. */
	private freshHandle(): string {
		for (let i = 0; i < 64; i++) {
			const h = generateLfid({ prefix: "proc" });
			if (!this.procs.has(h) && !existsSync(join(PROC_DIR, `${h}.log`))) return h;
		}
		throw new Error("runner: handle namespace exhausted");
	}

	private pidPath(handle: string): string {
		return join(PROC_DIR, `${handle}.pid`);
	}
	private logPathFor(handle: string): string {
		return join(PROC_DIR, `${handle}.log`);
	}

	list(): ProcMeta[] {
		return [...this.procs.values()].map((p) => p.meta);
	}

	get(handle: string): LiveProc | undefined {
		return this.procs.get(handle);
	}

	/** Spawn a detached process; the child writes stdout+stderr to its log file. */
	start(command: string, cwd: string, name?: string): ProcMeta {
		const handle = this.freshHandle();
		const logPath = this.logPathFor(handle);
		const fd = openSync(logPath, "w");
		const child = spawn(command, {
			cwd,
			shell: true,
			detached: true,
			stdio: ["ignore", fd, fd],
		});
		child.unref();
		const pid = child.pid ?? -1;
		const meta: ProcMeta = {
			handle,
			command,
			cwd,
			name,
			pid,
			pgid: pid, // detached leader → pgid === pid
			startTime: Date.now(),
			startTicks: readStartTicks(pid),
			status: "running",
			capped: false,
		};
		const live: LiveProc = { meta, child, logPath, fd, cursor: 0 };
		this.procs.set(handle, live);
		writeFileSync(
			this.pidPath(handle),
			JSON.stringify({ pgid: meta.pgid, startTicks: meta.startTicks, command }),
		);
		child.on("exit", (code, signal) => {
			meta.status = signal ? "killed" : "exited";
			meta.exitCode = code ?? undefined;
			this.closeFd(live);
			silent(() => rmSync(this.pidPath(handle), { force: true }));
		});
		return meta;
	}

	private closeFd(live: LiveProc): void {
		if (live.fd !== undefined) {
			silent(() => closeSync(live.fd as number));
			live.fd = undefined;
		}
	}

	/** Enforce the cap: at the limit, redirect the child to /dev/null and mark capped. */
	checkCap(handle: string): void {
		const live = this.procs.get(handle);
		if (!live || live.meta.capped || live.meta.status !== "running") return;
		let bytes = 0;
		try {
			bytes = statSync(live.logPath).size;
		} catch {
			return;
		}
		if (bytes < MAX_LOG_BYTES) return;
		// Stop recording without touching the intact file: close our fd so the
		// child's inherited fd keeps its own offset, then mark capped. The file is
		// never rewritten. The child keeps running.
		live.meta.capped = true;
		this.closeFd(live);
	}

	/** Cursor read — new complete lines since the model's last call. */
	async logsSince(
		handle: string,
	): Promise<(LogView & { logPath: string; capped: boolean }) | undefined> {
		const live = this.procs.get(handle);
		if (!live) return undefined;
		const text = await this.readLog(live.logPath);
		const view = logSince(text, live.cursor);
		live.cursor = view.offset;
		return { ...view, logPath: live.logPath, capped: live.meta.capped };
	}

	/** Forced tail read — last n lines, does NOT move the model cursor. */
	async logsTail(
		handle: string,
		n: number,
	): Promise<{ lines: string[]; logPath: string; capped: boolean } | undefined> {
		const live = this.procs.get(handle);
		if (!live) return undefined;
		const text = await this.readLog(live.logPath);
		const lines = text.split("\n");
		if (lines.at(-1) === "") lines.pop(); // drop trailing empty from final newline
		return { lines: tailLines(lines, n), logPath: live.logPath, capped: live.meta.capped };
	}

	/** Freshest complete line, for the widget/list. Does not move any cursor. */
	async lastLine(handle: string): Promise<string | undefined> {
		const live = this.procs.get(handle);
		if (!live) return undefined;
		const text = await this.readLog(live.logPath);
		const lines = text.split("\n").filter((l) => l.length);
		return lines.at(-1);
	}

	private async readLog(path: string): Promise<string> {
		try {
			return await readFile(path, "utf8");
		} catch {
			return "";
		}
	}

	/** SIGTERM the whole group, then SIGKILL after grace. */
	async stop(handle: string, graceMs = 2000): Promise<{ ok: boolean; note: string }> {
		const live = this.procs.get(handle);
		if (!live) return { ok: false, note: `unknown handle ${handle}` };
		if (live.meta.status !== "running") {
			return {
				ok: true,
				note: `already ${live.meta.status === "killed" ? "killed" : `exited(${live.meta.exitCode ?? "?"})`}`,
			};
		}
		silent(() => process.kill(-live.meta.pgid, "SIGTERM"));
		await new Promise((r) => setTimeout(r, graceMs));
		if (live.meta.status === "running") {
			silent(() => process.kill(-live.meta.pgid, "SIGKILL"));
		}
		return { ok: true, note: `${handle} stopped` };
	}

	/** Remove a stopped process + its files. Refuses while running. */
	rm(handle: string): { ok: boolean; note: string } {
		const live = this.procs.get(handle);
		if (!live) return { ok: false, note: `unknown handle ${handle}` };
		if (live.meta.status === "running")
			return { ok: false, note: `${handle} still running — stop it first` };
		this.closeFd(live);
		silent(() => rmSync(live.logPath, { force: true }));
		silent(() => rmSync(this.pidPath(handle), { force: true }));
		this.procs.delete(handle);
		return { ok: true, note: `${handle} removed` };
	}

	/** Find orphaned process groups from a dead session (pgid alive + start ticks match). */
	async findOrphans(): Promise<Orphan[]> {
		let files: string[];
		try {
			files = await readdir(PROC_DIR);
		} catch {
			return [];
		}
		const orphans: Orphan[] = [];
		for (const f of files) {
			if (!f.endsWith(".pid")) continue;
			const handle = f.slice(0, -4);
			if (this.procs.has(handle)) continue; // ours, this session
			try {
				const raw = JSON.parse(await readFile(join(PROC_DIR, f), "utf8")) as {
					pgid: number;
					startTicks?: string;
					command: string;
				};
				if (!pgidAlive(raw.pgid)) {
					rmSync(join(PROC_DIR, f), { force: true }); // stale pidfile, group gone
					continue;
				}
				// PID-reuse guard: the leader's current start ticks must match.
				const nowTicks = readStartTicks(raw.pgid);
				if (raw.startTicks && nowTicks && raw.startTicks !== nowTicks) {
					rmSync(join(PROC_DIR, f), { force: true }); // pgid recycled — not ours
					continue;
				}
				orphans.push({ handle, pgid: raw.pgid, command: raw.command });
			} catch {
				// unreadable/corrupt pidfile — skip it, do not fail the whole scan
			}
		}
		return orphans;
	}

	/** Kill a specific orphan group (used after the user approves the reap prompt). */
	killOrphan(o: Orphan): void {
		silent(() => process.kill(-o.pgid, "SIGKILL"));
		silent(() => rmSync(this.pidPath(o.handle), { force: true }));
	}

	/** SIGTERM every child this session owns and clear fds. Call on session_shutdown. */
	async shutdown(): Promise<void> {
		for (const [handle] of this.procs) {
			await this.stop(handle, 500);
		}
		for (const live of this.procs.values()) this.closeFd(live);
	}
}

export { MAX_LOG_LINES };
