import { expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderFileContent } from "./renderers.ts";

test("expanded file rendering wraps long lines without hiding their tail", async () => {
	const tail = "TAIL_MUST_REMAIN_VISIBLE";
	const rendered = await renderFileContent(
		`const value = "${"x".repeat(80)}${tail}";`,
		"sample.ts",
		1,
		1,
		undefined,
		{ width: 32, wrapLongLines: true },
	);
	const lines = rendered.split("\n");
	const plainJoined = rendered.replace(/\u001b\[[0-9;]*m/g, "").replace(/\n\s*\u2502 /g, "");

	// No tail lost: the whole line survives once continuation rows are rejoined.
	expect(plainJoined).toContain(tail);
	// Every rendered row stays within the requested width (wrapped, not overflowing).
	expect(lines.every((line) => visibleWidth(line) <= 32)).toBe(true);
});
