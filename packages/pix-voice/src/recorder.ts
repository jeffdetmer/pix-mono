import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findExecutableSync } from "@xynogen/pix-runtime/which";

export interface Microphone {
	/** PulseAudio source name, passed to ffmpeg. "default" follows the system default. */
	id: string;
	/** Readable name, e.g. "Headset - Nokia E1200 ANC". */
	label: string;
}

interface PulseSource {
	name?: string;
	description?: string;
	active_port?: string | null;
	ports?: Array<{ name?: string; description?: string }>;
	properties?: Record<string, string | undefined>;
}

const FORM: Record<string, string> = {
	headset: "Headset",
	headphone: "Headset",
	handsfree: "Headset",
	webcam: "Webcam",
	microphone: "Microphone",
};

/** "Built-in Audio Analog Stereo" → "Built-in Audio". The channel layout is noise here. */
function product(description: string): string {
	return description.replace(/\s+(Analog|Digital)?\s*(Mono|Stereo|Surround[\s\d.]*)$/i, "").trim();
}

/** Readable label: "<kind> - <product>", like a desktop sound menu. */
export function microphoneLabel(source: PulseSource): string {
	const props = source.properties ?? {};
	const name = product(source.description || props["device.product.name"] || source.name || "");
	const port = source.ports?.find((item) => item.name === source.active_port)?.description;
	const kind =
		FORM[props["device.form_factor"] ?? ""] ??
		(props["device.bus"] === "bluetooth" ? "Headset" : undefined) ??
		(port && /line/i.test(port) ? "Line In" : "Microphone");
	return name.toLowerCase().startsWith(kind.toLowerCase()) ? name : `${kind} - ${name}`;
}

/** An output monitor records what plays, not a microphone. PulseAudio and PipeWire both name it `*.monitor`. */
function isMonitor(source: PulseSource): boolean {
	return Boolean(
		source.name?.endsWith(".monitor") || source.properties?.["device.class"] === "monitor",
	);
}

/**
 * Input sources, without output monitors. Takes `pactl --format=json list sources`
 * (pactl 16+), or the tab-separated `pactl list short sources` from older PulseAudio.
 */
export function parsePulseSources(output: string, fallback = "default"): Microphone[] {
	let sources: PulseSource[];
	try {
		sources = JSON.parse(output) as PulseSource[];
	} catch {
		// Short format has no description, so the label is the source name.
		sources = output
			.split("\n")
			.map((line) => ({ name: line.split("\t")[1]?.trim() }))
			.filter((source) => source.name);
	}
	const inputs = sources
		.filter((source) => source.name && !isMonitor(source))
		.map((source) => ({ id: source.name as string, label: microphoneLabel(source) }));
	const system = inputs.find((input) => input.id === fallback)?.label;
	return [
		{ id: "default", label: system ? `System default (${system})` : "System default" },
		...inputs,
	];
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

export async function microphoneDevices(): Promise<Microphone[]> {
	const pactl = findExecutableSync("pactl");
	if (!pactl) return [{ id: "default", label: "System default" }];
	const [list, current] = await Promise.all([
		run(pactl, ["--format=json", "list", "sources"]).catch(() =>
			run(pactl, ["list", "short", "sources"]),
		),
		// get-default-source needs PulseAudio 15+. Without it, no name shows after "System default".
		run(pactl, ["get-default-source"]).catch(() => ""),
	]);
	return parsePulseSources(list, current.trim());
}

/** Stream the input level only. Nothing is written to disk. Call the result to stop. */
export function startMeter(device: string, onLevel: (db: number) => void): () => void {
	const ffmpeg = findExecutableSync("ffmpeg");
	if (!ffmpeg) throw new Error("The microphone test needs ffmpeg on PATH.");
	const args = ffmpegRecordArgs(device, "-");
	args.splice(args.length - 2, 2, "-f", "null", "-");
	const child = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
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
