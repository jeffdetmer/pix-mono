import { describe, expect, test } from "bun:test";
import { setKittyProtocolActive } from "@earendil-works/pi-tui";
import { ffmpegRecordArgs, microphoneLabel, parsePulseSources, parseRmsDb } from "./recorder.js";
import { dictationInsert, isCancelKey, keyEvent, levelBar } from "./stt-command.js";

describe("dictation cancel key", () => {
	test("esc cancels only while a dictation runs, and not on release", () => {
		expect(isCancelKey("\x1b", true)).toBe(true);
		expect(isCancelKey("\x1b", false)).toBe(false);
		setKittyProtocolActive(true);
		try {
			expect(isCancelKey("\x1b[27u", true)).toBe(true);
			expect(isCancelKey("\x1b[27;1:3u", true)).toBe(false);
		} finally {
			setKittyProtocolActive(false);
		}
	});
});

describe("dictation key", () => {
	// Kitty keyboard protocol: CSI codepoint ; modifiers : event u. alt = 3, event 2 = repeat, 3 = release.
	test.each([
		["\x1b[122;3u", "press"],
		["\x1b[122;3:2u", "repeat"],
		["\x1b[122;3:3u", "release"],
		// The user lets go of alt first: the terminal reports a bare z release.
		["\x1b[122;1:3u", "release"],
		["\x1b[120;3u", undefined],
		["\x1b[120;1:3u", undefined],
	])("reads %j as %s for alt+z", (data, event) => {
		setKittyProtocolActive(true);
		try {
			expect(keyEvent(data, "alt+z")).toBe(event as never);
		} finally {
			setKittyProtocolActive(false);
		}
	});
});

describe("dictation", () => {
	test("adds a space before the transcript only after a word", () => {
		expect(dictationInsert("", "hello")).toBe("hello");
		expect(dictationInsert("fix the bug", "in auth")).toBe(" in auth");
		expect(dictationInsert("fix the bug ", "in auth")).toBe("in auth");
		expect(dictationInsert("line one\n", "line two")).toBe("line two");
	});

	test("scales the level bar from -60 dB to 0 dB", () => {
		expect(levelBar(undefined, 4)).toBe("░░░░");
		expect(levelBar(-30, 4)).toBe("██░░");
		expect(levelBar(5, 4)).toBe("████");
	});
});

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

describe("microphone recorder", () => {
	test("builds a mono 16 kHz wav recording command", () => {
		expect(ffmpegRecordArgs("default", "/tmp/pix-stt.wav")).toEqual([
			"-hide_banner",
			"-loglevel",
			"info",
			"-f",
			"pulse",
			"-i",
			"default",
			"-ac",
			"1",
			"-ar",
			"16000",
			"-af",
			"astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
			"-y",
			"/tmp/pix-stt.wav",
		]);
	});

	test("reads the latest RMS level", () => {
		expect(parseRmsDb("lavfi.astats.Overall.RMS_level=-31.7\n")).toBe(-31.7);
		expect(parseRmsDb("lavfi.astats.Overall.RMS_level=-inf\n")).toBeUndefined();
	});
});
