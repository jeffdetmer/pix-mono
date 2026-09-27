import { rm } from "node:fs/promises";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { cacheDir } from "@xynogen/pix-runtime/paths";

async function clearCache(_pi: ExtensionAPI, ctx: ExtensionCommandContext) {
	const dir = cacheDir();
	ctx.ui.notify(`Clearing ${dir}`, "info");
	try {
		await rm(dir, { recursive: true, force: true });
		if (process.env.TMPDIR) await rm(process.env.TMPDIR, { recursive: true, force: true });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		ctx.ui.notify(`Cache clear failed. ${msg}`, "error");
		return;
	}
	ctx.ui.notify(`${dir} and $TMPDIR cleared. Run /reload to apply changes.`, "warning");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("clear", {
		description: "Remove ~/.cache/pi and reload",
		handler: async (_args, ctx) => {
			await clearCache(pi, ctx);
		},
	});
}
