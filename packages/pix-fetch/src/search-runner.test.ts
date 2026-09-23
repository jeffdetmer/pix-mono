import { describe, expect, test } from "bun:test";
import { registerSearchProvider } from "./search-providers.ts";
import { runSearch } from "./search-runner.ts";

const request = { query: "Pi", searchType: "web" as const, maxResults: 5 };

describe("search runner", () => {
	test("uses the configured keyed provider before SearXNG", async () => {
		const calls: string[] = [];
		registerSearchProvider({
			id: "searxng",
			isConfigured: () => true,
			search: async () => {
				calls.push("searxng");
				return [];
			},
		});
		registerSearchProvider({
			id: "test-keyed-search",
			isConfigured: () => true,
			search: async () => {
				calls.push("test-keyed-search");
				return [];
			},
		});

		const result = await runSearch(request);

		expect({ provider: result.provider, calls }).toEqual({
			provider: "test-keyed-search",
			calls: ["test-keyed-search"],
		});
	});

	test("uses an explicit ordered fallback", async () => {
		registerSearchProvider({
			id: "test-search-fail",
			search: async () => {
				throw new Error("unavailable");
			},
		});
		registerSearchProvider({ id: "test-search-ok", search: async () => [] });

		const result = await runSearch(request, ["test-search-fail", "test-search-ok"]);

		expect({ provider: result.provider, errors: result.errors }).toEqual({
			provider: "test-search-ok",
			errors: [{ provider: "test-search-fail", message: "unavailable" }],
		});
	});
});
