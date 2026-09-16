import { expect, mock, test } from "bun:test";
import { collapseDelayMs } from "@xynogen/pix-runtime/collapse";

let active: unknown[] = [];
let intervalStarts = 0;
let tick: (() => void) | undefined;

mock.module("maria2/dist/index.js", () => ({
	aria2: {
		addUri: async () => "gid-1",
		pause: async () => {},
		remove: async () => {},
		tellActive: async () => active,
		unpause: async () => {},
	},
}));

mock.module("./daemon.ts", () => ({
	Aria2MissingError: class Aria2MissingError extends Error {},
	startDaemon: async () => ({
		conn: {},
		port: 1,
		proc: {},
		secret: "secret",
		shutdown: async () => {},
	}),
}));

test("resume restarts progress polling after paused downloads clear it", async () => {
	const originalSetInterval = globalThis.setInterval;
	const originalClearInterval = globalThis.clearInterval;
	const originalDateNow = Date.now;
	let now = originalDateNow();
	globalThis.setInterval = ((callback: () => void) => {
		intervalStarts++;
		tick = callback;
		return intervalStarts;
	}) as never;
	globalThis.clearInterval = (() => {}) as never;
	Date.now = () => now;

	try {
		const { default: registerDownload } = await import("./index.ts");
		let tool: { execute: (...args: unknown[]) => Promise<unknown> } | undefined;
		registerDownload({
			on() {},
			registerTool(value: { execute: (...args: unknown[]) => Promise<unknown> }) {
				tool = value;
			},
		} as never);
		if (!tool) throw new Error("download tool was not registered");
		const registeredTool = tool;
		let widget: unknown;
		const run = (params: object) =>
			registeredTool.execute("call", params, new AbortController().signal, undefined, {
				cwd: "/tmp",
				ui: {
					setWidget(_key: string, value: unknown) {
						widget = value;
					},
				},
			});

		const added = (await run({ action: "add", url: "https://example.com/file.iso" })) as {
			content: Array<{ type: string; text: string }>;
		};
		const handle = added.content[0]?.text.match(/dl-[\w-]+/)?.[0];
		if (!handle) throw new Error("add did not return a download handle");
		expect(intervalStarts).toBe(1);

		active = [
			{
				gid: "gid-1",
				status: "active",
				totalLength: "100",
				completedLength: "50",
				downloadSpeed: "10",
				files: [{ path: "/tmp/file.iso", uris: [] }],
			},
		];
		tick?.();
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (typeof widget !== "function") throw new Error("progress widget was not registered");
		const component = widget({}, { fg: (_key: string, text: string) => text });
		const rendered = component.render(20) as string[];
		expect(rendered[0]).toBe("─".repeat(20));
		expect(rendered[2]).toMatch(/^ {2}\S+ dl-[\w-]+/);

		active = [
			{
				gid: "gid-1",
				status: "active",
				totalLength: "100",
				completedLength: "100",
				downloadSpeed: "0",
				files: [{ path: "/tmp/file.iso", uris: [] }],
			},
		];
		tick?.();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(widget).toBeDefined();
		now += collapseDelayMs() + 1;
		tick?.();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(widget).toBeUndefined();

		active = [];
		tick?.();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await run({ action: "resume", handle });
		expect(intervalStarts).toBe(2);
	} finally {
		globalThis.setInterval = originalSetInterval;
		globalThis.clearInterval = originalClearInterval;
		Date.now = originalDateNow;
		mock.restore();
	}
});
