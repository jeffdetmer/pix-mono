import { fetchConfig } from "./config.js";
import type { FetchProvider, FetchRequest, FetchResponse } from "./providers.js";
import { registerFetchProvider } from "./providers.js";
import { fetchPublic } from "./public-url.js";
import { htmlToText } from "./text.js";

async function jsonRequest(
	url: string,
	apiKey: string,
	auth: "bearer" | "x-api-key",
	body: unknown,
	signal?: AbortSignal,
): Promise<unknown> {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(auth === "bearer" ? { Authorization: `Bearer ${apiKey}` } : { "x-api-key": apiKey }),
		},
		body: JSON.stringify(body),
		signal,
	});
	if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 500)}`);
	return response.json();
}

function plainText(content: string): string {
	return /<[a-z][\s\S]*>/i.test(content) ? htmlToText(content) : content.trim();
}

const exa: FetchProvider = {
	id: "exa",
	isConfigured: () => Boolean(process.env.EXA_API_KEY),
	async fetch(request: FetchRequest): Promise<FetchResponse> {
		const data = (await jsonRequest(
			"https://api.exa.ai/contents",
			process.env.EXA_API_KEY ?? "",
			"x-api-key",
			{ ...request.options, ids: [request.url], text: true },
			request.signal,
		)) as { results?: Array<{ title?: string; url?: string; text?: string }> };
		const page = data.results?.[0];
		return {
			title: page?.title,
			url: page?.url || request.url,
			content: plainText(page?.text || ""),
		};
	},
};

const tavily: FetchProvider = {
	id: "tavily",
	isConfigured: () => Boolean(process.env.TAVILY_API_KEY),
	async fetch(request: FetchRequest): Promise<FetchResponse> {
		const data = (await jsonRequest(
			"https://api.tavily.com/extract",
			process.env.TAVILY_API_KEY ?? "",
			"bearer",
			{
				...request.options,
				urls: [request.url],
				extract_depth: "basic",
				format: request.format,
			},
			request.signal,
		)) as { results?: Array<{ url?: string; raw_content?: string }> };
		const page = data.results?.[0];
		return {
			url: page?.url || request.url,
			content: plainText(page?.raw_content || ""),
		};
	},
};

const youcom: FetchProvider = {
	id: "youcom",
	isConfigured: () => Boolean(process.env.YDC_API_KEY),
	async fetch(request: FetchRequest): Promise<FetchResponse> {
		// Retrieval and extraction happen server-side at You.com; markdown is
		// requested first and html kept as a fallback for pages that fail
		// markdown conversion. The response is one entry per requested URL.
		const entries = (await jsonRequest(
			"https://ydc-index.io/v1/contents",
			process.env.YDC_API_KEY ?? "",
			"x-api-key",
			{
				urls: [request.url],
				formats: ["markdown", "html"],
			},
			request.signal,
		)) as Array<{ url?: string; title?: string; html?: string | null; markdown?: string | null }>;
		const page = entries[0];
		const content = page?.markdown || page?.html || "";
		return {
			title: page?.title,
			url: page?.url || request.url,
			content: plainText(content),
		};
	},
};

function routerBaseUrl(): string {
	const configured = process.env.NINEROUTER_URL || process.env.ROUTER_API_BASE;
	const base = (configured || "https://9router.com").replace(/\/$/, "");
	return base.endsWith("/v1") ? base : `${base}/v1`;
}

function nineRouter(): FetchProvider {
	return {
		id: "9router",
		isConfigured: () => Boolean(process.env.NINEROUTER_URL || process.env.ROUTER_API_BASE),
		async fetch(request: FetchRequest): Promise<FetchResponse> {
			const key = process.env.NINEROUTER_KEY || process.env.ROUTER_API_KEY;
			const model =
				typeof request.options?.model === "string"
					? request.options.model
					: fetchConfig.nineRouterModel;
			const response = await fetch(`${routerBaseUrl()}/web/fetch`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(key ? { Authorization: `Bearer ${key}` } : {}),
				},
				body: JSON.stringify({
					model,
					url: request.url,
					format: request.format,
					max_characters: request.maxCharacters,
					provider_options: request.options,
				}),
				signal: request.signal,
			});
			if (!response.ok)
				throw new Error(`${response.status}: ${(await response.text()).slice(0, 500)}`);
			const data = (await response.json()) as {
				title?: string;
				url?: string;
				content?: string | { text?: string };
			};
			const content = typeof data.content === "string" ? data.content : data.content?.text || "";
			return {
				title: data.title,
				url: data.url || request.url,
				content: plainText(content),
			};
		},
	};
}

const curl: FetchProvider = {
	id: "curl",
	async fetch(request: FetchRequest): Promise<FetchResponse> {
		const response = await fetchPublic(request.url, {
			headers: { Accept: "text/html, text/plain;q=0.9, */*;q=0.1" },
			redirect: "follow",
			signal: request.signal,
		});
		if (!response.ok)
			throw new Error(`${response.status}: ${(await response.text()).slice(0, 500)}`);
		const html = await response.text();
		const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
		return {
			title: title ? htmlToText(title) : undefined,
			url: response.url || request.url,
			content: htmlToText(html),
		};
	},
};

export function registerBuiltinProviders(): void {
	registerFetchProvider(exa);
	registerFetchProvider(tavily);
	registerFetchProvider(youcom);
	registerFetchProvider(nineRouter());
	registerFetchProvider(curl);
}
