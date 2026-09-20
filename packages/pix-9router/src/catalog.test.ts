import { describe, expect, test } from "bun:test";
import { groupVoice } from "./catalog.js";

describe("groupVoice", () => {
	test("groups a voice by locale and provider", () => {
		expect(groupVoice("edge-tts/en-US-AriaNeural")).toEqual({
			id: "edge-tts/en-US-AriaNeural",
			language: "en-US",
			provider: "edge-tts",
		});
	});

	test("keeps voices without a locale in Other", () => {
		expect(groupVoice("openai/alloy").language).toBe("Other");
	});
});
