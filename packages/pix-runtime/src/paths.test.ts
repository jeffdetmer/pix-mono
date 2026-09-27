import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { agentDir, binDir, cacheDir, expandHome, homeDir } from "./paths.ts";

const HOME_KEY = process.platform === "win32" ? "USERPROFILE" : "HOME";
const home = join("/", "home", "me");

describe("paths", () => {
	test("homeDir reads the platform home variable, else os.homedir()", () => {
		expect(homeDir({ [HOME_KEY]: home })).toBe(home);
		expect(homeDir({})).toBe(homedir());
	});

	test("agentDir honours PI_CODING_AGENT_DIR with tilde expansion", () => {
		expect(agentDir({ [HOME_KEY]: home })).toBe(join(home, ".pi", "agent"));
		expect(agentDir({ [HOME_KEY]: home, PI_CODING_AGENT_DIR: "~/alt" })).toBe(join(home, "alt"));
		const abs = join("/", "opt", "pi");
		expect(agentDir({ PI_CODING_AGENT_DIR: abs })).toBe(abs);
	});

	test("binDir is agentDir/bin", () => {
		expect(binDir({ PI_CODING_AGENT_DIR: join("/", "a") })).toBe(join("/", "a", "bin"));
	});

	test("cacheDir prefers XDG_CACHE_HOME", () => {
		expect(cacheDir({ [HOME_KEY]: home })).toBe(join(home, ".cache", "pi"));
		expect(cacheDir({ XDG_CACHE_HOME: join("/", "xdg") })).toBe(join("/", "xdg", "pi"));
	});

	test("expandHome leaves non-tilde paths alone", () => {
		expect(expandHome("rel/x", { [HOME_KEY]: home })).toBe("rel/x");
		expect(expandHome("~", { [HOME_KEY]: home })).toBe(home);
	});
});
