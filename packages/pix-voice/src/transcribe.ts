/**
 * transcribe.ts — speech-to-text tool. The provider comes from /voice or the
 * `provider` argument; the result names the provider and model that ran.
 */

import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { voiceConfig, voiceModel } from "./config.js";
import { resolveProvider } from "./providers.js";
import { makeRenderCall, makeRenderResult } from "./render.js";

const CHAT_TRUNCATE_LIMIT = 50_000; // only when no output_file is provided

type TranscribeOutcome = "running" | "success" | "cancelled" | "error";

export interface TranscribeResultDetails {
	_type: "transcribeResult";
	outcome: TranscribeOutcome;
	file: string;
	model: string;
	language?: string;
	provider: string;
	chars?: number;
	truncated?: boolean;
	output_path?: string;
	write_error?: string;
}

interface TranscribeResult {
	content: { type: "text"; text: string }[];
	details: TranscribeResultDetails;
	isError?: boolean;
}

/** Resolve a possibly-relative `output_file` to an absolute path. */
export function resolveOutputPath(outputFile: string): string {
	return isAbsolute(outputFile) ? outputFile : resolve(process.cwd(), outputFile);
}

/**
 * Pre-flight safety check for `output_file`. Rejects paths that target sensitive
 * system locations, null bytes, non-existent or non-writable parents, symlinks
 * (at the target or anywhere in the parent chain), and existing-directory targets.
 *
 * Returns a discriminated result so the caller can surface a precise reason to
 * the model without leaking OS internals.
 */
export type PathValidation = { ok: true; path: string } | { ok: false; reason: string };

/** Block-list of absolute prefixes that should never receive transcription output. */
function sensitivePrefixes(): string[] {
	const home = homedir();
	return [
		"/etc",
		"/proc",
		"/sys",
		"/boot",
		`${home}/.ssh`,
		`${home}/.aws`,
		`${home}/.gnupg`,
		`${home}/.config/gh`,
	];
}

export async function validateOutputPath(absPath: string): Promise<PathValidation> {
	// 1. Null byte injection guard (defence in depth — Node already rejects, fail fast with clear msg)
	if (absPath.includes("\0")) {
		return { ok: false, reason: "path contains a null byte" };
	}

	// 2. Sensitive prefix block-list
	for (const prefix of sensitivePrefixes()) {
		if (absPath === prefix || absPath.startsWith(`${prefix}/`)) {
			return { ok: false, reason: `refusing to write under ${prefix}` };
		}
	}

	// 3. Target must not be a symlink and must not be an existing directory.
	//    (lstat does NOT follow symlinks — that's the whole point of using it here.)
	try {
		const st = await lstat(absPath);
		if (st.isSymbolicLink()) {
			return { ok: false, reason: `target is a symlink: ${absPath}` };
		}
		if (st.isDirectory()) {
			return {
				ok: false,
				reason: `target is an existing directory: ${absPath}`,
			};
		}
	} catch (err) {
		// ENOENT is fine — we'll create the file. Anything else is a hard fail.
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			return {
				ok: false,
				reason: `cannot stat target: ${(err as Error).message}`,
			};
		}
	}

	// 4. Walk up the parent chain. For every ancestor that EXISTS, it must
	//    (a) not be a symlink (stops /tmp/safe-looking-dir → /etc redirect), and
	//    (b) be writable so mkdir -p can create missing intermediates.
	//    Ancestors that don't exist (ENOENT) are fine — mkdir -p will create them.
	const parent = dirname(absPath);
	let cursor = parent;
	let nearestExisting: string | null = null;
	while (cursor !== dirname(cursor)) {
		let st: Awaited<ReturnType<typeof lstat>>;
		try {
			st = await lstat(cursor);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				// intermediate doesn't exist yet — keep walking up
				cursor = dirname(cursor);
				continue;
			}
			return {
				ok: false,
				reason: `cannot stat parent: ${(err as Error).message}`,
			};
		}
		if (st.isSymbolicLink()) {
			return { ok: false, reason: `parent is a symlink: ${cursor}` };
		}
		if (st.isDirectory() && nearestExisting === null) {
			nearestExisting = cursor;
		}
		cursor = dirname(cursor);
	}

	if (nearestExisting === null) {
		return {
			ok: false,
			reason: `no existing ancestor directory for ${parent}`,
		};
	}
	try {
		await access(nearestExisting, fsConstants.W_OK);
	} catch {
		return {
			ok: false,
			reason: `no writable ancestor directory: ${nearestExisting}`,
		};
	}

	return { ok: true, path: absPath };
}

/** Write transcription text to disk, creating parent directories as needed.
 *  Performs pre-flight safety checks; throws on rejection. */
export async function writeTranscriptionFile(outputFile: string, text: string): Promise<string> {
	const abs = resolveOutputPath(outputFile);
	const validation = await validateOutputPath(abs);
	if (!validation.ok) {
		throw new Error(`output_file rejected: ${validation.reason}`);
	}
	await mkdir(dirname(abs), { recursive: true });
	await writeFile(abs, text, "utf-8");
	return abs;
}

/**
 * Build the tool return value from a successful transcription.
 * - If `outputFile` is set: write the full text verbatim and return a short summary.
 * - Otherwise: return the text inline, truncated to fit chat.
 */
export async function buildTranscriptionResult(
	text: string,
	model: string,
	provider: string,
	outputFile: string | undefined,
	file = "audio",
	language?: string,
): Promise<TranscribeResult> {
	const details: TranscribeResultDetails = {
		_type: "transcribeResult",
		outcome: "success",
		file,
		model,
		...(language ? { language } : {}),
		provider,
		chars: text.length,
		truncated: !outputFile && text.length > CHAT_TRUNCATE_LIMIT,
	};

	if (outputFile) {
		try {
			const abs = await writeTranscriptionFile(outputFile, text);
			details.output_path = abs;
			return {
				content: [
					{
						type: "text",
						text: `Transcribed ${text.length} chars → ${abs}`,
					},
				],
				details,
			};
		} catch (writeErr) {
			const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
			details.outcome = "error";
			details.truncated = text.length > CHAT_TRUNCATE_LIMIT;
			details.write_error = msg;
			return {
				content: [
					{
						type: "text",
						text: `Transcription succeeded but writing to ${outputFile} failed: ${msg}\nThe transcribed text is included below — consider writing it to a different path.`,
					},
					{ type: "text", text: text.slice(0, CHAT_TRUNCATE_LIMIT) },
				],
				details,
				isError: true,
			};
		}
	}

	return {
		content: [{ type: "text", text: text.slice(0, CHAT_TRUNCATE_LIMIT) }],
		details,
	};
}

/** Transcribe with the saved default provider and model. Used by /stt. */
export async function transcribeAudioFile(
	file: string,
	signal?: AbortSignal,
): Promise<{ text: string; provider: string; model: string }> {
	const provider = resolveProvider("stt", voiceConfig.sttProvider);
	const model = voiceModel("stt", provider);
	const text = await provider.transcribe({ file, model, signal });
	return { text, provider: provider.id, model };
}

function compactChars(chars: number | undefined): string {
	const value = chars ?? 0;
	if (value < 1_000) return String(value);
	if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
	return `${(value / 1_000_000).toFixed(1)}M`;
}

export default function registerTranscribe(pi: ExtensionAPI): void {
	const renderTerminal = makeRenderResult<TranscribeResultDetails>({
		tool: "transcribe",
		target: (details) => basename(details.file),
		meta: (details) => {
			if (details.write_error) return "write failed · transcript preserved inline";
			if (details.outcome === "error") return "failed";
			if (details.outcome === "cancelled") return "cancelled";
			const chars = `${compactChars(details.chars)} chars`;
			return details.output_path
				? `${chars} · wrote ${basename(details.output_path)}`
				: `${chars} · ${details.provider}/${details.model}`;
		},
		status: (details) =>
			details.outcome === "error"
				? "error"
				: details.outcome === "cancelled"
					? "warning"
					: "success",
	});

	pi.registerTool({
		name: "transcribe",
		label: "Transcribe",
		renderShell: "self",
		description: "Transcribe an audio file to text through the configured voice provider.",
		promptSnippet: "transcribe(file, output_file?, language?)",
		renderCall: makeRenderCall("transcribe", (args) => basename(String(args.file ?? ""))),
		renderResult: (result, options, theme, context) =>
			renderTerminal(result, options, theme, {
				...context,
				// Structured transcription failures have safe metadata for a compact
				// terminal row; expansion still restores the exact returned blocks.
				isError: context.isError && options.expanded,
			}),
		parameters: Type.Object({
			file: Type.String({ description: "Audio file path" }),
			output_file: Type.Optional(
				Type.String({
					description:
						"Write the full text here and return only a summary (default: inline, max 50000 chars)",
				}),
			),
			language: Type.Optional(Type.String({ description: "ISO 639-1 code, e.g. en" })),
		}),

		async execute(_toolCallId, params, signal, onUpdate) {
			const filePath = params.file;
			const base = {
				_type: "transcribeResult" as const,
				file: filePath,
				provider: voiceConfig.sttProvider,
				model: "",
				...(params.language ? { language: params.language } : {}),
			};
			try {
				const provider = resolveProvider("stt", voiceConfig.sttProvider);
				const model = voiceModel("stt", provider);
				Object.assign(base, { provider: provider.id, model });
				onUpdate?.({
					content: [
						{ type: "text", text: `Transcribing ${filePath} with ${provider.id}/${model}...` },
					],
					details: { ...base, outcome: "running" },
				});
				const text = await provider.transcribe({
					file: filePath,
					model,
					language: params.language,
					signal,
				});
				return await buildTranscriptionResult(
					text,
					model,
					provider.id,
					params.output_file,
					filePath,
					params.language,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text",
							text: `Transcription failed (${base.provider}/${base.model}): ${message}`,
						},
					],
					details: { ...base, outcome: signal?.aborted ? "cancelled" : "error" },
					isError: true,
				};
			}
		},
	});
}
