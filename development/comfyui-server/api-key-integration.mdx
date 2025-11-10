---
title: 'ComfyUI Account API Key Integration'
description: 'This article explains how to use ComfyUI Account API Key to call paid API nodes in headless mode'
sidebarTitle: 'API Key Integration'
---

Starting from [PR #8041](https://github.com/comfyanonymous/ComfyUI/pull/8041), ComfyUI supports directly using built-in paid API nodes through your ComfyUI Account API Key, without requiring a specific frontend interface (you can even run without a frontend).

This means you can create workflows that combine:
- local OS models
- tools from the custom node community
- popular paid models

Then run everything together by simply sending the prompt to the Comfy webserver API, letting it handle all the orchestration.

This is helpful for users who want to use Comfy as a backend service, via the command line, with their own frontend, etc.

## Prerequisites

Using your ComfyUI Account API Key to call paid API nodes requires:
- A ComfyUI Account API Key
- Sufficient account credits

<Note>
  **Important:** This page describes the **ComfyUI Account API Key** used for accessing paid API nodes in workflows. If you're looking to publish custom nodes to the registry instead, see [Publishing Nodes](/registry/publishing).
</Note>

To use your ComfyUI Account API Key to call paid API nodes, you need to first register an account on [ComfyUI Platform](https://platform.comfy.org/login) and create an API key

<Card title="Login with API Key" icon="link" href="/interface/user#logging-in-with-an-api-key">
Please refer to the User Interface section to learn how to login with API Key
</Card>

You need to ensure your ComfyUI account has sufficient credits to test the corresponding features.

<Card title="Credits" icon="link" href="/interface/credits">
Please refer to the Credits section to learn how to purchase credits for your account
</Card>


## Python Example

Here is an example of how to send a workflow containing API nodes to the ComfyUI API using Python code:

```python
"""Using API nodes when running ComfyUI headless or with alternative frontend

You can execute a ComfyUI workflow that contains API nodes by including an API key in the prompt.
The API key should be added to the `extra_data` field of the payload.
Below we show an example of how to do this.

See more:

- API nodes overview: https://docs.comfy.org/tutorials/partner-nodes/overview
- To generate an API key, login here: https://platform.comfy.org/login
"""

import json
from urllib import request

SERVER_URL = "http://127.0.0.1:8188"

# We have a prompt/job (workflow in "API format") that contains API nodes.
workflow_with_api_nodes = """{
  "11": {
    "inputs": {
      "prompt": "A dreamy, surreal half-body portrait of a young woman meditating. She has a short, straight bob haircut dyed in pastel pink, with soft bangs covering her forehead. Her eyes are gently closed, and her hands are raised in a calm, open-palmed meditative pose, fingers slightly curved, as if levitating or in deep concentration. She wears a colorful dress made of patchwork-like pastel tiles, featuring clouds, stars, and rainbows. Around her float translucent, iridescent soap bubbles reflecting the rainbow hues. The background is a fantastical sky filled with cotton-candy clouds and vivid rainbow waves, giving the entire scene a magical, dreamlike atmosphere. Emphasis on youthful serenity, whimsical ambiance, and vibrant soft lighting.",
      "prompt_upsampling": false,
      "seed": 589991183902375,
      "aspect_ratio": "1:1",
      "raw": false,
      "image_prompt_strength": 0.4000000000000001,
      "image_prompt": [
        "14",
        0
      ]
    },
    "class_type": "FluxProUltraImageNode",
    "_meta": {
      "title": "Flux 1.1 [pro] Ultra Image"
    }
  },
  "12": {
    "inputs": {
      "filename_prefix": "ComfyUI",
      "images": [
        "11",
        0
      ]
    },
    "class_type": "SaveImage",
    "_meta": {
      "title": "Save Image"
    }
  },
  "14": {
    "inputs": {
      "image": "example.png"
    },
    "class_type": "LoadImage",
    "_meta": {
      "title": "Load Image"
    }
  }
}"""


prompt = json.loads(workflow_with_api_nodes)
payload = {
    "prompt": prompt,
    # Add the `api_key_comfy_org` to the payload.
    # You can first get the key from the associated user if handling multiple clients.
    "extra_data": {
        "api_key_comfy_org": "comfyui-87d01e28d*******************************************************"  # replace with actual key
    },
}
data = json.dumps(payload).encode("utf-8")
req = request.Request(f"{SERVER_URL}/prompt", data=data)
request.urlopen(req)

```

## Related Documentation

- [API nodes overview](https://docs.comfy.org/tutorials/partner-nodes/overview)
- [Account management](https://docs.comfy.org/interface/user)
- [Credits](https://docs.comfy.org/interface/credits)
