import { describe, expect, test } from "bun:test";
import { findServerSpec, rootForFile } from "./server-registry.ts";

// Faithful mock: the marker exists only at the project root, not in src/.
const access = async (path: string) => path === "/repo/package.json";

describe("LSP server registry", () => {
	test("maps TypeScript and TSX to one server", () => {
		expect(findServerSpec("/repo/a.ts")?.id).toBe("typescript");
		expect(findServerSpec("/repo/a.tsx")?.id).toBe("typescript");
	});

	test("maps common languages to their expected servers", () => {
		expect(findServerSpec("/repo/a.py")?.id).toBe("python");
		expect(findServerSpec("/repo/a.rs")?.id).toBe("rust");
		expect(findServerSpec("/repo/a.go")?.id).toBe("go");
		expect(findServerSpec("/repo/a.cpp")?.id).toBe("cpp");
	});

	test("returns no server for an unknown extension", () => {
		expect(findServerSpec("/repo/a.unknown")).toBeUndefined();
	});

	test("uses the nearest root marker", async () => {
		expect(await rootForFile("/repo/src/a.ts", ["package.json"], access)).toBe("/repo");
	});
});
