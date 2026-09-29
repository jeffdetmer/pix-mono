import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "@xynogen/pix-runtime/paths";
import { loadSearchConfig, saveSearchConfig } from "./search-config.ts";

describe("search config", () => {
	test("uses separate defaults when no file exists", () => {
		expect(loadSearchConfig(join(tempDir(), "missing-pix-search.json"))).toEqual({
			provider: "auto",
			nineRouterModel: "exa",
		});
	});

	test("persists the search provider and 9Router model", () => {
		const directory = mkdtempSync(join(tempDir(), "pix-search-"));
		const path = join(directory, "search.json");
		try {
			saveSearchConfig({ provider: "9router", nineRouterModel: "tavily" }, path);
			expect(loadSearchConfig(path)).toEqual({
				provider: "9router",
				nineRouterModel: "tavily",
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
