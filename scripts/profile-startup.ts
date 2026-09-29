/**
 * Startup profile: load each Pix extension through Pi's own loader (jiti,
 * moduleCache:false, same aliases) and time import + factory per package.
 *
 *   PI_PKG=<pi-coding-agent dir> node --experimental-strip-types scripts/profile-startup.ts
 *
 * Run it with Node, not Bun: Pi runs extensions under Node + jiti.
 * Each package loads in a fresh child process, so no warm module cache hides cost.
 * ponytail: import + factory time only. session_start handlers and TUI paint are not
 * timed. Use `PI_TIMING=1 pi` or `node --cpu-prof` for those.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const piPkg = process.env.PI_PKG;
if (!piPkg) throw new Error("Set PI_PKG to the pi-coding-agent package directory");
const loader = pathToFileURL(join(piPkg, "dist/core/extensions/loader.js")).href;
const runs = Number(process.env.RUNS ?? 3);

if (process.argv[2] === "--one") {
	const { loadExtensions } = await import(loader);
	// Real Pi loads the host (and pi-tui) before any extension. Warm them so each
	// package pays only for its own code, like it does inside a Pi process.
	await import(pathToFileURL(join(piPkg, "dist/index.js")).href);
	const t0 = performance.now();
	const { errors } = await loadExtensions([process.argv[3]], root);
	const ms = performance.now() - t0;
	const heap = process.memoryUsage().heapUsed / 1048576;
	console.log(JSON.stringify({ ms, heap, error: errors[0]?.error ?? null }));
	process.exit(0);
}

const targets = readdirSync(join(root, "packages")).flatMap((dir) => {
	const manifest = JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8"));
	const entry = manifest.pi?.extensions?.[0];
	return typeof entry === "string" ? [{ name: dir, path: join(root, "packages", dir, entry) }] : [];
});

const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const rows = targets.map(({ name, path }) => {
	const samples = Array.from(
		{ length: runs },
		() =>
			JSON.parse(
				execFileSync(process.execPath, [...process.execArgv, import.meta.filename, "--one", path], {
					env: process.env,
					encoding: "utf8",
				})
					.trim()
					.split("\n")
					.at(-1) ?? "{}",
			) as { ms: number; heap: number; error: string | null },
	);
	return {
		name,
		ms: median(samples.map((s) => s.ms)),
		heap: median(samples.map((s) => s.heap)),
		error: samples[0]?.error,
	};
});

rows.sort((a, b) => b.ms - a.ms);
console.log(`package            load ms   heap MB  (median of ${runs}, fresh process each)`);
for (const r of rows) {
	console.log(
		`${r.name.padEnd(18)} ${r.ms.toFixed(0).padStart(7)}  ${r.heap.toFixed(1).padStart(8)}${r.error ? `  ERROR ${r.error.split("\n")[0]}` : ""}`,
	);
}
