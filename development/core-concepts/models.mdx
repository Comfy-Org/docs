---
title: "Models"
description: "How model files fit into ComfyUI workflows: where they go, how to load them, and common fixes."
icon: "cube"
---

import ExternalModels from "/snippets/install/add-external-models.mdx"

## Models in plain terms

In ComfyUI, **models** are the weight files that actually run your workflow—things like **checkpoints**, **VAEs**, **LoRAs**, **ControlNets**, and upscalers. The app install is small; these files are **not** included by default. You usually **download them from the web**, place them under `ComfyUI/models/` (or follow a template’s prompts), then choose the file in the right **loader node** (on the canvas, these often appear as nodes whose names start with **Load**).

### Supported models in ComfyUI

- **Built-in / first-party coverage is intentionally limited** but grows over time as ComfyUI and the open-source ecosystem evolve. When a model gains first-class support, you will **usually see a new entry in the [workflow template library](/interface/features/template)** that shows the expected graph and model pairing.
- **Not every checkpoint or weights file works out of the box.** For **natively supported models and their common companion weights**, keep ComfyUI **[up to date](/installation/update_comfyui)** and confirm the matching workflow exists in the **[template library](/interface/features/template)** before assuming your files are in the wrong place.
- **Many other models are enabled through community custom nodes.** Paths, loader nodes, and graph layout can differ from this page’s generic `ComfyUI/models/` guidance—**always follow each project’s README or docs**. ComfyUI is highly extensible, so implementations vary by author. For installation and troubleshooting, see [How to install custom nodes](/installation/install_custom_node).

## Use models in ComfyUI

1. **Get the files into the right place** — Download from community sites such as [Hugging Face](https://huggingface.co), [Civitai](https://civitai.green), or a project’s page on [GitHub](https://github.com), then put them under `ComfyUI/models/` in the subfolder for that type (for example `checkpoints`, `loras`, `vae`).
2. **Add the matching loader node** — Pick the loader for that model type (checkpoint, LoRA, VAE, etc.); in the node list, titles often begin with **Load**.
3. **Pick the file** in that loader node’s dropdown.
4. **Wire the loader node** into the rest of the graph. If you copied files in by hand while ComfyUI was open, **restart** the app (or refresh as needed) so lists update.

### Expect large downloads

A single generative model is often **many gigabytes**. Budget disk space and time when downloading or syncing.

## Beyond the main checkpoint

The main diffusion checkpoint does a lot, but many workflows add **smaller helper models**, for example:

- **LoRA** — lightweight add-ons tuned for a style, character, or concept  
- **ControlNet** — extra guidance from edges, depth, pose, etc.  
- **Inpainting** — fill or replace regions inside an existing image  

![auxiliary models](/images/concepts/core-concepts_auxiliary-model.png)

## Uninstalling models

There is no “uninstall” button in the UI yet. To remove a model, **delete its file** (or files) from the folder under `ComfyUI/models/` where you put it.

<ExternalModels />

## Common issues

<AccordionGroup>
  <Accordion title="Does ComfyUI support GGUF format models?">
    ComfyUI does not natively support GGUF format models. To use GGUF models, you need to install community custom nodes such as [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF).
  </Accordion>

  <Accordion title="Why can't I find my model?">
    If you've installed a model but can't find it in ComfyUI, try these steps:

    - Verify the model is in the correct location:
      - For **ComfyUI Desktop**: Go to **Help** menu → **Open Folder** → **Open Model Folder** to check the model installation path
      - Ensure your model file is placed in the correct subfolder (e.g., `checkpoints`, `loras`, `vae`)
    - Press the `r` key to refresh node definitions so ComfyUI can detect the model
    - Restart ComfyUI
    - Ensure the correct model is selected in the loader node
  </Accordion>
</AccordionGroup>

## Want a bit more background?

<AccordionGroup>
  <Accordion title="What does “model” mean here?">
    Here, a **model** is a data file that encodes what a network learned—enough to turn inputs (like text and noise) into outputs (like an image). Common examples in image workflows are **diffusion** checkpoints, text/image encoders such as **CLIP**, and **upscalers** like RealESRGAN.
  </Accordion>

  <Accordion title="Base models and community variants">
    Large **base** models from labs and open-source projects are general-purpose. The community often **fine-tunes** or merges them into new checkpoints and LoRAs that look better for a given style, run a bit lighter, or add new behavior—same idea as picking a favorite checkpoint on Civitai or Hugging Face.
  </Accordion>
</AccordionGroup>
