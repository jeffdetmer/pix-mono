/**
 * audio.ts — the per-OS parts of recording and playback.
 *
 * Packages ask for the job ("list microphones", "ffmpeg input for this device",
 * "play this file"). This module picks the program for the host and runs it
 * through `exec.ts`. Linux uses PulseAudio/PipeWire, Windows uses DirectShow.
 */

import { resolveTool } from "./binaries/resolve.ts";
import { runTool, runToolSync } from "./exec.ts";
import type { OsOptions } from "./os.ts";
import { currentPlatform, type HostPlatform } from "./platform.ts";

export interface Microphone {
	/** Device id for {@link microphoneInput}. "default" follows the system default. */
	id: string;
	/** Readable name, e.g. "Headset - Nokia E1200 ANC". */
	label: string;
}

const SYSTEM_DEFAULT: Microphone = { id: "default", label: "System default" };

// ── Linux: PulseAudio / PipeWire ────────────────────────────────────────────

export interface PulseSource {
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
	// "... Digital Microphone" already names its kind. Skip the prefix.
	return name.toLowerCase().includes(kind.toLowerCase()) ? name : `${kind} - ${name}`;
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

async function pulseMicrophones(opts: OsOptions): Promise<Microphone[]> {
	if (!resolveTool("pactl", opts)) return [SYSTEM_DEFAULT];
	const pactl = async (args: string[]) => {
		const r = await runTool("pactl", args, { env: opts.env, host: opts.host, timeoutMs: 5000 });
		if (r.code !== 0) throw new Error(r.stderr.trim() || `pactl exited ${r.code}`);
		return r.stdout;
	};
	const [list, current] = await Promise.all([
		pactl(["--format=json", "list", "sources"]).catch(() => pactl(["list", "short", "sources"])),
		// get-default-source needs PulseAudio 15+. Without it, no name shows after "System default".
		pactl(["get-default-source"]).catch(() => ""),
	]);
	return parsePulseSources(list, current.trim());
}

// ── Windows: DirectShow through ffmpeg ──────────────────────────────────────

const DSHOW_LIST = ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"];

/** Audio inputs from `ffmpeg -list_devices true -f dshow -i dummy` (stderr). */
export function parseDshowDevices(output: string): Microphone[] {
	const names = [...output.matchAll(/"([^"]+)" \(audio\)/g)].map((m) => m[1] as string);
	return [
		{ id: "default", label: names[0] ? `System default (${names[0]})` : "System default" },
		...names.map((name) => ({ id: name, label: name })),
	];
}

// ── Public jobs ─────────────────────────────────────────────────────────────

/**
 * Microphones for a picker. The first entry is always "default". Never
 * downloads a tool: without pactl (Linux) or ffmpeg (Windows), only the default shows.
 */
export async function listMicrophones(opts: OsOptions = {}): Promise<Microphone[]> {
	const host = opts.host ?? currentPlatform();
	if (host.os === "linux") return pulseMicrophones({ ...opts, host });
	if (host.os !== "win32" || !resolveTool("ffmpeg", { ...opts, host })) return [SYSTEM_DEFAULT];
	// ffmpeg exits 1 here ("dummy" is no input). The list is on stderr.
	const r = await runTool("ffmpeg", DSHOW_LIST, { env: opts.env, host, timeoutMs: 5000 });
	return parseDshowDevices(r.stderr);
}

/**
 * ffmpeg input args (`-f … -i …`) that record `device` on this host. Sync, so a
 * recording still starts on the keypress. dshow has no default device, so on
 * Windows "default" maps to the first audio input (one ~0.3 s device scan).
 * Throws when the host has no supported audio input.
 */
export function microphoneInput(device: string, opts: OsOptions = {}): string[] {
	const host = opts.host ?? currentPlatform();
	if (host.os === "linux") return ["-f", "pulse", "-i", device];
	if (host.os !== "win32") throw new Error(`microphone recording is not supported on ${host.os}`);
	let name = device;
	if (name === "default") {
		const r = runToolSync("ffmpeg", DSHOW_LIST, { env: opts.env, host, timeoutMs: 5000 });
		name = parseDshowDevices(r.stderr)[1]?.id ?? "";
		if (!name) throw new Error("no microphone found (ffmpeg dshow lists no audio input)");
	}
	return ["-f", "dshow", "-i", `audio=${name}`];
}

/**
 * Windows fallback: WPF MediaPlayer plays mp3/wav with no extra install.
 * ponytail: waits NaturalDuration + 200 ms. Install ffplay/mpv if the end cuts off.
 */
function mediaPlayerScript(path: string): string {
	return [
		"Add-Type -AssemblyName PresentationCore",
		"$p = New-Object System.Windows.Media.MediaPlayer",
		`$p.Open([uri]'${path.replace(/'/g, "''")}')`,
		"for ($i = 0; -not $p.NaturalDuration.HasTimeSpan -and $i -lt 200; $i++) { Start-Sleep -Milliseconds 50 }",
		"if (-not $p.NaturalDuration.HasTimeSpan) { exit 1 }",
		"$p.Play()",
		"Start-Sleep -Milliseconds ($p.NaturalDuration.TimeSpan.TotalMilliseconds + 200)",
		"$p.Close()",
	].join("; ");
}

/** Players tried in order on each host, as `[name, ...args]` for `path`. */
export function audioPlayers(path: string, host: HostPlatform): string[][] {
	const ffplay = ["ffplay", "-nodisp", "-autoexit", "-loglevel", "error", path];
	const mpv = ["mpv", "--no-video", "--really-quiet", path];
	if (host.os === "linux") return [["pw-play", path], ["paplay", path], ffplay, mpv];
	if (host.os === "win32")
		return [
			ffplay,
			mpv,
			["powershell", "-NoProfile", "-NonInteractive", "-Command", mediaPlayerScript(path)],
		];
	return [];
}

export interface PlayOptions extends OsOptions {
	signal?: AbortSignal;
}

/** Play an audio file with the first player found. Resolves when playback ends. */
export async function playAudio(path: string, opts: PlayOptions = {}): Promise<void> {
	const host = opts.host ?? currentPlatform();
	const players = audioPlayers(path, host);
	const command = players.find(([name]) => resolveTool(name ?? "", { ...opts, host }));
	if (!command) {
		const names = players.map(([name]) => name).join(", ");
		throw new Error(`no supported audio player found (${names || `none on ${host.os}`})`);
	}
	const [name = "", ...args] = command;
	const r = await runTool(name, args, { env: opts.env, host, signal: opts.signal });
	if (r.code !== 0)
		throw new Error(r.stderr.trim() || `${name} exited with code ${r.code ?? "unknown"}`);
}
