import { afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

import { tempDir } from "@xynogen/pix-runtime/paths";

const systemHomedir = nodeOs.homedir();
mock.module("node:os", () => ({
	...nodeOs,
	homedir: () => process.env.HOME ?? systemHomedir,
}));

let onboardingModuleId = 0;
function importOnboardingState() {
	return import(`../src/onboarding-state.ts?bun-test=${onboardingModuleId++}`) as Promise<
		typeof import("../src/onboarding-state.ts")
	>;
}

describe("onboarding state", () => {
	const originalHome = process.env.HOME;

	afterEach(() => {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
	});

	it("returns the default state when no file exists", async () => {
		process.env.HOME = mkdtempSync(join(tempDir(), "pi-mcp-onboarding-home-"));
		const { loadOnboardingState, getOnboardingStatePath } = await importOnboardingState();

		expect(loadOnboardingState()).toEqual({
			version: 1,
			sharedConfigHintShown: false,
			setupCompleted: false,
		});
		expect(existsSync(getOnboardingStatePath())).toBe(false);
	});

	it("persists hint and setup completion state", async () => {
		process.env.HOME = mkdtempSync(join(tempDir(), "pi-mcp-onboarding-home-"));
		const {
			markSharedConfigHintShown,
			markSetupCompleted,
			loadOnboardingState,
			getOnboardingStatePath,
		} = await importOnboardingState();

		markSharedConfigHintShown("first");
		markSetupCompleted("second");

		expect(loadOnboardingState()).toEqual({
			version: 1,
			sharedConfigHintShown: true,
			setupCompleted: true,
			lastDiscoveryFingerprint: "second",
		});

		let raw: Record<string, unknown>;
		try {
			raw = JSON.parse(readFileSync(getOnboardingStatePath(), "utf-8"));
		} catch (cause) {
			throw new Error("Cannot parse onboarding test state", { cause });
		}
		expect(raw.sharedConfigHintShown).toBe(true);
		expect(raw.setupCompleted).toBe(true);
	});
});
