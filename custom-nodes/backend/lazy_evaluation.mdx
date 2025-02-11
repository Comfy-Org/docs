---
title: "Lazy Evaluation"
---

## Lazy Evaluation

By default, all `required` and `optional` inputs are evaluated before a node can be run. Sometimes, however, an
input won't necessarily be used and evaluating it would result in unnecessary processing. Here are some examples
of nodes where lazy evaluation may be beneficial:
1. A `ModelMergeSimple` node where the ratio is either `0.0` (in which case the first model doesn't need to be loaded)
or `1.0` (in which case the second model doesn't need to be loaded).
2. Interpolation between two images where the ratio (or mask) is either entirely `0.0` or entirely `1.0`.
3. A Switch node where one input determines which of the other inputs will be passed through.

<Tip>There is very little cost in making an input lazy. If it's something you can do, you generally should.</Tip>

### Creating Lazy Inputs

There are two steps to making an input a "lazy" input. They are:

1. Mark the input as lazy in the dictionary returned by `INPUT_TYPES`
2. Define a method named `check_lazy_status` (note: *not* a class method) that will be called prior to evaluation to determine if any more inputs are necessary.

To demonstrate these, we'll make a "MixImages" node that interpolates between two images according to a mask. If the entire mask is `0.0`, we don't need to evaluate any part of the tree leading up to the second image. If the entire mask is `1.0`, we can skip evaluating the first image.

#### Defining `INPUT_TYPES`

Declaring that an input is lazy is as simple as adding a `lazy: True` key-value pair to the input's options dictionary.

```python
@classmethod
def INPUT_TYPES(cls):
    return {
        "required": {
            "image1": ("IMAGE",{"lazy": True}),
            "image2": ("IMAGE",{"lazy": True}),
            "mask": ("MASK",),
        },
    }
```

In this example, `image1` and `image2` are both marked as lazy inputs, but `mask` will always be evaluated.

#### Defining `check_lazy_status`

A `check_lazy_status` method is called if there are one or more lazy inputs that are not yet available. This method receives the same arguments as the standard execution function. All available inputs are passed in with their final values while unavailable lazy inputs have a value of `None`.

The responsibility of the `check_lazy_status` function is to return a list of the names of any lazy inputs that are needed to proceed. If all lazy inputs are available, the function should return an empty list.

Note that `check_lazy_status` may be called multiple times. (For example, you might find after evaluating one lazy input that you need to evaluate another.)

<Tip>Note that because the function uses actual input values, it is *not* a class method.</Tip>
```python
def check_lazy_status(self, mask, image1, image2):
    mask_min = mask.min()
    mask_max = mask.max()
    needed = []
    if image1 is None and (mask_min != 1.0 or mask_max != 1.0):
        needed.append("image1")
    if image2 is None and (mask_min != 0.0 or mask_max != 0.0):
        needed.append("image2")
    return needed
```

### Full Example


```python
class LazyMixImages:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image1": ("IMAGE",{"lazy": True}),
                "image2": ("IMAGE",{"lazy": True}),
                "mask": ("MASK",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "mix"

    CATEGORY = "Examples"

    def check_lazy_status(self, mask, image1, image2):
        mask_min = mask.min()
        mask_max = mask.max()
        needed = []
        if image1 is None and (mask_min != 1.0 or mask_max != 1.0):
            needed.append("image1")
        if image2 is None and (mask_min != 0.0 or mask_max != 0.0):
            needed.append("image2")
        return needed

    # Not trying to handle different batch sizes here just to keep the demo simple
    def mix(self, mask, image1, image2):
        mask_min = mask.min()
        mask_max = mask.max()
        if mask_min == 0.0 and mask_max == 0.0:
            return (image1,)
        elif mask_min == 1.0 and mask_max == 1.0:
            return (image2,)

        result = image1 * (1. - mask) + image2 * mask,
        return (result[0],)
```

## Execution Blocking

While Lazy Evaluation is the recommended way to "disable" part of a graph, there are times when you want to disable an `OUTPUT` node that doesn't implement lazy evaluation itself. If it's an output node that you developed yourself, you should just add lazy evaluation as follows:

1. Add a required (if this is a new node) or optional (if you care about backward compatibility) input for `enabled` that defaults to `True`
2. Make all other inputs `lazy` inputs
3. Only evaluate the other inputs if `enabled` is `True`

If it's not a node you control, you can make use of a `comfy_execution.graph.ExecutionBlocker`. This special object can be returned as an output from any socket. Any nodes which receive an `ExecutionBlocker` as input will skip execution and return that `ExecutionBlocker` for any outputs.

<Tip>**There is intentionally no way to stop an ExecutionBlocker from propagating forward.** If you think you want this, you should really be using Lazy Evaluation.</Tip>

### Usage

There are two ways to construct and use an `ExecutionBlocker`

1. Pass `None` into the constructor to silently block execution. This is useful for cases where blocking execution is part of a successful run -- like disabling an output.
```python
def silent_passthrough(self, passthrough, blocked):
    if blocked:
        return (ExecutionBlocker(None),)
    else:
        return (passthrough,)
```

2. Pass a string into the constructor to display an error message when a node is blocked due to receiving the object. This can be useful if you want to display a meaningful error message if someone uses a meaningless output -- for example, the `VAE` output when loading a model that doesn't contain VAEs.

```python
def load_checkpoint(self, ckpt_name):
    ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
    model, clip, vae = load_checkpoint(ckpt_path)
    if vae is None:
        # This error is more useful than a "'NoneType' has no attribute" error
        # in a later node
        vae = ExecutionBlocker(f"No VAE contained in the loaded model {ckpt_name}")
    return (model, clip, vae)
```

