/**
 * distro.ts — run the install/uninstall script for this OS.
 *
 *   bun run distro:install      # Windows → install.ps1, Linux/macOS → install.sh
 *   bun run distro:uninstall
 *
 * Extra args pass through to the script.
 */

const [action, ...args] = process.argv.slice(2);
if (action !== "install" && action !== "uninstall") {
	console.error("usage: bun scripts/distro.ts <install|uninstall> [args...]");
	process.exit(2);
}

const script = `${import.meta.dir}/${action}`;
const cmd =
	process.platform === "win32"
		? ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", `${script}.ps1`, ...args]
		: ["bash", `${script}.sh`, ...args];

const proc = Bun.spawn(cmd, { stdio: ["inherit", "inherit", "inherit"] });
process.exit(await proc.exited);
