---
title: "Code Interface"
description: "What are custom nodes and how are they used?"
---

## Overview

A custom node is a combination of Python code and potentially some models weights. Custom nodes are extremely powerful, and allows the Comfy community to build their own functionality into ComfyUI.

If you prefer to read code, check out the [example](https://github.com/comfyanonymous/ComfyUI/blob/master/custom_nodes/example_node.py.example) in the repository. Otherwise, we will explore one of Comfy's built-in nodes below.

## Interface

Let's examine the interface of a custom node by looking at ComfyUI's built-in [Load Checkpoint](https://github.com/comfyanonymous/ComfyUI/blob/master/nodes.py#L529C7-L529C29) node. This loads a checkpoint file.

### Functions

Every custom node can implement the following methods.

#### INPUT_TYPES

This defines the parameters that the custom node can take as an input.

```python
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "ckpt_name": (folder_paths.
            get_filename_list("checkpoints"),),
        }}
```

Here you can see that input types is defined as a dictionary in Python. You can define inputs as `required`, `hidden`, or `optional`.

Each input must have a type (eg. VAE). If you use one of the special built-in types: `INT`, `STRING`, or `FLOAT`, then they can be lists.

<Accordion title="Optional Fields">

`default`: You can define a default value.

`min`: You can define a min value.

`max`: You can define a max value.

`step`: You can use a slider.

</Accordion>

#### IS_CHANGED

Optional. Allows the node to control when it is re-executed. ComfyUI attempts to only execute nodes that have changed in order to be more efficient.

### Attributes

#### RETURN_TYPES

Tuple. The type of each element in the output tuple.

```python
RETURN_TYPES = ("MODEL", "CLIP", "VAE")
```

#### RETURN_NAMES

Optional: The name of each output in the output tuple.

```python
CATEGORY = "loaders"
```

#### FUNCTION

The name of the Python function in the custom node class to call.

For LoadCheckpointSimple, the function is defined like this:

```python
FUNCTION = "load_checkpoint"
```

#### Entry Point Function

This Python function is called when the node is invoked. Needs to match the string under FUNCTION.

```python
def load_checkpoint(self, ckpt_name, output_vae=True, output_clip=True):
        ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
        out = comfy.sd.load_checkpoint_guess_config(ckpt_path, output_vae=True, output_clip=True, embedding_directory=folder_paths.get_folder_paths("embeddings"))
        return out[:3]
```

#### OUTPUT_NODE

Bool. Defaults to False. Set to true if your node will output a result/image from the graph.

#### CATEGORY

String. The category you want the node to appear under the UI.

```python
CATEGORY = "loaders"
```

#### WEB_DIRECTORY

Custom nodes can have custom UI.

This attribute sets the web directory. Any `.js` file in that directory will be loaded as a frontend extension.

Custom nodes can also include markdown documentation in the `WEB_DIRECTORY/docs` folder. See the [Help Page](/custom-nodes/help_page) section for details on how to add rich documentation for your nodes.

#### NODE_CLASS_MAPPINGS

A dictionary that contains all nodes you want to export along with their class names. Class names should be unique. This also means you can define multiple nodes in one "custom node" and export them all together.

```python
NODE_CLASS_MAPPINGS = {
    "CheckpointLoaderSimple": CheckpointLoaderSimple,
}
```

#### NODE_DISPLAY_NAME_MAPPINGS

If you want to define more human-readable names for each node.

```python
NODE_DISPLAY_NAME_MAPPINGS = {
    "CheckpointLoaderSimple": "Load Checkpoint",
}
```
