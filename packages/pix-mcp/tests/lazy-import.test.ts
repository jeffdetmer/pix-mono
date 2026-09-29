import { expect, mock, test } from "bun:test";
import { ProtocolError, UrlElicitationRequiredError } from "@modelcontextprotocol/client";
import { isUrlElicitationRequired } from "../src/sdk.ts";

test("the brand check matches the SDK's own instanceof", () => {
	expect(isUrlElicitationRequired(new UrlElicitationRequiredError([]))).toBe(true);
	expect(isUrlElicitationRequired(new ProtocolError(1, "x"))).toBe(false);
	expect(isUrlElicitationRequired(new Error("x"))).toBe(false);
	expect(isUrlElicitationRequired(null)).toBe(false);
});

test("loading pix-mcp does not import the MCP client", async () => {
	// The MCP client SDK (plus its stdio transport and ajv validator) costs about 90 ms
	// to load. Only a server connect needs it, so loading the extension must not.
	// An empty stub is enough: a static named import would fail with a SyntaxError.
	const loaded: string[] = [];
	for (const id of [
		"@modelcontextprotocol/client",
		"@modelcontextprotocol/client/stdio",
		"@modelcontextprotocol/client/validators/ajv",
	]) {
		mock.module(id, () => {
			loaded.push(id);
			return {};
		});
	}
	loaded.length = 0; // Bun runs the factory at once for a module this file already imported
	await import("../src/index.ts");
	expect(loaded).toEqual([]);
});
