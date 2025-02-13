---
title: "Images, Latents, and Masks"
---

When working with these datatypes, you will need to know about the `torch.Tensor` class. 
Complete documentation is [here](https://pytorch.org/docs/stable/tensors.html), or 
an introduction to the key concepts required for Comfy [here](./tensors).

<Warning>If your node has a single output which is a tensor, remember to return `(image,)` not `(image)`</Warning>

Most of the concepts below are illustrated in the [example code snippets](./snippets).

## Images

An IMAGE is a `torch.Tensor` with shape `[B,H,W,C]`, `C=3`. If you are going to save or load images, you will 
need to convert to and from `PIL.Image` format - see the code snippets below! Note that some `pytorch` operations
offer (or expect) `[B,C,H,W]`, known as 'channel first', for reasons of computational efficiency. Just be careful.

### Working with PIL.Image

If you want to load and save images, you'll want to use PIL:
```python
from PIL import Image, ImageOps
```

## Masks

A MASK is a `torch.Tensor` with shape `[B,H,W]`. 
In many contexts, masks have binary values (0 or 1), which are used to indicate which pixels should undergo specific operations. 
In some cases values between 0 and 1 are used indicate an extent of masking, (for instance, to alter transparency, adjust filters, or composite layers). 

### Masks from the Load Image Node

The `LoadImage` node uses an image's alpha channel (the "A" in "RGBA") to create MASKs. 
The values from the alpha channel are normalized to the range [0,1] (torch.float32) and then inverted. 
The `LoadImage` node always produces a MASK output when loading an image. Many images (like JPEGs) don't have an alpha channel. 
In these cases, `LoadImage` creates a default mask with the shape `[1, 64, 64]`.

### Understanding Mask Shapes

In libraries like `numpy`, `PIL`, and many others, single-channel images (like masks) are typically represented as 2D arrays, shape `[H,W]`.
This means the `C` (channel) dimension is implicit, and thus unlike IMAGE types, batches of MASKs have only three dimensions: `[B, H, W]`. 
It is not uncommon to encounter a mask which has had the `B` dimension implicitly squeezed, giving a tensor `[H,W]`.

To use a MASK, you will often have to match shapes by unsqueezing to produce a shape `[B,H,W,C]` with `C=1`
To unsqueezing the `C` dimension, so you should `unsqueeze(-1)`, to unsqueeze `B`, you `unsqueeze(0)`. 
If your node receives a MASK as input, you would be wise to always check `len(mask.shape)`. 

## Latents

A LATENT is a `dict`; the latent sample is referenced by the key `samples` and has shape `[B,C,H,W]`, with `C=4`.

<Tip>LATENT is channel first, IMAGE is channel last</Tip>

