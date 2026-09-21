import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findExecutableSync } from "@xynogen/pix-runtime/which";

export function parsePulseSources(output: string): string[] {
	return output
		.split("\n")
		.map((line) => line.split("\t")[1]?.trim())
		.filter((name): name is string => Boolean(name));
}

export function parseRmsDb(output: string): number | undefined {
	const matches = [
		...output.matchAll(/(?:RMS level dB:\s*|lavfi\.astats\.Overall\.RMS_level=)(-?\d+(?:\.\d+)?)/g),
	];
	const value = matches.at(-1)?.[1];
	return value === undefined ? undefined : Number(value);
}

export function ffmpegRecordArgs(device: string, output: string): string[] {
	return [
		"-hide_banner",
		"-loglevel",
		"info",
		"-f",
		"pulse",
		"-i",
		device,
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

function run(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (data) => (stdout += String(data)));
		child.stderr.on("data", (data) => (stderr += String(data)));
		child.once("error", reject);
		child.once("exit", (code) =>
			code === 0
				? resolve(stdout)
				: reject(new Error(stderr.trim() || `${command} exited ${code}`)),
		);
	});
}

export async function microphoneDevices(): Promise<string[]> {
	const pactl = findExecutableSync("pactl");
	if (!pactl) return ["default"];
	const names = parsePulseSources(await run(pactl, ["list", "short", "sources"]));
	return [...new Set(["default", ...names])];
}

export interface Recording {
	path: string;
	stop(): Promise<number | undefined>;
}

export function startRecording(device: string, onLevel: (db: number) => void): Recording {
	const ffmpeg = findExecutableSync("ffmpeg");
	if (!ffmpeg) throw new Error("Microphone recording needs ffmpeg on PATH.");
	const path = join(tmpdir(), `pix-stt-${randomUUID()}.wav`);
	const child = spawn(ffmpeg, ffmpegRecordArgs(device, path), {
		stdio: ["pipe", "ignore", "pipe"],
	});
	let stderr = "";
	let lastLevel: number | undefined;
	child.stderr.on("data", (data) => {
		const text = String(data);
		stderr += text;
		const level = parseRmsDb(text);
		if (level !== undefined) {
			lastLevel = level;
			onLevel(level);
		}
	});
	const exit = new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`)),
		);
	});
	return {
		path,
		async stop() {
			child.stdin.write("q");
			child.stdin.end();
			await exit;
			return lastLevel;
		},
	};
}
