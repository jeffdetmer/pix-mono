import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFetchConfig, saveFetchConfig } from "./config.ts";

describe("fetch config", () => {
	test("uses standalone defaults when no file exists", () => {
		expect(loadFetchConfig(join(tmpdir(), "missing-pix-fetch.json"))).toEqual({
			provider: "auto",
			nineRouterModel: "exa",
			env: {},
		});
	});

	test("persists provider and 9Router model", () => {
		const directory = mkdtempSync(join(tmpdir(), "pix-fetch-"));
		const path = join(directory, "fetch.json");
		try {
			saveFetchConfig(
				{ provider: "9router", nineRouterModel: "custom-fetch", env: { NINEROUTER_KEY: "x" } },
				path,
			);
			expect(loadFetchConfig(path)).toEqual({
				provider: "9router",
				nineRouterModel: "custom-fetch",
				env: { NINEROUTER_KEY: "x" },
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
