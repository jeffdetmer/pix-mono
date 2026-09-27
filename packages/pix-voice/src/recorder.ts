/** Recording and level metering with ffmpeg. The per-OS input comes from pix-runtime/audio. */

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { microphoneInput } from "@xynogen/pix-runtime/audio";
import {
	BinaryMissingError,
	ensureTool,
	lookupTool,
	resolveTool,
	type ToolStatus,
} from "@xynogen/pix-runtime/binaries";
import { spawnTool } from "@xynogen/pix-runtime/exec";

/** Mono 16 kHz wav with a per-frame RMS level on stderr. `input` is the `-f … -i …` part. */
export function ffmpegRecordArgs(input: readonly string[], output: string): string[] {
	return [
		"-hide_banner",
		"-loglevel",
		"info",
		...input,
		"-ac",
		"1",
		"-ar",
		"16000",
		"-af",
		"astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
		"-y",
		output,
	];
}

export function parseRmsDb(output: string): number | undefined {
	const matches = [
		...output.matchAll(/(?:RMS level dB:\s*|lavfi\.astats\.Overall\.RMS_level=)(-?\d+(?:\.\d+)?)/g),
	];
	const value = matches.at(-1)?.[1];
	return value === undefined ? undefined : Number(value);
}

/**
 * Make sure ffmpeg exists for recording/metering. Recording starts on a keypress and must
 * not block, so a missing-but-downloadable ffmpeg starts a background
 * download with visible status and this call throws, asking to retry once done.
 */
function requireFfmpeg(purpose: string, onStatus?: (s: ToolStatus) => void): void {
	if (resolveTool("ffmpeg")) return;
	const hit = lookupTool("ffmpeg");
	if (hit.state === "missing" && hit.downloadable) {
		void ensureTool("ffmpeg", { onStatus }).catch(() => undefined);
		throw new Error(
			`${purpose} needs ffmpeg — downloading it now (~120 MB); try again when it finishes.`,
		);
	}
	throw new BinaryMissingError("ffmpeg", hit.state, hit.hint, `${purpose} needs ffmpeg`);
}

/** Stream the input level only. Nothing is written to disk. Call the result to stop. */
export function startMeter(
	device: string,
	onLevel: (db: number) => void,
	onStatus?: (s: ToolStatus) => void,
): () => void {
	requireFfmpeg("The microphone test", onStatus);
	const args = ffmpegRecordArgs(microphoneInput(device), "-");
	args.splice(args.length - 2, 2, "-f", "null", "-");
	const child = spawnTool("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
	child.stderr.on("data", (data) => {
		const level = parseRmsDb(String(data));
		if (level !== undefined) onLevel(level);
	});
	child.once("error", () => undefined);
	return () => {
		if (child.exitCode === null) child.kill("SIGTERM");
	};
}

export interface Recording {
	path: string;
	stop(): Promise<number | undefined>;
}

/** Keep the end of the ffmpeg log for the error message. The level meter writes a line per frame. */
const STDERR_TAIL = 4096;

export function startRecording(
	device: string,
	onLevel: (db: number) => void,
	onExit?: (error: Error) => void,
	onStatus?: (s: ToolStatus) => void,
): Recording {
	requireFfmpeg("Microphone recording", onStatus);
	const path = join(tmpdir(), `pix-stt-${randomUUID()}.wav`);
	const child = spawnTool("ffmpeg", ffmpegRecordArgs(microphoneInput(device), path), {
		stdio: ["pipe", "ignore", "pipe"],
	});
	let stderr = "";
	let lastLevel: number | undefined;
	child.stderr.on("data", (data) => {
		const text = String(data);
		stderr = (stderr + text).slice(-STDERR_TAIL);
		const level = parseRmsDb(text);
		if (level !== undefined) {
			lastLevel = level;
			onLevel(level);
		}
	});
	let stopping = false;
	const exit = new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`)),
		);
	});
	// ffmpeg can die before stop(), for example on a bad device. Report it at once.
	exit.then(
		() => (stopping ? undefined : onExit?.(new Error("ffmpeg stopped before the recording ended"))),
		(error: Error) => (stopping ? undefined : onExit?.(error)),
	);
	// An exited ffmpeg closes stdin. A late write must not crash Pi with EPIPE.
	child.stdin.on("error", () => undefined);
	return {
		path,
		async stop() {
			stopping = true;
			if (child.exitCode === null && child.signalCode === null) {
				child.stdin.write("q");
				child.stdin.end();
			}
			await exit;
			return lastLevel;
		},
	};
}
