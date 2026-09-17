import os
from pathlib import Path

from comfy_sdk import Comfy

api_key = os.environ.get("COMFY_API_KEY")
if not api_key:
    raise SystemExit("Set COMFY_API_KEY to your Comfy API key before running this example.")

# Keep the downloaded workflow alongside this script.
workflow_path = Path(__file__).with_name("workflow_api.json")
with Comfy(api_key=api_key) as client:
    workflow = client.workflows.from_file(workflow_path)
    job = client.run(workflow)
    # Node 2 is SaveImage in the bundled workflow.
    outputs = job.get_outputs("2")
    if not outputs:
        raise RuntimeError("The workflow finished without an image from SaveImage (node 2).")
    output_path = outputs[0].to_file("first-result.png")
    print(f"Saved {output_path.resolve()}")
