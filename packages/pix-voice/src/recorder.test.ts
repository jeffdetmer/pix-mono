import { describe, expect, test } from "bun:test";
import { ffmpegRecordArgs, parsePulseSources, parseRmsDb } from "./recorder.js";

describe("microphone recorder", () => {
	test("parses PulseAudio source names", () => {
		expect(
			parsePulseSources(
				"42\talsa_input.usb-Mic.mono-fallback\tmodule-alsa-card.c\ts16le 1ch 48000Hz\tRUNNING\n",
			),
		).toEqual(["alsa_input.usb-Mic.mono-fallback"]);
	});

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
