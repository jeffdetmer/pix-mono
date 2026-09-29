import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { type ConfirmUI, confirmOverlay } from "@xynogen/pix-pretty/confirm";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { cacheDir, tempDir } from "@xynogen/pix-runtime/paths";

async function clearCache(_pi: ExtensionAPI, ctx: ExtensionCommandContext) {
	// Only Pi's own files. The temp dir is shared with every other program, so
	// delete jiti's transpile cache inside it, never the temp dir itself.
	const targets = [cacheDir(), join(tempDir(), "jiti")];
	if (ctx.hasUI) {
		// SAFETY: ctx.ui structurally provides the ConfirmUI surface (custom/theme);
		// the host's UI type is wider, so we narrow to the subset confirmOverlay uses.
		const ok = await confirmOverlay(ctx.ui as unknown as ConfirmUI, {
			icon: icon("status.warn"),
			title: "Clear the Pi cache?",
			body: ["This deletes:", ...targets.map((t) => `  ${t}`), "Run /reload after to apply."],
			confirmLabel: "Delete",
			denyLabel: "Cancel",
		});
		if (!ok) {
			ctx.ui.notify("Clear cancelled.", "info");
			return;
		}
	}
	ctx.ui.notify(`Clearing ${targets.join(" and ")}`, "info");
	try {
		for (const t of targets) await rm(t, { recursive: true, force: true });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		ctx.ui.notify(`Cache clear failed. ${msg}`, "error");
		return;
	}
	ctx.ui.notify(`${targets.join(" and ")} cleared. Run /reload to apply changes.`, "warning");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("clear", {
		description: "Remove ~/.cache/pi (asks first)",
		handler: async (_args, ctx) => {
			await clearCache(pi, ctx);
		},
	});
}
