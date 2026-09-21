/** Text-to-speech through the 9Router `/v1/audio/speech` endpoint. */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { humanSize } from "@xynogen/pix-pretty/utils";
import { ioTimeoutSignal } from "@xynogen/pix-runtime/io";
import { Type } from "typebox";
import { routerBaseUrl } from "./data.js";
import { routerDefaults } from "./defaults.js";
import { auth } from "./http.js";
import { makeRenderCall, makeRenderResult } from "./render.js";
import { resolveOutputPath, validateOutputPath } from "./transcribe.js";

const DEFAULT_FORMAT = "mp3";

type SpeechFormat = "mp3" | "wav" | "opus" | "aac" | "flac";

interface TtsDetails {
	_type: "ttsResult";
	outcome: "running" | "success" | "cancelled" | "error";
	model: string;
	format: SpeechFormat;
	output_path: string;
	bytes?: number;
}

export function buildSpeechRequest(
	input: string,
	model: string,
	format: SpeechFormat,
	signal?: AbortSignal,
): { url: string; init: RequestInit } {
	const key = auth();
	return {
		url: `${routerBaseUrl()}/audio/speech?response_format=${format}`,
		init: {
			method: "POST",
			headers: {
				...(key ? { Authorization: `Bearer ${key}` } : {}),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ model, input }),
			signal: ioTimeoutSignal(signal),
		},
	};
}

export async function saveSpeech(outputFile: string, audio: Uint8Array): Promise<string> {
	const path = resolveOutputPath(outputFile);
	const validation = await validateOutputPath(path);
	if (!validation.ok) throw new Error(`output_file rejected: ${validation.reason}`);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, audio);
	return path;
}

export function playerCommand(path: string, available: ReadonlySet<string>): string[] | undefined {
	if (available.has("pw-play")) return ["pw-play", path];
	if (available.has("paplay")) return ["paplay", path];
	if (available.has("ffplay"))
		return ["ffplay", "-nodisp", "-autoexit", "-loglevel", "error", path];
	if (available.has("mpv")) return ["mpv", "--no-video", "--really-quiet", path];
	return undefined;
}

async function runPlayer(command: string[]): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const child = spawn(command[0] ?? "", command.slice(1), { stdio: "ignore" });
		child.once("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") resolve(false);
			else reject(error);
		});
		child.once("exit", (code) => {
			if (code === 0) resolve(true);
			else reject(new Error(`audio player exited with code ${code ?? "unknown"}`));
		});
	});
}

async function playSpeech(path: string): Promise<void> {
	for (const name of ["pw-play", "paplay", "ffplay", "mpv"]) {
		const command = playerCommand(path, new Set([name]));
		if (command && (await runPlayer(command))) return;
	}
	throw new Error("no supported audio player found (pw-play, paplay, ffplay, or mpv)");
}

export default function registerTts(pi: ExtensionAPI): void {
	const renderResult = makeRenderResult<TtsDetails>({
		tool: "tts",
		target: (details) => basename(details.output_path),
		meta: (details) => `${humanSize(details.bytes ?? 0)} · ${details.model}`,
		status: (details) => (details.outcome === "error" ? "error" : "success"),
	});

	pi.registerTool({
		name: "tts",
		label: "Text to speech",
		renderShell: "self",
		description:
			"Convert text to speech through 9Router and save the audio file. Uses NINEROUTER_URL/NINEROUTER_KEY, with legacy ROUTER_API_BASE/ROUTER_API_KEY aliases.",
		promptSnippet:
			"tts(input, model?, output_file?, response_format?, play?) — Generate speech with saved /9router defaults.",
		promptGuidelines: [
			"tts: Use a model or voice ID from the 9Router TTS catalog. The tool saves and plays audio by default; set play=false for file-only output. Sensitive paths and symlinks are rejected.",
		],
		renderCall: makeRenderCall("tts", (args) => String(args.model ?? "")),
		renderResult,
		parameters: Type.Object({
			input: Type.String({ description: "Text to speak" }),
			model: Type.Optional(
				Type.String({ description: "9Router TTS model or voice ID. Defaults to /9router." }),
			),
			output_file: Type.Optional(
				Type.String({
					description: "Audio output path. Defaults to an OS temporary file.",
				}),
			),
			response_format: Type.Optional(
				Type.Union(
					[
						Type.Literal("mp3"),
						Type.Literal("wav"),
						Type.Literal("opus"),
						Type.Literal("aac"),
						Type.Literal("flac"),
					],
					{ description: "Audio format (default: mp3)", default: DEFAULT_FORMAT },
				),
			),
			play: Type.Optional(
				Type.Boolean({ description: "Play the saved audio before returning (default: true)" }),
			),
		}),

		async execute(_id, params, signal, onUpdate) {
			const format = params.response_format ?? DEFAULT_FORMAT;
			const model = params.model?.trim() || routerDefaults.ttsModel;
			const outputFile =
				params.output_file?.trim() || join(tmpdir(), `pix-tts-${randomUUID()}.${format}`);
			const outputPath = resolveOutputPath(outputFile);
			const details: TtsDetails = {
				_type: "ttsResult",
				outcome: "running",
				model,
				format,
				output_path: outputPath,
			};
			onUpdate?.({
				content: [{ type: "text", text: `Generating speech with ${model}...` }],
				details,
			});

			try {
				const request = buildSpeechRequest(params.input, model, format, signal);
				const response = await fetch(request.url, request.init);
				if (!response.ok) {
					const message = await response.text().catch(() => "");
					throw new Error(`API ${response.status}: ${message.slice(0, 500)}`);
				}
				const audio = new Uint8Array(await response.arrayBuffer());
				const saved = await saveSpeech(outputFile, audio);
				const play = params.play ?? routerDefaults.ttsPlay;
				if (play) {
					onUpdate?.({
						content: [
							{
								type: "text",
								text: `${icon("audio.play")} ${basename(saved)} · ${humanSize(audio.byteLength)}`,
							},
						],
						details,
					});
					await playSpeech(saved);
				}
				return {
					content: [
						{
							type: "text",
							text: play
								? `${icon("audio.stop")} ${basename(saved)} · ${humanSize(audio.byteLength)}`
								: `${icon("audio.file")} ${saved} · ${humanSize(audio.byteLength)}`,
						},
					],
					details: {
						...details,
						outcome: "success" as const,
						output_path: saved,
						bytes: audio.byteLength,
					},
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `TTS failed: ${message}` }],
					details: {
						...details,
						outcome: signal?.aborted ? ("cancelled" as const) : ("error" as const),
					},
					isError: true,
				};
			}
		},
	});
}
