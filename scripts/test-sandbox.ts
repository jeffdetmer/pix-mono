/**
 * Bun test preload: point every home/agent-dir lookup at a throwaway folder
 * before any test module loads, so no test can read or write the real
 * `~/.pi/agent` (Windows `os.homedir()` follows USERPROFILE, not HOME).
 * Tests that set their own HOME/agent dir still override this.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "pix-test-home-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.PI_CODING_AGENT_DIR = join(home, ".pi", "agent");
