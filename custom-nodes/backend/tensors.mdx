---
title: "Working with torch.Tensor"
---

## pytorch, tensors, and torch.Tensor 

All the core number crunching in Comfy is done by [pytorch](https://pytorch.org/). If your custom nodes are going
to get into the guts of stable diffusion you will need to become familiar with this library, which is way beyond
the scope of this introduction.

However, many custom nodes will need to manipulate images, latents and masks, each of which are represented internally
as `torch.Tensor`, so you'll want to bookmark the 
[documentation for torch.Tensor](https://pytorch.org/docs/stable/tensors.html).

### What is a Tensor?

`torch.Tensor` represents a tensor, which is the mathematical generalization of a vector or matrix to any number of dimensions.
A tensor's _rank_ is the number of dimensions it has (so a vector has _rank_ 1, a matrix _rank_ 2); its _shape_ describes the
size of each dimension. 

So an RGB image (of height H and width W) might be thought of as three arrays (one for each color channel), each measuring H x W,
which could be represented as a tensor with _shape_ `[H,W,3]`. In Comfy images almost always come in a batch (even if the batch
only contains a single image). `torch` always places the batch dimension first, so Comfy images have _shape_ `[B,H,W,3]`, generally
written as `[B,H,W,C]` where C stands for Channels.

### squeeze, unsqueeze, and reshape

If a tensor has a dimension of size 1 (known as a collapsed dimension), it is equivalent to the same tensor with that dimension removed
(a batch with 1 image is just an image). Removing such a collapsed dimension is referred to as squeezing, and
inserting one is known as unsqueezing. 

<Warning>Some torch code, and some custom node authors, will return a squeezed tensor when a dimension is collapsed - such 
as when a batch has only one member. This is a common cause of bugs!</Warning>

To represent the same data in a different shape is referred to as reshaping. This often requires you to know
the underlying data structure, so handle with care!

### Important notation

`torch.Tensor` supports most Python slice notation, iteration, and other common list-like operations. A tensor 
also has a `.shape` attribute which returns its size as a `torch.Size` (which is a subclass of `tuple` and can 
be treated as such).

There are some other important bits of notation you'll often see (several of these are less common
standard Python notation, seen much more frequently when dealing with tensors)

- `torch.Tensor` supports the use of `None` in slice notation
to indicate the insertion of a dimension of size 1. 

- `:` is frequently used when slicing a tensor; this simply means 'keep the whole dimension'. 
It's like using `a[start:end]` in Python, but omitting the start point and end point.

- `...` represents 'the whole of an unspecified number of dimensions'. So `a[0, ...]` would extract the first
item from a batch regardless of the number of dimensions.

- in methods which require a shape to be passed, it is often passed as a `tuple` of the dimensions, in 
which a single dimension can be given the size `-1`, indicating that the size of this dimension should
be calculated based on the total size of the data.

```python
>>> a = torch.Tensor((1,2))
>>> a.shape
torch.Size([2])
>>> a[:,None].shape 
torch.Size([2, 1])
>>> a.reshape((1,-1)).shape
torch.Size([1, 2])
```

### Elementwise operations

Many binary on `torch.Tensor` (including '+', '-', '*', '/' and '==') are applied elementwise (independently applied to each element). 
The operands must be _either_ two tensors of the same shape, _or_ a tensor and a scalar. So:

```python
>>> import torch
>>> a = torch.Tensor((1,2))
>>> b = torch.Tensor((3,2))
>>> a*b
tensor([3., 4.])
>>> a/b
tensor([0.3333, 1.0000])
>>> a==b
tensor([False,  True])
>>> a==1
tensor([ True, False])
>>> c = torch.Tensor((3,2,1)) 
>>> a==c
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
RuntimeError: The size of tensor a (2) must match the size of tensor b (3) at non-singleton dimension 0
```

### Tensor truthiness

<Warning>The 'truthiness' value of a Tensor is not the same as that of Python lists.</Warning>

You may be familiar with the truthy value of a Python list as `True` for any non-empty list, and `False` for `None` or `[]`. 
By contrast A `torch.Tensor` (with more than one elements) does not have a defined truthy value. Instead you need to use
`.all()` or `.any()` to combine the elementwise truthiness:

```python
>>> a = torch.Tensor((1,2))
>>> print("yes" if a else "no")
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
RuntimeError: Boolean value of Tensor with more than one value is ambiguous
>>> a.all()
tensor(False)
>>> a.any()
tensor(True)
```

This also means that you need to use `if a is not None:` not `if a:` to determine if a tensor variable has been set.
