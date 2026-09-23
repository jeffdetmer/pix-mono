/** Text-to-speech tool. The provider comes from /voice; the result names the provider and model. */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { humanSize } from "@xynogen/pix-pretty/utils";
import { Type } from "typebox";
import { voiceConfig } from "./config.js";
import { resolveProvider } from "./providers.js";
import { makeRenderCall, makeRenderResult } from "./render.js";
import { resolveOutputPath, validateOutputPath } from "./transcribe.js";

const DEFAULT_FORMAT = "mp3";

interface TtsDetails {
	_type: "ttsResult";
	outcome: "running" | "success" | "cancelled" | "error";
	provider: string;
	model: string;
	format: string;
	output_path: string;
	bytes?: number;
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

export default function registerSpeak(pi: ExtensionAPI): void {
	const renderResult = makeRenderResult<TtsDetails>({
		tool: "speak",
		target: (details) => basename(details.output_path),
		meta: (details) => `${humanSize(details.bytes ?? 0)} · ${details.provider}/${details.model}`,
		status: (details) => (details.outcome === "error" ? "error" : "success"),
	});

	pi.registerTool({
		name: "speak",
		label: "Text to speech",
		renderShell: "self",
		description:
			"Convert text to speech with the provider the user picked in /voice and save the audio file.",
		promptSnippet:
			"speak(input, model?, output_file?, response_format?, play?) — Generate speech with saved /voice defaults.",
		promptGuidelines: [
			'speak: Omit model to use the /voice default. A model is "model/voice" for most providers. The tool saves and plays audio by default; set play=false for file-only output. Some providers return wav or mp3 regardless of response_format; the result reports the real format. Sensitive paths and symlinks are rejected.',
		],
		renderCall: makeRenderCall("speak", (args) => String(args.model ?? "")),
		renderResult,
		parameters: Type.Object({
			input: Type.String({ description: "Text to speak" }),
			model: Type.Optional(
				Type.String({
					description: 'Provider model or "model/voice". Omit to use the /voice default.',
				}),
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
			const requested = params.response_format ?? DEFAULT_FORMAT;
			const details: TtsDetails = {
				_type: "ttsResult",
				outcome: "running",
				provider: voiceConfig.ttsProvider,
				model: params.model ?? "",
				format: requested,
				output_path: "",
			};
			try {
				const provider = resolveProvider("tts", voiceConfig.ttsProvider);
				details.provider = provider.id;
				details.model =
					params.model?.trim() || voiceConfig.ttsModels[provider.id] || provider.defaultModel;
				onUpdate?.({
					content: [
						{ type: "text", text: `Generating speech with ${provider.id}/${details.model}...` },
					],
					details,
				});
				const speech = await provider.synthesize({
					input: params.input,
					model: details.model,
					format: requested,
					signal,
				});
				details.format = speech.format;
				// A provider may return another format than requested. Name the file by the real one.
				const outputFile =
					params.output_file?.trim() || join(tmpdir(), `pix-tts-${randomUUID()}.${speech.format}`);
				details.output_path = resolveOutputPath(outputFile);
				const saved = await saveSpeech(outputFile, speech.audio);
				const size = humanSize(speech.audio.byteLength);
				const mismatch =
					params.output_file && extname(saved).slice(1).toLowerCase() !== speech.format
						? ` · ${provider.id} returned ${speech.format}`
						: "";
				const play = params.play ?? voiceConfig.ttsPlay;
				if (play) {
					onUpdate?.({
						content: [{ type: "text", text: `${icon("audio.play")} ${basename(saved)} · ${size}` }],
						details,
					});
					await playSpeech(saved);
				}
				return {
					content: [
						{
							type: "text",
							text: play
								? `${icon("audio.stop")} ${basename(saved)} · ${size}${mismatch}`
								: `${icon("audio.file")} ${saved} · ${size}${mismatch}`,
						},
					],
					details: {
						...details,
						outcome: "success" as const,
						output_path: saved,
						bytes: speech.audio.byteLength,
					},
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{ type: "text", text: `TTS failed (${details.provider}/${details.model}): ${message}` },
					],
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
