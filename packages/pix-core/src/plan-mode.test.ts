import { describe, expect, it } from "bun:test";
import { isPlanPath, parsePlan } from "./plan-mode.ts";

describe("parsePlan", () => {
	it("reads title, description, and body from frontmatter", () => {
		const p = parsePlan("a.md", "---\ntitle: Auth\ndescription: Add login\n---\n# Plan\nstep");
		expect(p).toEqual({
			file: "a.md",
			title: "Auth",
			description: "Add login",
			body: "# Plan\nstep",
		});
	});

	it("falls back to the file name without frontmatter", () => {
		expect(parsePlan("2025-01-01-x.md", "# body")).toMatchObject({
			title: "2025-01-01-x",
			body: "# body",
		});
	});
});

describe("isPlanPath", () => {
	it("accepts files inside .pi/plans", () => {
		expect(isPlanPath("/p", ".pi/plans/a.md")).toBe(true);
		expect(isPlanPath("/p", "/p/.pi/plans/a.md")).toBe(true);
	});

	it("rejects paths outside .pi/plans", () => {
		expect(isPlanPath("/p", "src/a.ts")).toBe(false);
		expect(isPlanPath("/p", ".pi/plans/../x.md")).toBe(false);
	});
});
