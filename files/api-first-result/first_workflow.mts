import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Comfy } from "@comfyorg/sdk";

const apiKey = process.env.COMFY_API_KEY;
if (!apiKey) {
  throw new Error("Set COMFY_API_KEY to your Comfy API key before running this example.");
}

// Keep the downloaded workflow alongside this script.
const workflowPath = fileURLToPath(new URL("./workflow_api.json", import.meta.url));
const client = new Comfy({ apiKey });
const workflow = await client.workflows.fromFile(workflowPath);
const job = await client.run(workflow);
// Node 2 is SaveImage in the bundled workflow.
const output = job.getOutputs("2")[0];
if (!output) {
  throw new Error("The workflow finished without an image from SaveImage (node 2).");
}
await output.toFile("first-result.png");
console.log(`Saved ${resolve("first-result.png")}`);
