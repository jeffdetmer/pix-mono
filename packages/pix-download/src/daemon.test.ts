/**
 * Live daemon test — spawns a real aria2c and downloads a real file over loopback
 * through an HTTP server we host. Skips automatically when aria2c is not installed
 * so CI stays green on machines without it (the daemon path is exercised locally
 * and on any runner that has aria2).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findExecutableSync } from "@xynogen/pix-runtime/which";
import { aria2 } from "maria2";
import { type DaemonHandle, startDaemon } from "./daemon.ts";

const hasAria2 = Boolean(findExecutableSync("aria2c"));
const PAYLOAD = Buffer.from("pix-download e2e payload ".repeat(1000)); // ~25 KiB

let fileServer: Server;
let fileUrl: string;
let dir: string;

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), "dl-e2e-"));
	fileServer = createServer((_req, res) => {
		res.writeHead(200, {
			"content-type": "application/octet-stream",
			"content-length": PAYLOAD.length,
		});
		res.end(PAYLOAD);
	});
	await new Promise<void>((r) => fileServer.listen(0, "127.0.0.1", r));
	const addr = fileServer.address();
	const port = addr && typeof addr === "object" ? addr.port : 0;
	fileUrl = `http://127.0.0.1:${port}/payload.bin`;
});

afterAll(() => {
	fileServer?.close();
	if (dir) rmSync(dir, { recursive: true, force: true });
});

describe.if(hasAria2)("startDaemon (live)", () => {
	let daemon: DaemonHandle;

	afterAll(async () => {
		await daemon?.shutdown();
	});

	test("spawns, connects, and reports a version", async () => {
		daemon = await startDaemon({ dir });
		expect(daemon.port).toBeGreaterThan(0);
		expect(daemon.secret).toHaveLength(32);
		const version = await aria2.getVersion(daemon.conn);
		expect(version.version).toBeTruthy();
	});

	test("downloads a file end to end", async () => {
		const gid = (await aria2.addUri(daemon.conn, [fileUrl])) as string;
		expect(gid).toBeTruthy();
		// Poll until aria2 reports the download complete.
		let done = false;
		for (let i = 0; i < 50 && !done; i++) {
			const s = await aria2.tellStatus(daemon.conn, gid, [
				"status",
				"completedLength",
				"totalLength",
			]);
			done = s.status === "complete";
			if (!done) await new Promise((r) => setTimeout(r, 100));
		}
		expect(done).toBe(true);
		const written = readFileSync(join(dir, "payload.bin"));
		expect(written.length).toBe(PAYLOAD.length);
	});
});

test.skipIf(hasAria2)("aria2c absent — daemon path skipped", () => {
	expect(hasAria2).toBe(false);
});
