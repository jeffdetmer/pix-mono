import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { ProcManager } from "./manager.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(pred: () => boolean, timeoutMs = 3000): Promise<void> {
	const start = Date.now();
	while (!pred() && Date.now() - start < timeoutMs) await wait(25);
}

describe("ProcManager lifecycle", () => {
	let mgr: ProcManager;
	afterEach(async () => {
		await mgr?.shutdown();
	});

	test("start returns a running proc-* handle and unique handles", () => {
		mgr = new ProcManager();
		const a = mgr.start("sleep 5", process.cwd());
		const b = mgr.start("sleep 5", process.cwd());
		expect(a.handle).toMatch(/^proc-[a-z]+-[a-z]+-\d{2}$/);
		expect(a.status).toBe("running");
		expect(a.handle).not.toBe(b.handle);
		expect(mgr.list()).toHaveLength(2);
	});

	test("captures output and the cursor advances between reads", async () => {
		mgr = new ProcManager();
		const m = mgr.start("printf 'one\\ntwo\\n'; sleep 2", process.cwd());
		await until(() => false, 400); // let output flush
		const first = await mgr.logsSince(m.handle);
		expect(first?.lines).toEqual(["one", "two"]);
		const second = await mgr.logsSince(m.handle);
		expect(second?.lines).toEqual([]); // cursor consumed the lines
	});

	test("logsTail returns the last n and never moves the model cursor", async () => {
		mgr = new ProcManager();
		const m = mgr.start("printf 'a\\nb\\nc\\n'; sleep 2", process.cwd());
		await until(() => false, 400);
		const tail = await mgr.logsTail(m.handle, 2);
		expect(tail?.lines).toEqual(["b", "c"]);
		const since = await mgr.logsSince(m.handle);
		expect(since?.lines).toEqual(["a", "b", "c"]); // tail did not consume the cursor
	});

	test("exit is recorded with code", async () => {
		mgr = new ProcManager();
		const m = mgr.start("exit 3", process.cwd());
		await until(() => m.status !== "running");
		expect(m.status).toBe("exited");
		expect(m.exitCode).toBe(3);
	});

	test("stop kills the whole process group (child + grandchild)", async () => {
		mgr = new ProcManager();
		// parent sh forks a child sleep; killing only the sh pid would orphan it.
		const m = mgr.start("sleep 30 & sleep 30", process.cwd());
		await until(() => false, 200);
		const pgid = m.pgid;
		const r = await mgr.stop(m.handle, 300);
		expect(r.ok).toBe(true);
		await until(() => m.status !== "running");
		// the whole group must be gone — signal 0 to the group throws ESRCH
		let alive = true;
		try {
			process.kill(-pgid, 0);
		} catch {
			alive = false;
		}
		expect(alive).toBe(false);
	});

	test("rm refuses while running, removes once stopped", async () => {
		mgr = new ProcManager();
		const m = mgr.start("sleep 30", process.cwd());
		await until(() => false, 150);
		expect(mgr.rm(m.handle)).toEqual({
			ok: false,
			note: `${m.handle} still running — stop it first`,
		});
		await mgr.stop(m.handle, 300);
		await until(() => m.status !== "running");
		const logPath = mgr.get(m.handle)?.logPath;
		const r = mgr.rm(m.handle);
		expect(r.ok).toBe(true);
		expect(mgr.list()).toHaveLength(0);
		if (logPath) expect(existsSync(logPath)).toBe(false);
	});

	test("stop on an already-exited process is a no-op success", async () => {
		mgr = new ProcManager();
		const m = mgr.start("exit 0", process.cwd());
		await until(() => m.status !== "running");
		const r = await mgr.stop(m.handle, 100);
		expect(r.ok).toBe(true);
		expect(r.note).toContain("exited(0)");
	});

	test("unknown handle fails cleanly", async () => {
		mgr = new ProcManager();
		expect(await mgr.logsSince("proc-nope-nope-00")).toBeUndefined();
		expect((await mgr.stop("proc-nope-nope-00")).ok).toBe(false);
		expect(mgr.rm("proc-nope-nope-00").ok).toBe(false);
	});
});
