import { routerBaseUrl } from "./data.js";
import { auth } from "./http.js";

interface CatalogItem {
	id?: string;
	kind?: string;
	model?: string;
	name?: string;
}

async function get(path: string): Promise<unknown> {
	const key = auth();
	const response = await fetch(`${routerBaseUrl()}${path}`, {
		headers: key ? { Authorization: `Bearer ${key}` } : undefined,
	});
	if (!response.ok) throw new Error(`9Router catalog ${response.status}`);
	return response.json();
}

function items(value: unknown): CatalogItem[] {
	if (!value || typeof value !== "object") return [];
	const data = (value as { data?: unknown }).data;
	return Array.isArray(data) ? (data as CatalogItem[]) : [];
}

export async function catalogModels(kind: "stt" | "tts"): Promise<string[]> {
	return items(await get(`/models/${kind}`)).flatMap((item) => (item.id ? [item.id] : []));
}

export interface VoiceChoice {
	id: string;
	language: string;
	provider: string;
}

export function groupVoice(id: string): VoiceChoice {
	const [provider = "other", ...rest] = id.split("/");
	const voice = rest.join("/") || provider;
	const locale = voice.match(/(?:^|[^A-Za-z])([a-z]{2,3})[-_]([A-Z]{2})(?:[^A-Za-z]|$)/);
	return { id, language: locale ? `${locale[1]}-${locale[2]}` : "Other", provider };
}

export async function catalogVoices(): Promise<VoiceChoice[]> {
	return (await catalogModels("tts")).map(groupVoice);
}
