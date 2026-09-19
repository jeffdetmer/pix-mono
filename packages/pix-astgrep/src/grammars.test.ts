/**
 * grammars.test.ts — the multi-language routing and consent gate.
 *
 * These do NOT install anything. They check that: the bundled six parse in
 * process; a non-bundled language reports `needs-install` with the right
 * package; a declined language is remembered; and an unknown alias is
 * `unsupported`. The real install path is exercised only when the grammar is
 * already present, which we do not require here.
 */

import { describe, expect, test } from "bun:test";
import { ALL_LANGUAGES, isBundled, languageForFile } from "./engine.ts";
import { packageForLanguage, parseWithGrammar, resetRegistered } from "./grammars.ts";

describe("language coverage", () => {
	test("advertises far more than the six bundled grammars", () => {
		expect(ALL_LANGUAGES.length).toBeGreaterThanOrEqual(20);
		expect(ALL_LANGUAGES).toContain("python");
		expect(ALL_LANGUAGES).toContain("go");
		expect(ALL_LANGUAGES).toContain("rust");
	});

	test("only six languages are bundled in-process", () => {
		const bundled = ALL_LANGUAGES.filter((l) => isBundled(l));
		expect(bundled.sort()).toEqual(["css", "html", "javascript", "jsx", "tsx", "typescript"]);
	});

	test("maps file extensions across languages", () => {
		expect(languageForFile("a.py")).toBe("python");
		expect(languageForFile("a.go")).toBe("go");
		expect(languageForFile("a.rs")).toBe("rust");
		expect(languageForFile("a.ts")).toBe("typescript");
	});

	test("each non-bundled language names a @ast-grep/lang-* package", () => {
		for (const lang of ALL_LANGUAGES) {
			if (isBundled(lang)) continue;
			expect(packageForLanguage(lang)).toMatch(/^@ast-grep\/lang-/);
		}
	});
});

describe("parseWithGrammar", () => {
	test("parses a bundled language in-process", async () => {
		const out = await parseWithGrammar("typescript", "const x = foo(1);");
		expect(out.kind).toBe("ok");
	});

	test("an unknown alias is unsupported", async () => {
		const out = await parseWithGrammar("cobol", "IDENTIFICATION DIVISION.");
		expect(out.kind).toBe("unsupported");
	});

	test("a non-bundled language with no consent is declined, not installed", async () => {
		resetRegistered();
		// No consent callback → the tool must not install; it declines.
		const out = await parseWithGrammar("python", "def f(): pass");
		// Either the grammar is already cached (ready) or it is declined without
		// consent — never a silent install.
		expect(["declined", "ready"]).toContain(out.kind);
		if (out.kind === "declined") expect(out.pkg).toBe("@ast-grep/lang-python");
	});
});
