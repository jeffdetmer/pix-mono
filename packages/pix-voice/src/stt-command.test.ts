import { describe, expect, test } from "bun:test";
import { setKittyProtocolActive } from "@earendil-works/pi-tui";
import { ffmpegRecordArgs, parseRmsDb } from "./recorder.js";
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

describe("microphone recorder", () => {
	test("builds a mono 16 kHz wav recording command", () => {
		expect(ffmpegRecordArgs(["-f", "pulse", "-i", "default"], "/tmp/pix-stt.wav")).toEqual([
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
