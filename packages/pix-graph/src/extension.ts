import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerGraph from "./graph.ts";

export default function pixGraphExtension(pi: ExtensionAPI): void {
	registerGraph(pi);
}
