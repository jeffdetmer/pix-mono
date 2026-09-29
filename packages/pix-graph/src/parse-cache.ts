import type { ParsedFile } from "./extract.ts";

// Kept apart from extract.ts so the extension can create a cache at start
// without loading typescript (only `import type` from extract, erased at runtime).
export interface GraphParseCache {
	entries: Map<string, { text: string; parsed: ParsedFile }>;
	parsedFiles: number;
	reusedFiles: number;
}

export function createGraphParseCache(): GraphParseCache {
	return { entries: new Map(), parsedFiles: 0, reusedFiles: 0 };
}
