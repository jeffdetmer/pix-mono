import { describe, expect, it } from "bun:test";
import {
	capturePi,
	makeRenderCtx,
	makeTheme,
	makeToolContext,
} from "@xynogen/pix-pretty/test-utils";
import type { ToolResultLike } from "@xynogen/pix-pretty/types";
import { applyReadDefaults, DEFAULT_READ_LIMIT, registerReadTool } from "./read";

const noopFactory = () => ({ execute: async () => ({ content: [], details: undefined }) });

// Factory that echoes each requested path as file content, for batch tests.
const echoFactory = (() => ({
	parameters: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
	execute: async (_id: string, params: { path?: string }) => ({
		content: [{ type: "text", text: `content of ${params.path}` }],
		details: undefined,
	}),
})) as unknown as typeof noopFactory;

describe("applyReadDefaults", () => {
	it("applies a conservative default without overriding an explicit limit", () => {
		expect(applyReadDefaults({ path: "large.ts" })).toEqual({
			path: "large.ts",
			limit: DEFAULT_READ_LIMIT,
		});
		expect(applyReadDefaults({ path: "large.ts", limit: 25 })).toEqual({
			path: "large.ts",
			limit: 25,
		});
	});
});

describe("registerReadTool", () => {
	it("registers a tool named 'read'", () => {
		const { pi, names } = capturePi();
		registerReadTool(pi, noopFactory, makeToolContext());
		expect(names).toEqual(["read"]);
	});

	it("recomputes an async file preview when expanded mode changes", () => {
		const { pi, tool } = capturePi();
		registerReadTool(pi, noopFactory, makeToolContext());
		const state: Record<string, unknown> = { timer: 1 };
		const result = {
			content: [{ type: "text", text: "one\ntwo" }],
			details: {
				_type: "readFile",
				filePath: "sample.ts",
				content: "one\ntwo",
				offset: 1,
				lineCount: 2,
			},
		};
		const ctx = makeRenderCtx({ state });

		tool.renderResult?.(result, undefined, makeTheme(), { ...ctx, expanded: false });
		const collapsedKey = state._rk;
		tool.renderResult?.(result, undefined, makeTheme(), { ...ctx, expanded: true });

		expect(collapsedKey).toBeDefined();
		expect(state._rk).not.toBe(collapsedKey);
	});

	it("collapses structured errors and restores the exact diagnostic on expansion", () => {
		const { pi, tool } = capturePi();
		registerReadTool(pi, noopFactory, makeToolContext());
		const theme = makeTheme();
		const diagnostic = "ENOENT: no such file or directory";
		const result = {
			content: [{ type: "text", text: diagnostic }],
			details: {
				_type: "readFile",
				filePath: "missing.ts",
				content: diagnostic,
				offset: 1,
				lineCount: 1,
			},
		};
		const render = (state: Record<string, unknown>, expanded = false) => {
			const component = tool.renderResult?.(
				result,
				{ isPartial: false },
				theme,
				makeRenderCtx({ isError: true, expanded, state }),
			);
			return component?.render(120).join("\n") ?? "";
		};

		expect(render({ timer: 1 })).toContain(diagnostic);
		expect(render({ timer: 1 })).toContain("─");
		expect(render({ collapsed: true })).toContain("✗  read missing.ts · failed");
		expect(render({ collapsed: true }, true)).toContain(diagnostic);
	});

	it("reads multiple paths in one call and caps into a combined batch result", async () => {
		const { pi, tool } = capturePi();
		registerReadTool(pi, echoFactory, makeToolContext());
		const execute = tool.execute as (...args: unknown[]) => Promise<ToolResultLike>;
		const result = await execute("tid", { paths: ["a.ts", "b.ts"] }, undefined, undefined, {});
		const details = result.details as { _type: string; items: unknown[]; index: string };
		expect(details._type).toBe("readBatch");
		expect(details.items).toHaveLength(2);
		const text = result.content?.[0];
		expect(text && "text" in text ? text.text : "").toContain("===== a.ts =====");
		expect(text && "text" in text ? text.text : "").toContain("content of b.ts");
	});

	it("keeps the single-file shape when only one path is given", async () => {
		const { pi, tool } = capturePi();
		registerReadTool(pi, echoFactory, makeToolContext());
		const execute = tool.execute as (...args: unknown[]) => Promise<ToolResultLike>;
		const result = await execute("tid", { path: "solo.ts" }, undefined, undefined, {});
		const details = result.details as { _type: string; filePath: string };
		expect(details._type).toBe("readFile");
		expect(details.filePath).toBe("solo.ts");
	});

	it("frames completed image and fallback results, not partial fallback", () => {
		const { pi, tool } = capturePi();
		registerReadTool(pi, noopFactory, makeToolContext());
		const theme = makeTheme({ tag: false });
		// This test asserts on the exact fg key, so use a key-tagging theme.
		const keyedTheme = {
			fg: (key: string, value: string) => `[${key}]${value}[/]`,
			bold: (value: string) => value,
		} as typeof theme;
		if (!tool.renderResult) throw new Error("renderResult not registered");
		const renderResult = tool.renderResult;
		const render = (result: unknown, isPartial: boolean) =>
			renderResult(result, { isPartial }, keyedTheme, makeRenderCtx({ expanded: true }))
				.render(24)
				.join("\n");
		const image = {
			content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
			details: { _type: "readImage", filePath: "image.png", data: "AAAA", mimeType: "image/png" },
		};
		const fallback = { content: [{ type: "text", text: "read complete" }], details: undefined };

		expect(render(image, false)).toContain("[success]─");
		expect(render(fallback, false)).toContain("[success]─");
		expect(render(fallback, true)).not.toContain("[success]─");
	});
});
