import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "@xynogen/pix-runtime/paths";
import { loadFetchConfig, saveFetchConfig } from "./config.ts";

describe("fetch config", () => {
	test("uses standalone defaults when no file exists", () => {
		expect(loadFetchConfig(join(tempDir(), "missing-pix-web.json"))).toEqual({
			provider: "auto",
			nineRouterModel: "exa",
		});
	});

	test("persists provider and 9Router model", () => {
		const directory = mkdtempSync(join(tempDir(), "pix-web-"));
		const path = join(directory, "fetch.json");
		try {
			saveFetchConfig({ provider: "9router", nineRouterModel: "custom-fetch" }, path);
			expect(loadFetchConfig(path)).toEqual({
				provider: "9router",
				nineRouterModel: "custom-fetch",
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
