---
title: "V3 Migration"
description: "How to migrate your existing V1 nodes to the new V3 schema."
---

## Overview

The ComfyUI V3 schema introduces a more organized way of defining nodes, and future extensions to node features will only be added to V3 schema. You can use this guide to help you migrate your existing V1 nodes to the new V3 schema.

## Core Concepts

The V3 schema is kept on the new versioned Comfy API, meaning future revisions to the schema will be backwards compatible. ```comfy_api.latest``` will point to the latest numbered API that is still under development; the version before latest is what can be considered 'stable'. Version ```v0_0_2``` is the current (and first) API version so more changes will be made to it without warning. Once it is considered stable, a new version ```v0_0_3``` will be created for ```latest``` to point at.

```python
# use latest ComfyUI API
from comfy_api.latest import ComfyExtension, io, ui

# use a specific version of ComfyUI API
from comfy_api.v0_0_2 import ComfyExtension, io, ui
```

### V1 vs V3 Architecture

The biggest changes in V3 schema are:
- Inputs and Outputs defined by objects instead of a dictionary.
- The execution method is fixed to the name 'execute' and is a class method.
- ```def comfy_entrypoint()``` function that returns a ComfyExtension object defines exposed nodes instead of NODE_CLASS_MAPPINGS/NODE_DISPLAY_NAME_MAPPINGS 
- Node objects do not expose 'state' - ```def __init__(self)``` will have no effect on what is exposed in the node's functions, as all of them are class methods. The node class is sanitized before execution as well.

#### V1 (Legacy)
```python
class MyNode:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {...}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "my_category"

    def execute(self, ...):
        return (result,)

NODE_CLASS_MAPPINGS = {"MyNode": MyNode}
```

#### V3 (Modern)
```python
from comfy_api.latest import ComfyExtension, io

class MyNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyNode",
            display_name="My Node",
            category="my_category",
            inputs=[...],
            outputs=[...]
        )

    @classmethod
    def execute(cls, ...) -> io.NodeOutput:
        return io.NodeOutput(result)

class MyExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [MyNode]

async def comfy_entrypoint() -> ComfyExtension:
    return MyExtension()
```

## Migration Steps

Going from V1 to V3 should be simple in most cases and is simply a syntax change.

### Step 1: Change Base Class

All V3 Schema nodes should inherit from ```ComfyNode```. Multiple layers of inheritance are okay as long as at the top of the chain there is a ```ComfyNode``` parent.

**V1:**
```python
class Example:
    def __init__(self):
        pass
```

**V3:**
```python
from comfy_api.latest import io

class Example(io.ComfyNode):
    # No __init__ needed
```

### Step 2: Convert INPUT_TYPES to define_schema

Node properties like node id, display name, category, etc. that were assigned in different places in code such as dictionaries and class properties are now kept together via the ```Schema``` class.

The ```define_schema(cls)``` function is expected to return a ```Schema``` object in much the same way INPUT_TYPES(s) worked in V1.

Supported core Input/Output types are stored and documented in ```comfy_api/{version}``` in ```_io.py```, which is namespaced as ```io``` by default. Since Inputs/Outputs are defined by classes now instead of dictionaries or strings, custom types are supported by either defining your own class or using the helper function ```Custom``` in ```io```.

Custom types are elaborated on in a section further below.

A type class has the following properties:
- ```class Input``` for Inputs (i.e. ```Model.Input(...)```)
- ```class Output``` for Outputs (i.e. ```Model.Output(...)```). Note that all types may not support being an output.
- ```Type``` for getting a typehint of the type (i.e. ```Model.Type```). Note that some typehints are just ```any```, which may be updated in the future. These typehints are not enforced and just act as useful documentation.

**V1:**
```python
@classmethod
def INPUT_TYPES(s):
    return {
        "required": {
            "image": ("IMAGE",),
            "int_field": ("INT", {
                "default": 0,
                "min": 0,
                "max": 4096,
                "step": 64,
                "display": "number"
            }),
            "string_field": ("STRING", {
                "multiline": False,
                "default": "Hello"
            }),
            # V1 handling of arbitrary types
            "custom_field": ("MY_CUSTOM_TYPE",),
        },
        "optional": {
            "mask": ("MASK",)
        }
    }
```

**V3:**
```python
@classmethod
def define_schema(cls) -> io.Schema:
    return io.Schema(
        node_id="Example",
        display_name="Example Node",
        category="examples",
        description="Node description here",
        inputs=[
            io.Image.Input("image"),
            io.Int.Input("int_field",
                default=0,
                min=0,
                max=4096,
                step=64,
                display_mode=io.NumberDisplay.number
            ),
            io.String.Input("string_field",
                default="Hello",
                multiline=False
            ),
            # V3 handling of arbitrary types
            io.Custom("my_custom_type").Input("custom_input"),
            io.Mask.Input("mask", optional=True)
        ],
        outputs=[
            io.Image.Output()
        ]
    )
```

### Step 3: Update Execute Method

All execution functions in v3 are named ```execute``` and are class methods.

**V1:**
```python
def test(self, image, string_field, int_field):
    # Process
    image = 1.0 - image
    return (image,)
```

**V3:**
```python
@classmethod
def execute(cls, image, string_field, int_field) -> io.NodeOutput:
    # Process
    image = 1.0 - image

    # Return with optional UI preview
    return io.NodeOutput(image, ui=ui.PreviewImage(image, cls=cls))
```

### Step 4: Convert Node Properties

Here are some examples of property names; see the source code in ```comfy_api.latest._io``` for more details.

| V1 Property | V3 Schema Field | Notes |
|------------|-----------------|-------|
| `RETURN_TYPES` | `outputs` in Schema | List of Output objects |
| `RETURN_NAMES` | `display_name` in Output | Per-output display names |
| `FUNCTION` | Always `execute` | Method name is standardized |
| `CATEGORY` | `category` in Schema | String value |
| `OUTPUT_NODE` | `is_output_node` in Schema | Boolean flag |
| `DEPRECATED` | `is_deprecated` in Schema | Boolean flag |
| `EXPERIMENTAL` | `is_experimental` in Schema | Boolean flag |

### Step 5: Handle Special Methods

The same special methods are supported as in v1, but either lowercased or renamed entirely to be more clear. Their usage remains the same.

#### Validation (V1 → V3)

The input validation function was renamed to ```validate_inputs```.

**V1:**
```python
@classmethod
def VALIDATE_INPUTS(s, **kwargs):
    # Validation logic
    return True
```

**V3:**
```python
@classmethod
def validate_inputs(cls, **kwargs) -> bool | str:
    # Return True if valid, error string if not
    if error_condition:
        return "Error message"
    return True
```

#### Lazy Evaluation (V1 → V3)

The ```check_lazy_status``` function is class method, remains the same otherwise.

**V1:**
```python
def check_lazy_status(self, image, string_field, ...):
    if condition:
        return ["string_field"]
    return []
```

**V3:**
```python
@classmethod
def check_lazy_status(cls, image, string_field, ...):
    if condition:
        return ["string_field"]
    return []
```

#### Cache Control (V1 → V3)

The functionality of cache control remains the same as in V1, but the original name was very misleading as to how it operated.

V1's ```IS_CHANGED``` function signals execution not to trigger rerunning the node if the return value is the SAME as the last time the node was ran.

Thus, the function ```IS_CHANGED``` was renamed to ```fingerprint_inputs```. One of the most common mistakes by developers was thinking if you return ```True```, the node would always re-run. Because ```True``` would always be returned, it would have the opposite effect of only making the node run once and reuse cached values. 

An example of using this function is the LoadImage node. It returns the hash of the selected file, so that if the file changes, the node will be forced to rerun.

**V1:**
```python
@classmethod
def IS_CHANGED(s, **kwargs):
    return "unique_value"
```

**V3:**
```python
@classmethod
def fingerprint_inputs(cls, **kwargs):
    return "unique_value"
```

### Step 6: Create Extension and Entry Point

Instead of defining dictionaries to link node id to node class/display name, there is now a ```ComfyExtension``` class and an expected ```comfy_entrypoint``` function to be defined.

In the future, more functions may be added to ComfyExtension to register more than just nodes via ```get_node_list```.

```comfy_entrypoint``` can be either async or not, but ```get_node_list``` must be defined as async.

**V1:**
```python
NODE_CLASS_MAPPINGS = {
    "Example": Example
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Example": "Example Node"
}
```

**V3:**
```python
from comfy_api.latest import ComfyExtension

class MyExtension(ComfyExtension):
    # must be declared as async
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            Example,
            # Add more nodes here
        ]

# can be declared async or not, both will work
async def comfy_entrypoint() -> MyExtension:
    return MyExtension()
```

## Input Type Reference

Already explained in step 2, but here are some type reference comparisons in V1 vs V3. See ```comfy_api.latest._io``` for the full type declarations.

### Basic Types

| V1 Type | V3 Type | Example |
|---------|---------|---------|
| `"INT"` | `io.Int.Input()` | `io.Int.Input("count", default=1, min=0, max=100)` |
| `"FLOAT"` | `io.Float.Input()` | `io.Float.Input("strength", default=1.0, min=0.0, max=10.0)` |
| `"STRING"` | `io.String.Input()` | `io.String.Input("text", multiline=True)` |
| `"BOOLEAN"` | `io.Boolean.Input()` | `io.Boolean.Input("enabled", default=True)` |

#### control_after_generate

Int and Combo inputs support a `control_after_generate` parameter that adds a control widget for automatically changing the value after each generation. In V1 this was a plain `bool`; in V3 you can use the `io.ControlAfterGenerate` enum for explicit control. Passing `True` is equivalent to `io.ControlAfterGenerate.randomize`.

| Value | Behavior |
|-------|----------|
| `io.ControlAfterGenerate.fixed` | Value stays the same after each generation. |
| `io.ControlAfterGenerate.increment` | Value increments by the step after each generation. |
| `io.ControlAfterGenerate.decrement` | Value decrements by the step after each generation. |
| `io.ControlAfterGenerate.randomize` | Value is randomized after each generation. |

```python
# Enable the control widget (user picks the mode in the UI)
io.Int.Input("seed", default=0, min=0, max=0xFFFFFFFFFFFFFFFF, control_after_generate=True)

# Set a specific default mode
io.Int.Input("seed", default=0, min=0, max=0xFFFFFFFFFFFFFFFF,
    control_after_generate=io.ControlAfterGenerate.randomize)
```

### ComfyUI Types

| V1 Type | V3 Type | Example |
|---------|---------|---------|
| `"IMAGE"` | `io.Image.Input()` | `io.Image.Input("image", tooltip="Input image")` |
| `"MASK"` | `io.Mask.Input()` | `io.Mask.Input("mask", optional=True)` |
| `"LATENT"` | `io.Latent.Input()` | `io.Latent.Input("latent")` |
| `"CONDITIONING"` | `io.Conditioning.Input()` | `io.Conditioning.Input("positive")` |
| `"MODEL"` | `io.Model.Input()` | `io.Model.Input("model")` |
| `"VAE"` | `io.VAE.Input()` | `io.VAE.Input("vae")` |
| `"CLIP"` | `io.CLIP.Input()` | `io.CLIP.Input("clip")` |

### Combo (Dropdowns/Selection Lists)

Combo types in V3 require explicit class definition.

**V1:**
```python
"mode": (["option1", "option2", "option3"],)
```

**V3:**
```python
io.Combo.Input("mode", options=["option1", "option2", "option3"])
```

## Schema Reference

The ```Schema``` dataclass defines all properties of a V3 node. Here is a complete reference of all available fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `node_id` | `str` | *required* | Globally unique ID of the node. Custom nodes should add a prefix/postfix to avoid clashes. |
| `display_name` | `str` | `None` | Display name shown in the UI. Falls back to `node_id` if not set. |
| `category` | `str` | `"sd"` | Category in the "Add Node" menu (e.g. `"image/transform"`). |
| `description` | `str` | `""` | Tooltip shown when hovering over the node. |
| `inputs` | `list[Input]` | `[]` | List of input definitions. |
| `outputs` | `list[Output]` | `[]` | List of output definitions. |
| `hidden` | `list[Hidden]` | `[]` | List of hidden inputs to request (see [Hidden Inputs](#hidden-inputs)). |
| `search_aliases` | `list[str]` | `[]` | Alternative names for search. Useful for synonyms or old names after renaming. |
| `is_output_node` | `bool` | `False` | Marks the node as an output node, causing it and its dependencies to be executed. |
| `is_input_list` | `bool` | `False` | When True, all inputs become `list[type]` regardless of how many items are passed in. |
| `is_deprecated` | `bool` | `False` | Flags the node as deprecated, signaling users to find alternatives. |
| `is_experimental` | `bool` | `False` | Flags the node as experimental, warning users it may change. |
| `is_dev_only` | `bool` | `False` | Hides the node from search/menus unless dev mode is enabled. |
| `is_api_node` | `bool` | `False` | Flags the node as an API node for Comfy API services. |
| `not_idempotent` | `bool` | `False` | When True, the node will always re-run and never reuse cached outputs from a different identical node in the graph. |
| `enable_expand` | `bool` | `False` | Allows `NodeOutput` to include an `expand` property for node expansion. |
| `accept_all_inputs` | `bool` | `False` | When True, all inputs from the prompt are passed as kwargs, even if not defined in the schema. |

### Common Input Parameters

All input types share these base parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | `str` | *required* | Unique identifier for the input, used as the kwarg name in `execute`. |
| `display_name` | `str` | `None` | Label shown in the UI. Defaults to `id`. |
| `optional` | `bool` | `False` | Whether the input is optional. |
| `tooltip` | `str` | `None` | Hover tooltip text. |
| `lazy` | `bool` | `None` | Marks input for lazy evaluation (see [Lazy Evaluation](#lazy-evaluation-v1--v3)). |
| `raw_link` | `bool` | `None` | When True, passes the raw link info instead of the resolved value. |
| `advanced` | `bool` | `None` | When True, the input is hidden behind an "Advanced" toggle in the UI. |

Widget inputs (Int, Float, String, Boolean, Combo) additionally support:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `default` | varies | `None` | Default value for the widget. |
| `socketless` | `bool` | `None` | When True, hides the input socket (widget only, no incoming connections). |
| `force_input` | `bool` | `None` | When True, forces the widget to display as a socket input instead. |

## Advanced Features

### Hidden Inputs

Hidden inputs provide access to execution context like the prompt metadata, node ID, and other internal values. They are not visible in the UI.

In V1, hidden inputs were declared as a `"hidden"` key in `INPUT_TYPES`. In V3, they are declared via the `hidden` parameter on the Schema, and their values are accessed via `cls.hidden`.

**V1:**
```python
@classmethod
def INPUT_TYPES(s):
    return {
        "required": {...},
        "hidden": {
            "unique_id": "UNIQUE_ID",
            "prompt": "PROMPT",
            "extra_pnginfo": "EXTRA_PNGINFO",
        }
    }

def execute(self, unique_id, prompt, extra_pnginfo, ...):
    # hidden values passed as regular arguments
    print(unique_id)
```

**V3:**
```python
@classmethod
def define_schema(cls) -> io.Schema:
    return io.Schema(
        node_id="MyNode",
        inputs=[...],
        hidden=[io.Hidden.unique_id, io.Hidden.prompt, io.Hidden.extra_pnginfo],
    )

@classmethod
def execute(cls, ...) -> io.NodeOutput:
    # hidden values accessed via cls.hidden
    print(cls.hidden.unique_id)
    print(cls.hidden.prompt)
    print(cls.hidden.extra_pnginfo)
```

Available hidden values:

| Hidden Enum | Description |
|-------------|-------------|
| `io.Hidden.unique_id` | The unique identifier of the node, matching the id on the client side. |
| `io.Hidden.prompt` | The complete prompt sent by the client. |
| `io.Hidden.extra_pnginfo` | Dictionary copied into metadata of saved `.png` files. |
| `io.Hidden.dynprompt` | Instance of `DynamicPrompt` that may mutate during execution. |
| `io.Hidden.auth_token_comfy_org` | Token acquired from signing into a ComfyOrg account on the frontend. |
| `io.Hidden.api_key_comfy_org` | API key generated by ComfyOrg, allows skipping frontend sign-in. |

<Note>
Some hidden values are automatically added based on Schema flags. Output nodes (`is_output_node=True`) automatically receive `prompt` and `extra_pnginfo`. API nodes (`is_api_node=True`) automatically receive auth tokens.
</Note>

### UI Helpers

V3 provides built-in UI helpers in the `ui` module to handle common patterns like previewing and saving files. Pass them to `io.NodeOutput` via the `ui` parameter.

#### Preview Helpers

Preview helpers save temporary files and return UI data for in-node display.

```python
from comfy_api.latest import ui

# Preview an image in the node
return io.NodeOutput(images, ui=ui.PreviewImage(images, cls=cls))

# Preview a mask (automatically converts to 3-channel for display)
return io.NodeOutput(mask, ui=ui.PreviewMask(mask, cls=cls))

# Preview audio
return io.NodeOutput(audio, ui=ui.PreviewAudio(audio, cls=cls))

# Preview text
return io.NodeOutput(ui=ui.PreviewText("Some text value"))

# Preview 3D model
return io.NodeOutput(ui=ui.PreviewUI3D(model_file, camera_info))
```

#### Save Helpers

Save helpers provide methods for saving files to the output directory with proper metadata embedding. They are typically used in output nodes.

```python
from comfy_api.latest import ui, io

# Save images and return UI data (most common pattern)
return io.NodeOutput(
    ui=ui.ImageSaveHelper.get_save_images_ui(
        images=images,
        filename_prefix=filename_prefix,
        cls=cls,  # passes hidden prompt/extra_pnginfo for metadata
    )
)

# Save animated PNG
return io.NodeOutput(
    ui=ui.ImageSaveHelper.get_save_animated_png_ui(
        images=images,
        filename_prefix=filename_prefix,
        cls=cls,
        fps=6.0,
        compress_level=4,
    )
)

# Save animated WebP
return io.NodeOutput(
    ui=ui.ImageSaveHelper.get_save_animated_webp_ui(
        images=images,
        filename_prefix=filename_prefix,
        cls=cls,
        fps=6.0,
        lossless=True,
        quality=80,
        method=4,
    )
)

# Save audio (supports flac, mp3, opus)
return io.NodeOutput(
    ui=ui.AudioSaveHelper.get_save_audio_ui(
        audio=audio,
        filename_prefix=filename_prefix,
        cls=cls,
        format="flac",
    )
)
```

<Tip>
Passing `cls=cls` to save/preview helpers allows them to automatically embed workflow metadata (prompt, extra_pnginfo) in the saved files. Make sure to include `io.Hidden.prompt` and `io.Hidden.extra_pnginfo` in your schema's hidden list, or set `is_output_node=True` which adds them automatically.
</Tip>

#### Returning Raw UI Dicts

If you need to return UI data that doesn't have a helper, you can pass a dict directly:

```python
return io.NodeOutput(ui={"images": results})
```

### Output Nodes

For nodes that produce side effects (like saving files). Same as in V1, marking a node as output will display a `run` play button in the node's context window, allowing for partial execution of the graph.

```python
@classmethod
def define_schema(cls) -> io.Schema:
    return io.Schema(
        node_id="SaveNode",
        inputs=[...],
        outputs=[],  # Does not need to be empty.
        is_output_node=True  # Mark as output node
    )
```

### Custom Types

Create custom input/output types either via class definition or the ```Custom``` helper function.

```python
from comfy_api.latest import io

# Method 1: Using decorator with class
@io.comfytype(io_type="MY_CUSTOM_TYPE")
class MyCustomType:
    Type = torch.Tensor  # Python type hint

    class Input(io.Input):
        def __init__(self, id: str, **kwargs):
            super().__init__(id, **kwargs)

    class Output(io.Output):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)

# Method 2: Using Custom helper
# The helper can be used directly without saving to a variable first for convenience as well
MyCustomType = io.Custom("MY_CUSTOM_TYPE")
```

### MultiType Inputs

`MultiType` allows an input to accept more than one type. This is useful when a node can operate on different data types through the same input slot.

If the first argument (`id`) is an instance of an `Input` class instead of a string, that input will be used to create a widget with its overridden values. Otherwise, the input is socket-only.

```python
# Socket-only multi-type input (no widget)
io.MultiType.Input("input", types=[io.Image, io.Mask])

# Multi-type input with a widget fallback (String widget shown when nothing is connected)
io.MultiType.Input(
    io.String.Input("model_file", default="", multiline=False),
    types=[io.File3DGLB, io.File3DGLTF, io.File3DOBJ],
    tooltip="3D model file or path string",
)
```

### MatchType (Generic Type Matching)

`MatchType` creates type-linked inputs and outputs. When a user connects a specific type to a MatchType input, all other inputs and outputs sharing the same template automatically constrain to that type. This is how nodes like Switch and Create List work with any type.

```python
@classmethod
def define_schema(cls):
    # Create a template - all inputs/outputs sharing the same template will match types
    template = io.MatchType.Template("switch")
    return io.Schema(
        node_id="SwitchNode",
        display_name="Switch",
        category="logic",
        inputs=[
            io.Boolean.Input("switch"),
            io.MatchType.Input("on_false", template=template, lazy=True),
            io.MatchType.Input("on_true", template=template, lazy=True),
        ],
        outputs=[
            io.MatchType.Output(template=template, display_name="output"),
        ],
    )
```

You can also restrict which types are allowed:

```python
# Only allow Image, Mask, or Latent types
template = io.MatchType.Template("input_type", allowed_types=[io.Image, io.Mask, io.Latent])
```

### Dynamic Inputs

V3 introduces dynamic input types that change the available inputs based on user interaction. There is no V1 equivalent for these features.

#### Autogrow

`Autogrow` creates a variable number of inputs that automatically grow as the user connects more. There are two template types:

**TemplatePrefix** generates inputs with a numbered prefix (e.g. `image0`, `image1`, `image2`...):

```python
@classmethod
def define_schema(cls):
    autogrow_template = io.Autogrow.TemplatePrefix(
        input=io.Image.Input("image"),  # template for each input
        prefix="image",                  # prefix for generated input names
        min=2,                           # minimum number of inputs shown
        max=50,                          # maximum number of inputs allowed
    )
    return io.Schema(
        node_id="BatchImagesNode",
        display_name="Batch Images",
        category="image",
        inputs=[io.Autogrow.Input("images", template=autogrow_template)],
        outputs=[io.Image.Output()],
    )

@classmethod
def execute(cls, images: io.Autogrow.Type) -> io.NodeOutput:
    # 'images' is a dict mapping input names to their values
    image_list = list(images.values())
    return io.NodeOutput(batch(image_list))
```

**TemplateNames** generates inputs with specific names:

```python
template = io.Autogrow.TemplateNames(
    input=io.Float.Input("float"),
    names=["x", "y", "z"],  # explicit names for each input
    min=1,                    # minimum number of inputs shown
)
```

Autogrow can be combined with MatchType to create lists of type-matched inputs:

```python
@classmethod
def define_schema(cls):
    template_matchtype = io.MatchType.Template("type")
    template_autogrow = io.Autogrow.TemplatePrefix(
        input=io.MatchType.Input("input", template=template_matchtype),
        prefix="input",
    )
    return io.Schema(
        node_id="CreateList",
        display_name="Create List",
        category="logic",
        is_input_list=True,
        inputs=[io.Autogrow.Input("inputs", template=template_autogrow)],
        outputs=[
            io.MatchType.Output(
                template=template_matchtype,
                is_output_list=True,
                display_name="list",
            ),
        ],
    )
```

#### DynamicCombo

`DynamicCombo` creates a dropdown that shows/hides different inputs depending on the selected option. This is useful for nodes where different modes require different parameters.

```python
@classmethod
def define_schema(cls):
    return io.Schema(
        node_id="ResizeNode",
        display_name="Resize",
        category="transform",
        inputs=[
            io.Image.Input("image"),
            io.DynamicCombo.Input("resize_type", options=[
                io.DynamicCombo.Option("scale by dimensions", [
                    io.Int.Input("width", default=512, min=0, max=8192),
                    io.Int.Input("height", default=512, min=0, max=8192),
                ]),
                io.DynamicCombo.Option("scale by multiplier", [
                    io.Float.Input("multiplier", default=1.0, min=0.01, max=8.0),
                ]),
                io.DynamicCombo.Option("scale to megapixels", [
                    io.Float.Input("megapixels", default=1.0, min=0.01, max=16.0),
                ]),
            ]),
        ],
        outputs=[io.Image.Output()],
    )

@classmethod
def execute(cls, image, resize_type: dict) -> io.NodeOutput:
    # resize_type is a dict containing the selected option key and its inputs
    selected = resize_type["resize_type"]
    if selected == "scale by dimensions":
        width = resize_type["width"]
        height = resize_type["height"]
        # ...
    elif selected == "scale by multiplier":
        multiplier = resize_type["multiplier"]
        # ...
```

DynamicCombo options can also be nested:

```python
io.DynamicCombo.Input("combo", options=[
    io.DynamicCombo.Option("option1", [io.String.Input("string")]),
    io.DynamicCombo.Option("option2", [
        io.DynamicCombo.Input("subcombo", options=[
            io.DynamicCombo.Option("sub_opt1", [io.Float.Input("x"), io.Float.Input("y")]),
            io.DynamicCombo.Option("sub_opt2", [io.Mask.Input("mask", optional=True)]),
        ])
    ]),
])
```

### Async Execute

V3 supports async `execute` methods. This is useful for nodes that perform I/O operations, API calls, or other async work. Simply declare `execute` as `async`:

```python
@classmethod
async def execute(cls, prompt, **kwargs) -> io.NodeOutput:
    result = await some_async_operation(prompt)
    return io.NodeOutput(result)
```

### ComfyAPI

The `ComfyAPI` class provides access to ComfyUI runtime services like progress reporting and node replacement registration. Import it and create an instance:

```python
from comfy_api.latest import ComfyAPI

api = ComfyAPI()
```

#### Progress Reporting

Report execution progress from within a node's `execute` method. The progress bar is displayed in the ComfyUI interface. This replaces the V1 pattern of using `comfy.utils.PROGRESS_BAR_HOOK`.

```python
from comfy_api.latest import ComfyAPI

api = ComfyAPI()

@classmethod
async def execute(cls, images, **kwargs) -> io.NodeOutput:
    total = len(images)
    for i, image in enumerate(images):
        process(image)
        await api.execution.set_progress(
            value=i + 1,
            max_value=total,
            preview_image=image,  # optional: show preview during progress
        )
    return io.NodeOutput(result)
```

<Note>
`set_progress` can accept a PIL Image, an `ImageInput` tensor, or `None` for the `preview_image` parameter. When called from within `execute`, the `node_id` is automatically determined from the executing context.
</Note>

#### Node Replacement

Node replacement allows mapping old/deprecated nodes to new ones, so existing workflows automatically upgrade. Register replacements using the `ComfyAPI` in your extension's `on_load` method.

```python
from comfy_api.latest import ComfyAPI, ComfyExtension, io

api = ComfyAPI()

class MyExtension(ComfyExtension):
    async def on_load(self) -> None:
        await api.node_replacement.register(io.NodeReplace(
            new_node_id="MyNewNode",
            old_node_id="MyOldNode",
            old_widget_ids=["param1", "param2"],  # ordered widget IDs for positional mapping
            input_mapping=[
                {"new_id": "image", "old_id": "input_image"},       # rename input
                {"new_id": "method", "set_value": "lanczos"},       # set a fixed value
            ],
            output_mapping=[
                {"new_idx": 0, "old_idx": 0},  # map output by index
            ],
        ))

    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [MyNewNode]
```

The `old_widget_ids` parameter is important: workflow JSON stores widget values by position index, not by name. This list maps those positional indexes to input IDs so the replacement system can correctly identify widget values during migration.

For nodes using dynamic inputs (like Autogrow), use dotted paths in the mapping:

```python
input_mapping=[
    {"new_id": "images.image0", "old_id": "image1"},
    {"new_id": "images.image1", "old_id": "image2"},
]
```

### Extension Lifecycle

The `ComfyExtension` class supports lifecycle hooks beyond just `get_node_list`:

```python
from comfy_api.latest import ComfyExtension, io

class MyExtension(ComfyExtension):
    async def on_load(self) -> None:
        """Called when the extension is loaded.
        Use for one-time initialization: registering node replacements,
        setting up global resources, etc.
        """
        pass

    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        """Return the list of node classes this extension provides."""
        return [MyNode]

async def comfy_entrypoint() -> MyExtension:
    return MyExtension()
```

### NodeOutput

The `NodeOutput` class is the standardized return value from `execute`. It supports several patterns:

```python
# Return a single output value
return io.NodeOutput(image)

# Return multiple output values (order matches outputs list in schema)
return io.NodeOutput(width, height, batch_size)

# Return only UI data (no output values)
return io.NodeOutput(ui=ui.PreviewImage(images, cls=cls))

# Return both output values and UI data
return io.NodeOutput(image, ui=ui.PreviewImage(image, cls=cls))

# Return None/empty (for nodes with no outputs)
return io.NodeOutput()
```

## Complete Example

Here is a complete example of a V3 extension file with multiple nodes:

```python
from comfy_api.latest import ComfyExtension, io, ui

class InvertImage(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MyPack_InvertImage",  # prefixed to avoid clashes
            display_name="Invert Image",
            category="my_pack/image",
            description="Inverts the colors of an image.",
            inputs=[
                io.Image.Input("image"),
            ],
            outputs=[
                io.Image.Output(display_name="inverted"),
            ],
        )

    @classmethod
    def execute(cls, image) -> io.NodeOutput:
        inverted = 1.0 - image
        return io.NodeOutput(inverted, ui=ui.PreviewImage(inverted, cls=cls))


class SaveImage(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MyPack_SaveImage",
            display_name="Save Image",
            category="my_pack/image",
            is_output_node=True,
            inputs=[
                io.Image.Input("images"),
                io.String.Input("filename_prefix", default="ComfyUI"),
            ],
            outputs=[],
        )

    @classmethod
    def execute(cls, images, filename_prefix) -> io.NodeOutput:
        return io.NodeOutput(
            ui=ui.ImageSaveHelper.get_save_images_ui(
                images=images,
                filename_prefix=filename_prefix,
                cls=cls,
            )
        )


class MyPackExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [InvertImage, SaveImage]

async def comfy_entrypoint() -> MyPackExtension:
    return MyPackExtension()
```
