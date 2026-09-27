import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { type ConfirmUI, confirmOverlay } from "@xynogen/pix-pretty/confirm";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { openProgress, type ProgressHandle, type ProgressUI } from "@xynogen/pix-pretty/progress";
import { SPINNER } from "@xynogen/pix-pretty/widget-format";
import { type LookupOptions, resolveTool } from "@xynogen/pix-runtime/binaries";
import { runTool } from "@xynogen/pix-runtime/exec";
import { ioTimeoutMs } from "@xynogen/pix-runtime/io";
// ─── Pure logic (exported for tests) ─────────────────────────────────────────

export const PACKAGE_NAME = "@earendil-works/pi-coding-agent";

// Canonical pix-mono installer. Re-running it is idempotent (Pi install + opt-in
// prompts), so it doubles as the extension updater: it refreshes every
// @xynogen/pix-* package from npm.
export const PIX_INSTALL_URL =
	"https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/install.sh";
export const PIX_UNINSTALL_URL =
	"https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/uninstall.sh";
// README upgrade path: uninstall then reinstall, so stale/renamed packages from
// breaking changes are cleared before the fresh install.
export const PIX_INSTALL_COMMAND = `curl -fsSL ${PIX_UNINSTALL_URL} | sh && curl -fsSL ${PIX_INSTALL_URL} | sh`;

const TRANSIENT_PATTERNS = [
	/eai_again/i,
	/etimedout/i,
	/econnreset/i,
	/econnrefused/i,
	/socket hang up/i,
	/network/i,
	/timeout/i,
	/temporar/i,
	/too many requests/i,
	/\b429\b/,
	/\b502\b/,
	/\b503\b/,
	/\b504\b/,
];

export type InstallMethod = "vp" | "bun" | "npm" | "brew" | "native";

export type CommandSpec = {
	command: string;
	args: string[];
	label: string;
};

export function isTransient(output: string): boolean {
	return TRANSIENT_PATTERNS.some((pattern) => pattern.test(output));
}

export function commandFor(method: InstallMethod): CommandSpec | undefined {
	switch (method) {
		case "vp":
			return {
				command: "vp",
				args: ["add", "-g", `${PACKAGE_NAME}@latest`],
				label: `vp add -g ${PACKAGE_NAME}@latest`,
			};
		case "bun":
			return {
				command: "bun",
				args: ["add", "-g", `${PACKAGE_NAME}@latest`],
				label: `bun add -g ${PACKAGE_NAME}@latest`,
			};
		case "npm":
			return {
				command: "npm",
				args: ["install", "-g", `${PACKAGE_NAME}@latest`],
				label: `npm install -g ${PACKAGE_NAME}@latest`,
			};
		case "brew":
			return {
				command: "/bin/sh",
				args: ["-lc", "brew upgrade pi-coding-agent || brew upgrade pi"],
				label: "brew upgrade pi-coding-agent || brew upgrade pi",
			};
		case "native":
			return undefined;
	}
}

export function formatUpdateSummary(before: string, after: string, attempts: number): string {
	const changed = before !== after && before !== "unknown" && after !== "unknown";
	const summary = changed ? `Pi updated: ${before} → ${after}` : `Pi is up to date (${after}).`;
	return attempts > 1 ? `${summary} Retried ${attempts - 1} transient failure(s).` : summary;
}

export { SPINNER } from "@xynogen/pix-pretty/widget-format";

// 250ms (not 80ms): with up to 3 concurrent spinners during updateAll, a fast
// cadence floods the TUI render queue and starves keystroke echo (typed chars
// render out of order). 250ms still animates smoothly for a multi-minute op.
const SPINNER_INTERVAL_MS = 250;

type StatusUI = { setStatus(key: string, text: string | undefined): void };

// Ticks a spinner status line while `work` runs; always clears it after.
// `key` must be unique per concurrent caller — updateAll runs two of these in
// parallel, so a shared key would let one clear the other's line.
export async function withSpinner<T>(
	ui: StatusUI,
	key: string,
	label: string,
	work: () => Promise<T>,
): Promise<T> {
	let frame = 0;
	ui.setStatus(key, `${SPINNER[0]} ${label}`);
	const timer = setInterval(() => {
		frame = (frame + 1) % SPINNER.length;
		ui.setStatus(key, `${SPINNER[frame]} ${label}`);
	}, SPINNER_INTERVAL_MS);
	try {
		return await work();
	} finally {
		clearInterval(timer);
		ui.setStatus(key, undefined);
	}
}

/** Path of `command` via pix-runtime (binary.json → agent bin → PATH); works on Windows. */
export function resolveCommand(command: string, opts?: LookupOptions): string | undefined {
	return resolveTool(command, opts)?.path;
}

function realPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

/** True when `pi` sits inside a global npm tree (…/node_modules/<pkg> within 5 parents). */
function inGlobalNpm(piPath: string): boolean {
	let dir = piPath;
	for (let i = 0; i < 5; i++) {
		dir = dirname(dir);
		if (existsSync(join(dir, "node_modules", PACKAGE_NAME))) return true;
	}
	return false;
}

/** Forward-slash form so path markers match on Windows too. */
function slashes(path: string | undefined): string | undefined {
	return path?.replaceAll("\\", "/");
}

/** Result shape shared with Pi's pi.exec (tests inject a fake). */
export interface ExecOutput {
	stdout: string;
	stderr: string;
	code?: number | null;
}

/**
 * How update commands run. Default: pix-runtime, so pi/npm/bun/vp resolve
 * through binary.json and Windows .cmd shims (npm.cmd, pi.cmd) work.
 */
export type Exec = (
	command: string,
	args: string[],
	opts: { timeout?: number },
) => Promise<ExecOutput>;

export const runtimeExec: Exec = (command, args, opts) =>
	runTool(command, args, { timeoutMs: opts.timeout });

/** Pi's ExtensionAPI (tests) or an Exec; both end up as an Exec. */
function asExec(runner: ExtensionAPI | Exec): Exec {
	return typeof runner === "function" ? runner : (c, a, o) => runner.exec(c, a, o);
}

export async function currentVersion(runner: ExtensionAPI | Exec = runtimeExec) {
	const result = await asExec(runner)("pi", ["--version"], { timeout: 10_000 });
	return result.stdout.trim() || result.stderr.trim() || "unknown";
}

/** Detect how Pi was installed from where `pi` resolves (no shell; Windows-safe). */
export function detectInstallMethod(opts?: LookupOptions): InstallMethod {
	const rawPi = resolveCommand("pi", opts);
	const [vpPath, bunPath, npmPath, brewPath] = ["vp", "bun", "npm", "brew"].map((c) =>
		resolveCommand(c, opts),
	);
	const piPath = slashes(rawPi);
	const realPiPath = rawPi ? slashes(realPath(rawPi)) : undefined;

	if (piPath?.includes("/.vite-plus/") || realPiPath?.includes("/.vite-plus/")) return "vp";
	if (piPath?.includes("/.bun/") || realPiPath?.includes("/.bun/")) return "bun";
	if (
		piPath?.includes("/Homebrew/") ||
		piPath?.includes("/homebrew/") ||
		realPiPath?.includes("/Homebrew/") ||
		realPiPath?.includes("/homebrew/")
	)
		return "brew";

	if (rawPi && inGlobalNpm(realPath(rawPi))) return "npm";

	// Fall back to whichever package manager was found.
	if (vpPath) return "vp";
	if (bunPath) return "bun";
	if (npmPath) return "npm";
	if (brewPath) return "brew";
	return "native";
}

/**
 * `nice -n 19` deprioritizes installs so the TUI keeps echoing keystrokes.
 * The inner command is resolved first (binary.json → bin → known dirs → PATH)
 * so nice never re-looks it up on its own PATH. Skipped on Windows (MSYS nice
 * cannot start .cmd shims) and where nice is unavailable.
 */
export function niced(
	command: string,
	args: string[],
	opts: LookupOptions & { platform?: NodeJS.Platform } = {},
): [string, string[]] {
	if ((opts.platform ?? process.platform) === "win32") return [command, args];
	const nice = resolveCommand("nice", opts);
	if (!nice) return [command, args];
	return [nice, ["-n", "19", resolveCommand(command, opts) ?? command, ...args]];
}

/** Backoff delay between retries. Injectable so tests can skip the real wait. */
export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWithRetry(
	runner: ExtensionAPI | Exec,
	spec: CommandSpec,
	sleep: Sleep = realSleep,
) {
	const exec = asExec(runner);
	let lastOutput = "";
	for (let attempt = 1; attempt <= 3; attempt++) {
		const [command, args] = niced(spec.command, spec.args);
		const result = await exec(command, args, { timeout: ioTimeoutMs() });
		lastOutput = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
		if ((result.code ?? 0) === 0) return { ok: true, output: lastOutput, attempts: attempt };
		if (attempt === 3 || !isTransient(lastOutput))
			return { ok: false, output: lastOutput, attempts: attempt };
		await sleep(attempt * 1500);
	}
	return { ok: false, output: lastOutput, attempts: 3 };
}

async function updatePi(ctx: ExtensionCommandContext, progress?: ProgressHandle): Promise<boolean> {
	await (ctx as ExtensionCommandContext & { waitForIdle?: () => Promise<void> }).waitForIdle?.();

	// Grab current version + detect install method concurrently.
	const [before, method] = await Promise.all([
		currentVersion().catch(() => "unknown"),
		detectInstallMethod(),
	]);
	const spec = commandFor(method);

	if (!spec) {
		ctx.ui.notify(
			`Pi ${before}; install method appears native. Please update the native binary manually.`,
			"warning",
		);
		return false;
	}

	progress?.setLabel(`Updating Pi via ${method}…`);
	const result = await runWithRetry(runtimeExec, spec).catch((err: unknown) => ({
		ok: false,
		output: err instanceof Error ? err.message : String(err),
		attempts: 1,
	}));
	const after = await currentVersion().catch(() => "unknown");

	if (!result.ok) {
		ctx.ui.notify(
			`Pi update failed after ${result.attempts} attempt(s). ${result.output || "No output."}`,
			"error",
		);
		return false;
	}

	ctx.ui.notify(formatUpdateSummary(before, after, result.attempts), "info");
	return true;
}

async function updatePackages(ctx: ExtensionCommandContext, progress?: ProgressHandle) {
	progress?.setLabel("Updating pi packages…");
	const [command, args] = niced("pi", ["update", "--extensions"]);
	const result = await runtimeExec(command, args, { timeout: ioTimeoutMs() }).catch(
		(err: unknown) => ({
			stdout: "",
			stderr: err instanceof Error ? err.message : String(err),
			code: 1,
		}),
	);
	const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
	if ((result.code ?? 0) !== 0) {
		ctx.ui.notify(`Pi package update failed. ${output || "No output."}`, "error");
		return;
	}
	ctx.ui.notify("Pi packages updated.", "info");
}

async function updateAll(ctx: ExtensionCommandContext) {
	if (ctx.hasUI) {
		// SAFETY: ctx.ui structurally provides the ConfirmUI surface (custom/theme);
		// the host's UI type is wider, so we narrow to the subset confirmOverlay uses.
		const ok = await confirmOverlay(ctx.ui as unknown as ConfirmUI, {
			icon: icon("update"),
			title: "Update Pi & Extensions?",
			body: ["Pi will close when the update finishes — relaunch to apply."],
		});
		if (!ok) {
			ctx.ui.notify("Update cancelled.", "info");
			return;
		}
	}
	// A focused progress overlay owns input for the whole update, so keystrokes
	// are swallowed instead of echoing out of order while the heavy install
	// subprocesses compete with the TUI. Steps run serially + `nice`-d.
	// SAFETY: ctx.ui structurally provides the ProgressUI surface; the host UI
	// type is wider, so we narrow to the subset openProgress uses.
	const progress = ctx.hasUI
		? openProgress(ctx.ui as unknown as ProgressUI, "Updating Pi & extensions")
		: undefined;
	try {
		await updatePi(ctx, progress);
		await updatePackages(ctx, progress);
	} finally {
		progress?.close();
	}
	// Updates land on disk but need a fresh process to load. Quit so the
	// next launch picks up new Pi + extensions; shutdown defers until idle.
	ctx.ui.notify("Update complete. Closing Pi — relaunch to apply.", "warning");
	(ctx as ExtensionCommandContext & { shutdown?: () => void }).shutdown?.();
}

export default function (pi: ExtensionAPI) {
	(
		pi as ExtensionAPI & {
			registerFlag: (name: string, opts: unknown) => void;
		}
	).registerFlag("update", {
		description: "Update Pi, pix extensions, and pi packages",
		type: "boolean",
		default: false,
	});

	pi.registerCommand("update", {
		description: "Update Pi, pix extensions, and pi packages",
		handler: async (_args, ctx) => {
			await updateAll(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const flags = pi as ExtensionAPI & {
			getFlag?: (name: string) => boolean;
			sendUserMessage?: (message: string, opts?: unknown) => void;
		};
		if (!flags.getFlag?.("update")) return;
		flags.sendUserMessage?.("/update", { deliverAs: "followUp" });
		ctx.ui.notify("Queued /update from --update", "info");
	});
}
