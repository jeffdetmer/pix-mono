import { describe, expect, test } from "bun:test";
import {
	audioPlayers,
	microphoneInput,
	microphoneLabel,
	parseDshowDevices,
	parsePulseSources,
} from "./audio.ts";
import type { HostPlatform } from "./platform.ts";

const linux: HostPlatform = {
	os: "linux",
	arch: "x64",
	libc: "glibc",
	wsl: false,
	termux: false,
	exe: "",
};
const win: HostPlatform = { os: "win32", arch: "x64", wsl: false, termux: false, exe: ".exe" };

/** A `pactl --format=json` source. Only the fields the parser reads. */
function source(
	name: string,
	description: string,
	props: Record<string, string> = {},
	port?: string,
) {
	return {
		name,
		description,
		active_port: port ? "p" : null,
		ports: port ? [{ name: "p", description: port }] : [],
		properties: props,
	};
}

describe("microphone list", () => {
	test.each([
		[
			"a USB headset",
			source("alsa_input.usb-Acme_H1", "Acme H1 Analog Mono", { "device.form_factor": "headset" }),
			"Headset - Acme H1",
		],
		[
			"a Bluetooth input with no form factor",
			source("bluez_input.AA", "Buds Pro", { "device.bus": "bluetooth" }),
			"Headset - Buds Pro",
		],
		[
			"a webcam that names itself",
			source("alsa_input.usb-cam", "Webcam X Mono", { "device.form_factor": "webcam" }),
			"Webcam X",
		],
		[
			"a USB mic with no metadata",
			source("alsa_input.usb-Mic", "Yeti Stereo"),
			"Microphone - Yeti",
		],
		[
			"a line-in port",
			source("alsa_input.pci", "Onboard Audio Analog Stereo", {}, "Line In"),
			"Line In - Onboard Audio",
		],
		[
			"a surround layout",
			source("alsa_input.pci-b", "Sound Card Analog Surround 5.1"),
			"Microphone - Sound Card",
		],
		[
			"a description that already ends in its kind",
			source("alsa_input.pci-c", "Family 17h/19h HD Audio Controller Digital Microphone"),
			"Family 17h/19h HD Audio Controller Digital Microphone",
		],
		["a source with no description", { name: "virtual_mic" }, "Microphone - virtual_mic"],
	])("labels %s", (_case, item, label) => {
		expect(microphoneLabel(item)).toBe(label);
	});

	test("skips output monitors by device class or by the .monitor name", () => {
		const json = JSON.stringify([
			source("alsa_output.pci.monitor", "Monitor of Speakers", { "device.class": "monitor" }),
			// Plain PulseAudio: no device.class, only the name ends in .monitor.
			source("alsa_output.usb.monitor", "Monitor of USB DAC"),
			source("alsa_input.usb-Mic", "Yeti Stereo"),
		]);
		expect(parsePulseSources(json).map((mic) => mic.id)).toEqual(["default", "alsa_input.usb-Mic"]);
	});

	test("names the system default input when pactl reports it", () => {
		const json = JSON.stringify([source("alsa_input.usb-Mic", "Yeti Stereo")]);
		expect(parsePulseSources(json, "alsa_input.usb-Mic")[0]).toEqual({
			id: "default",
			label: "System default (Microphone - Yeti)",
		});
		expect(parsePulseSources(json, "")[0]).toEqual({ id: "default", label: "System default" });
	});

	test("reads the short list from older PulseAudio without --format=json", () => {
		const short =
			"1\talsa_output.pci.monitor\tmodule-alsa-card.c\ts16le 2ch 44100Hz\tIDLE\n2\talsa_input.pci\tmodule-alsa-card.c\ts16le 2ch 44100Hz\tRUNNING\n";
		expect(parsePulseSources(short)).toEqual([
			{ id: "default", label: "System default" },
			{ id: "alsa_input.pci", label: "Microphone - alsa_input.pci" },
		]);
	});
});

describe("dshow and per-OS jobs", () => {
	test("lists dshow audio inputs and skips video and alternative names", () => {
		const stderr = [
			'[in#0 @ 0] "Logi C310 HD WebCam" (video)',
			'[in#0 @ 0]   Alternative name "@device_pnp_x"',
			'[in#0 @ 0] "Microphone (Logi C310 HD WebCam)" (audio)',
			'[in#0 @ 0]   Alternative name "@device_cm_y"',
			'[in#0 @ 0] "Headset (Nokia E1200 ANC)" (audio)',
		].join("\n");
		expect(parseDshowDevices(stderr)).toEqual([
			{ id: "default", label: "System default (Microphone (Logi C310 HD WebCam))" },
			{ id: "Microphone (Logi C310 HD WebCam)", label: "Microphone (Logi C310 HD WebCam)" },
			{ id: "Headset (Nokia E1200 ANC)", label: "Headset (Nokia E1200 ANC)" },
		]);
		expect(parseDshowDevices("")).toEqual([{ id: "default", label: "System default" }]);
	});

	test("maps a device to the ffmpeg input of each OS", () => {
		expect(microphoneInput("default", { host: linux })).toEqual(["-f", "pulse", "-i", "default"]);
		expect(microphoneInput("Headset (X)", { host: win })).toEqual([
			"-f",
			"dshow",
			"-i",
			"audio=Headset (X)",
		]);
		expect(() => microphoneInput("default", { host: { ...linux, os: "darwin" } })).toThrow(
			/not supported on darwin/,
		);
	});

	test("orders players per OS and quotes the PowerShell path", () => {
		expect(audioPlayers("/tmp/a.mp3", linux).map(([name]) => name)).toEqual([
			"pw-play",
			"paplay",
			"ffplay",
			"mpv",
		]);
		const players = audioPlayers("C:Tempit's.mp3", win);
		expect(players.map(([name]) => name)).toEqual(["ffplay", "mpv", "powershell"]);
		expect(players[2]?.at(-1)).toContain("$p.Open([uri]'C:Tempit''s.mp3')");
		expect(audioPlayers("/tmp/a.mp3", { ...linux, os: "darwin" })).toEqual([]);
	});
});
