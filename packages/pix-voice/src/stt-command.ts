import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import {
	frameModal,
	modalOverlayOptions,
	modalWidth,
	terminalModalHeight,
} from "@xynogen/pix-pretty/modal-frame";
import { saveConfig, voiceConfig } from "./config.js";
import { microphoneDevices, type Recording, startRecording } from "./recorder.js";
import { transcribeAudioFile } from "./transcribe.js";

function levelBar(db: number | undefined): string {
	if (db === undefined) return "░".repeat(24);
	const count = Math.max(0, Math.min(24, Math.round(((db + 60) / 60) * 24)));
	return `${"█".repeat(count)}${"░".repeat(24 - count)}`;
}

async function record(
	ctx: ExtensionCommandContext,
	devices: string[],
): Promise<string | undefined> {
	return (
		(await ctx.ui.custom<string | null>(
			(tui, theme, _keybindings, done) => {
				let deviceIndex = Math.max(0, devices.indexOf(voiceConfig.sttDevice));
				let recording: Recording | undefined;
				let level: number | undefined;
				let error = "";
				let stopping = false;

				const stop = async () => {
					if (!recording || stopping) return;
					stopping = true;
					try {
						const current = recording;
						await current.stop();
						done(current.path);
					} catch (cause) {
						error = cause instanceof Error ? cause.message : String(cause);
						recording = undefined;
						stopping = false;
						tui.requestRender();
					}
				};

				return {
					render(width: number) {
						const device = devices[deviceIndex] ?? "default";
						return frameModal({
							width: modalWidth(width),
							maxHeight: terminalModalHeight(tui.terminal?.rows),
							title: "Microphone",
							titleColor: (text) => theme.fg("accent", theme.bold(text)),
							header: [""],
							body: [
								`${theme.fg("dim", "input")}  ${theme.fg("success", device)}`,
								"",
								`${theme.fg("dim", "level")}  ${theme.fg(level !== undefined && level > -12 ? "warning" : "success", levelBar(level))} ${level === undefined ? "" : `${level.toFixed(1)} dB`}`,
								"",
								theme.fg(error ? "error" : "text", error || (recording ? "Recording…" : "Ready")),
							],
							footer: [
								"",
								theme.fg(
									"muted",
									recording
										? "enter stop and transcribe · esc cancel"
										: "←→ input · enter record · esc close",
								),
							],
							color: (text) => theme.fg("accent", text),
							bg: (text) => theme.bg("customMessageBg", text),
						}).lines;
					},
					invalidate: () => {},
					handleInput(data: string) {
						if (matchesKey(data, "escape")) {
							if (recording) void recording.stop().finally(() => done(null));
							else done(null);
						} else if (matchesKey(data, "enter")) {
							if (recording) void stop();
							else {
								const device = devices[deviceIndex] ?? "default";
								try {
									recording = startRecording(device, (db) => {
										level = db;
										tui.requestRender();
									});
									voiceConfig.sttDevice = device;
									saveConfig(voiceConfig);
								} catch (cause) {
									error = cause instanceof Error ? cause.message : String(cause);
								}
							}
						} else if (!recording && (matchesKey(data, "left") || matchesKey(data, "right"))) {
							const direction = matchesKey(data, "left") ? -1 : 1;
							deviceIndex = (deviceIndex + direction + devices.length) % devices.length;
						}
						tui.requestRender();
					},
				};
			},
			{ overlay: true, overlayOptions: modalOverlayOptions() },
		)) ?? undefined
	);
}

export default function registerSttCommand(pi: ExtensionAPI): void {
	pi.registerCommand("stt", {
		description: "Record microphone audio and put its transcript in the prompt",
		handler: async (_args, ctx) => {
			try {
				const audio = await record(ctx, await microphoneDevices());
				if (!audio) return;
				ctx.ui.setStatus("voice-stt", "Transcribing microphone…");
				const result = await transcribeAudioFile(audio);
				ctx.ui.setEditorText(result.text);
				ctx.ui.notify(
					`The transcript is in the prompt editor (${result.provider}/${result.model}).`,
					"info",
				);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			} finally {
				ctx.ui.setStatus("voice-stt", undefined);
			}
		},
	});
}
