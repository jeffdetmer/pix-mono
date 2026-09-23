import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { makeRenderCall, makeRenderResult } from "./render.js";
import { searchConfig } from "./search-config.js";
import type { SearchType } from "./search-providers.js";
import { runSearch } from "./search-runner.js";

type Outcome = "running" | "success" | "cancelled" | "error";
interface Details {
	outcome: Outcome;
	target: string;
	meta: string;
}
interface ToolResult {
	content: { type: "text"; text: string }[];
	details: Details;
	isError?: boolean;
}

function configuredProvider(): string[] | undefined {
	return searchConfig.provider === "auto" ? undefined : [searchConfig.provider];
}

function errorResult(error: unknown, query: string, signal?: AbortSignal): ToolResult {
	const cancelled = signal?.aborted === true;
	return {
		content: [
			{
				type: "text",
				text: cancelled
					? "Search cancelled."
					: error instanceof Error
						? error.message
						: String(error),
			},
		],
		details: {
			outcome: cancelled ? "cancelled" : "error",
			target: query,
			meta: cancelled ? "cancelled" : "failed",
		},
		...(!cancelled ? { isError: true } : {}),
	};
}

export function registerSearchTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "search",
		label: "Search",
		renderShell: "self",
		description: "Search the web through a configured provider.",
		promptSnippet: "search(query, search_type?, max_results?)",
		renderCall: makeRenderCall<unknown>("search", (args) =>
			String((args as { query?: string }).query ?? ""),
		),
		renderResult: makeRenderResult<Details>({
			tool: "search",
			target: (details) => `“${details.target}”`,
			meta: (details) => details.meta,
			status: (details) =>
				details.outcome === "error"
					? "error"
					: details.outcome === "cancelled"
						? "warning"
						: "success",
		}),
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			search_type: Type.Optional(
				StringEnum(["web", "news"] as const, {
					description: "Search type (default web).",
				}),
			),
			max_results: Type.Optional(
				Type.Number({ description: "Max results (default 5, max 10)", default: 5 }),
			),
		}),
		async execute(_id, raw, signal, onUpdate) {
			const params = raw as {
				query: string;
				search_type?: SearchType;
				max_results?: number;
			};
			onUpdate?.({
				content: [{ type: "text", text: `Searching: ${params.query}...` }],
				details: { outcome: "running", target: params.query, meta: "running" },
			});
			try {
				const maxResults = Math.min(Math.max(params.max_results ?? 5, 1), 10);
				const result = await runSearch(
					{
						query: params.query,
						searchType: params.search_type ?? "web",
						maxResults,
						signal,
					},
					configuredProvider(),
				);
				const text = result.data
					.map((item, index) => {
						const meta = item.publishedAt ? `\n   ${item.publishedAt}` : "";
						return `${index + 1}. ${item.title || item.url}\n   ${item.url}${meta}${item.snippet ? `\n   ${item.snippet}` : ""}`;
					})
					.join("\n\n");
				const fallbackMeta = result.errors.length > 0 ? ` · ${result.errors.length} failed` : "";
				return {
					content: [{ type: "text", text: text || "No results." }],
					details: {
						outcome: "success",
						target: params.query,
						meta: `${result.data.length} ${result.data.length === 1 ? "result" : "results"} · ${result.provider}${fallbackMeta}`,
					},
				};
			} catch (error) {
				return errorResult(error, params.query, signal);
			}
		},
	});
}
