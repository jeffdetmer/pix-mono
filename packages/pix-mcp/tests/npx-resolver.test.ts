import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("npx-resolver", () => {
	const originalHome = process.env.HOME;
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
	const originalNpmCache = process.env.NPM_CONFIG_CACHE;
	const home = mkdtempSync(join(tmpdir(), "pi-mcp-npx-home-"));
	const agentDir = mkdtempSync(join(tmpdir(), "pi-mcp-npx-agent-"));
	const npmCache = mkdtempSync(join(tmpdir(), "pi-mcp-npx-cache-"));

	function useTestEnvironment(): void {
		process.env.HOME = home;
		process.env.PI_CODING_AGENT_DIR = agentDir;
		process.env.NPM_CONFIG_CACHE = npmCache;
	}

	afterEach(() => {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		if (originalAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
		}
		if (originalNpmCache === undefined) {
			delete process.env.NPM_CONFIG_CACHE;
		} else {
			if (originalNpmCache === undefined) delete process.env.NPM_CONFIG_CACHE;
			else process.env.NPM_CONFIG_CACHE = originalNpmCache;
		}
	});

	it("writes mcp-npx-cache.json to PI_CODING_AGENT_DIR", async () => {
		useTestEnvironment();
		writeCachedPackage(npmCache, "demo-pkg");

		const { resolveNpxBinary } = await import("../src/npx-resolver.ts");
		const result = await resolveNpxBinary("npx", ["-y", "demo-pkg"]);

		expect(result).not.toBeNull();
		expect(existsSync(join(agentDir, "mcp-npx-cache.json"))).toBe(true);
		expect(existsSync(join(home, ".pi", "agent", "mcp-npx-cache.json"))).toBe(false);
	});

	it("preserves npx separators for wrapper package arguments", async () => {
		useTestEnvironment();
		writeCachedPackage(npmCache, "dotenv-cli");

		const { resolveNpxBinary } = await import("../src/npx-resolver.ts");
		const result = await resolveNpxBinary("npx", [
			"--yes",
			"dotenv-cli",
			"--",
			"npx",
			"--yes",
			"@upstash/context7-mcp",
		]);

		expect(result?.extraArgs).toEqual(["--", "npx", "--yes", "@upstash/context7-mcp"]);
	});

	it("does not add separators to npx invocations that did not include one", async () => {
		useTestEnvironment();
		writeCachedPackage(npmCache, "dotenv-cli");

		const { resolveNpxBinary } = await import("../src/npx-resolver.ts");
		const result = await resolveNpxBinary("npx", [
			"--yes",
			"dotenv-cli",
			"github-mcp-server",
			"stdio",
		]);

		expect(result?.extraArgs).toEqual(["github-mcp-server", "stdio"]);
	});
});

function writeCachedPackage(npmCache: string, packageName: string): void {
	const packageDir = join(npmCache, "_npx", "fixture", "node_modules", packageName);
	mkdirSync(join(packageDir, "bin"), { recursive: true });
	writeFileSync(
		join(packageDir, "package.json"),
		JSON.stringify({ name: packageName, version: "1.0.0", bin: "bin/cli.js" }),
		"utf-8",
	);
	writeFileSync(
		join(packageDir, "bin", "cli.js"),
		"#!/usr/bin/env node\nconsole.log('ok')\n",
		"utf-8",
	);
}
