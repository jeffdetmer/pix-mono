import { afterEach, describe, expect, test } from "bun:test";
import { type ProviderPickerOptions, renderProviderRows } from "./provider-picker.ts";

// Tag every color role so assertions check the semantic theme role, not ANSI bytes.
const theme = { fg: (role: string, text: string) => `<${role}>${text}</${role}>` };
const saved = { ...process.env };

afterEach(() => {
	process.env = { ...saved };
});

function options(): ProviderPickerOptions {
	return {
		title: "Voice",
		subtitle: "providers",
		current: "openai",
		envAliases: { NINEROUTER_KEY: "ROUTER_API_KEY" },
		rows: [
			{ id: "auto", configured: true, env: [] },
			{ id: "openai", configured: true, env: ["OPENAI_API_KEY"], model: "whisper-1" },
			{ id: "deepgram", configured: false, env: ["DEEPGRAM_API_KEY"] },
			{ id: "local", configured: true, env: [], noKey: true },
		],
	};
}

describe("provider picker rows", () => {
	test("colors each provider status by its state", () => {
		const { lines } = renderProviderRows(options(), theme, { cursor: 1, expanded: new Set() }, 80);
		expect(lines).toEqual([
			"    <muted>\u25CB</muted> <accent>auto</accent> <muted>choice</muted>",
			expect.stringMatching(
				/^<accent>▶<\/accent> <muted>▸<\/muted> <accent>●<\/accent> <accent>openai<\/accent> <success>connected<\/success><muted> · default<\/muted>$/,
			),
			expect.stringMatching(/<accent>deepgram<\/accent> <warning>1 variable not set<\/warning>$/),
			expect.stringMatching(/<accent>local<\/accent> <success>no API key needed<\/success>$/),
		]);
	});

	test("expanded rows show env state, an export example, and the model", () => {
		delete process.env.DEEPGRAM_API_KEY;
		process.env.OPENAI_API_KEY = "x";
		const { lines } = renderProviderRows(
			options(),
			theme,
			{ cursor: 0, expanded: new Set(["openai", "deepgram"]) },
			80,
		);
		expect(lines.slice(2, 4)).toEqual([
			"      <accent>OPENAI_API_KEY</accent> <success>\u25CF set</success>",
			"      <accent>model</accent>: <muted>whisper-1</muted>",
		]);
		expect(lines.slice(5, 7)).toEqual([
			"      <accent>DEEPGRAM_API_KEY</accent> <muted>\u25CB not set</muted>",
			'        <warning>export DEEPGRAM_API_KEY="your-api-key"</warning>',
		]);
	});

	test("a legacy alias counts as set", () => {
		delete process.env.NINEROUTER_KEY;
		process.env.ROUTER_API_KEY = "x";
		const opts = options();
		opts.rows = [{ id: "9router", configured: true, env: ["NINEROUTER_KEY"] }];
		const { lines } = renderProviderRows(
			opts,
			theme,
			{ cursor: 0, expanded: new Set(["9router"]) },
			80,
		);
		expect(lines[1]).toBe(
			"      <accent>NINEROUTER_KEY / ROUTER_API_KEY</accent> <success>\u25CF set</success>",
		);
	});
});
