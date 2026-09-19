import { afterEach, describe, expect, test } from "bun:test";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import registerGate from "./index.ts";

afterEach(() => {
	delete (globalThis as { __pixAgentState?: WeakMap<object, unknown> }).__pixAgentState;
});

describe("gate agent state", () => {
	test("reports blocked while waiting for command approval", async () => {
		const events = createEventBus();
		const states: string[] = [];
		events.on("pix:agent-state", (event) => states.push((event as { state: string }).state));
		const handlers: Array<(event: any, ctx: any) => Promise<unknown>> = [];
		const pi = {
			events,
			on(event: string, handler: (event: any, ctx: any) => Promise<unknown>) {
				if (event === "tool_call") handlers.push(handler);
			},
		};
		registerGate(pi as never);

		const ctx = {
			hasUI: true,
			ui: {
				custom: async () => ({ action: "denied" }),
				notify() {},
				theme: { fg: (_color: string, text: string) => text },
			},
		};
		for (const handler of handlers) {
			await handler({ toolName: "bash", input: { command: "git push --force" } }, ctx);
		}

		expect(states).toContain("blocked");
		expect(states.at(-1)).toBe("idle");
	});

	test("steers a denied ~/.ssh/config read toward the ssh info tool", async () => {
		const events = createEventBus();
		const handlers: Array<(event: any, ctx: any) => Promise<unknown>> = [];
		const pi = {
			events,
			getAllTools: () => [{ name: "ssh_run" }],
			on(event: string, handler: (event: any, ctx: any) => Promise<unknown>) {
				if (event === "tool_call") handlers.push(handler);
			},
		};
		registerGate(pi as never);

		const ctx = {
			hasUI: true,
			ui: {
				custom: async () => ({ action: "denied" }),
				notify() {},
				theme: { fg: (_color: string, text: string) => text },
			},
		};
		let result: { block?: boolean; reason?: string } | undefined;
		for (const handler of handlers) {
			const r = (await handler(
				{ toolName: "bash", input: { command: "grep -i p1-server ~/.ssh/config" } },
				ctx,
			)) as { block?: boolean; reason?: string } | undefined;
			if (r?.block) result = r;
		}

		expect(result?.block).toBe(true);
		expect(result?.reason).toContain("ssh_run");
		expect(result?.reason).toContain('action:"info"');
	});

	test("omits the ssh steer when ssh_run is not installed", async () => {
		const events = createEventBus();
		const handlers: Array<(event: any, ctx: any) => Promise<unknown>> = [];
		const pi = {
			events,
			getAllTools: () => [],
			on(event: string, handler: (event: any, ctx: any) => Promise<unknown>) {
				if (event === "tool_call") handlers.push(handler);
			},
		};
		registerGate(pi as never);

		const ctx = {
			hasUI: true,
			ui: {
				custom: async () => ({ action: "denied" }),
				notify() {},
				theme: { fg: (_color: string, text: string) => text },
			},
		};
		let result: { block?: boolean; reason?: string } | undefined;
		for (const handler of handlers) {
			const r = (await handler(
				{ toolName: "bash", input: { command: "grep -i p1-server ~/.ssh/config" } },
				ctx,
			)) as { block?: boolean; reason?: string } | undefined;
			if (r?.block) result = r;
		}

		expect(result?.block).toBe(true);
		expect(result?.reason).not.toContain("ssh_run");
	});
});
