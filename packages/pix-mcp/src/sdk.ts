// The MCP client SDK costs about 90 ms to load under jiti. Only a server connect,
// an auth flow or an elicitation needs it, so load it on first use, not at start.
// Type-only imports stay static elsewhere (erased at runtime).
import type { UrlElicitationRequiredError } from "@modelcontextprotocol/client";

let sdk: Promise<typeof import("@modelcontextprotocol/client")> | undefined;
let stdio: Promise<typeof import("@modelcontextprotocol/client/stdio")> | undefined;
let ajv: Promise<typeof import("@modelcontextprotocol/client/validators/ajv")> | undefined;

export const loadSdk = () => {
	sdk ??= import("@modelcontextprotocol/client");
	return sdk;
};
export const loadStdio = () => {
	stdio ??= import("@modelcontextprotocol/client/stdio");
	return stdio;
};
export const loadAjv = () => {
	ajv ??= import("@modelcontextprotocol/client/validators/ajv");
	return ajv;
};

/**
 * Brand check for `UrlElicitationRequiredError` without the SDK class. The SDK's own
 * `instanceof` reads the same brand set (`Symbol.for("mcp.sdk.errorBrands")`), so this
 * matches whenever `instanceof` does, even across bundle copies.
 */
export function isUrlElicitationRequired(error: unknown): error is UrlElicitationRequiredError {
	const brands = (error as { [k: symbol]: unknown } | null)?.[Symbol.for("mcp.sdk.errorBrands")] as
		| Set<string>
		| undefined;
	return brands?.has?.("mcp.UrlElicitationRequiredError") === true;
}
