---
title: "Datatypes"
---

These are the most important built in datatypes. You can also [define your own]( ./more_on_inputs#custom-datatypes).

Datatypes are used on the client side to prevent a workflow from passing the wrong form of data into a node - a bit like strong typing.
The JavaScript client side code will generally not allow a node output to be connected to an input of a different datatype,
although a few exceptions are noted below.

## Comfy datatypes

### COMBO

* No additional parameters in `INPUT_TYPES`

* Python datatype: defined as `list[str]`, output value is `str`

Represents a dropdown menu widget.
Unlike other datatypes, `COMBO` it is not specified in `INPUT_TYPES` by a `str`, but by a `list[str]`
corresponding to the options in the dropdown list, with the first option selected by default.

`COMBO` inputs are often dynamically generated at run time. For instance, in the built-in `CheckpointLoaderSimple` node, you find

```
"ckpt_name": (folder_paths.get_filename_list("checkpoints"), )
```

or they might just be a fixed list of options,

```
"play_sound": (["no","yes"], {}),
```

### Primitive and reroute

Primitive and reroute nodes only exist on the client side. They do not have an intrinsic datatype, but when connected they take on
the datatype of the input or output to which they have been connected (which is why they can't connect to a `*` input...)

## Python datatypes

### INT

* Additional parameters in `INPUT_TYPES`:

  * `default` is required

  * `min` and `max` are optional

* Python datatype `int`

### FLOAT

* Additional parameters in `INPUT_TYPES`:

  * `default` is required

  * `min`, `max`, `step` are optional

* Python datatype `float`

### STRING

* Additional parameters in `INPUT_TYPES`:

  * `default` is required

* Python datatype `str`

### BOOLEAN

* Additional parameters in `INPUT_TYPES`:

  * `default` is required

* Python datatype `bool`

## Tensor datatypes

### IMAGE

* No additional parameters in `INPUT_TYPES`

* Python datatype `torch.Tensor` with *shape* \[B,H,W,C]

A batch of `B` images, height `H`, width `W`, with `C` channels (generally `C=3` for `RGB`).

### LATENT

* No additional parameters in `INPUT_TYPES`

* Python datatype `dict`, containing a `torch.Tensor` with *shape* \[B,C,H,W]

The `dict` passed contains the key `samples`, which is a `torch.Tensor` with *shape* \[B,C,H,W] representing
a batch of `B` latents, with `C` channels (generally `C=4` for existing stable diffusion models), height `H`, width `W`.

The height and width are 1/8 of the corresponding image size (which is the value you set in the Empty Latent Image node).

Other entries in the dictionary contain things like latent masks.

{/* TODO need to dig into this */}

{/* TODO new SD models might have different C values? */}

### MASK

* No additional parameters in `INPUT_TYPES`

* Python datatype `torch.Tensor` with *shape* \[H,W] or \[B,C,H,W]

### AUDIO

* No additional parameters in `INPUT_TYPES`

* Python datatype `dict`, containing a `torch.Tensor` with *shape* \[B, C, T] and a sample rate.

The `dict` passed contains the key `waveform`, which is a `torch.Tensor` with *shape* \[B, C, T] representing a batch of `B` audio samples, with `C` channels (`C=2` for stereo and `C=1` for mono), and `T` time steps (i.e., the number of audio samples).

The `dict` contains another key `sample_rate`, which indicates the sampling rate of the audio.

## Custom Sampling datatypes

### Noise

The `NOISE` datatype represents a *source* of noise (not the actual noise itself). It can be represented by any Python object
that provides a method to generate noise, with the signature `generate_noise(self, input_latent:Tensor) -> Tensor`, and a
property, `seed:Optional[int]`.

<Tip>The `seed` is passed into `sample` guider in the `SamplerCustomAdvanced`, but does not appear to be used in any of the standard guiders.
It is Optional, so you can generally set it to None.</Tip>

When noise is to be added, the latent is passed into this method, which should return a `Tensor` of the same shape containing the noise.

See the [noise mixing example](./snippets#creating-noise-variations)

### Sampler

The `SAMPLER` datatype represents a sampler, which is represented as a Python object providing a `sample` method.
Stable diffusion sampling is beyond the scope of this guide; see `comfy/samplers.py` if you want to dig into this part of the code.

### Sigmas

The `SIGMAS` datatypes represents the values of sigma before and after each step in the sampling process, as produced by a scheduler.
This is represented as a one-dimensional tensor, of length `steps+1`, where each element represents the noise expected to be present
before the corresponding step, with the final value representing the noise present after the final step.

A `normal` scheduler, with 20 steps and denoise of 1, for an SDXL model, produces:

```
tensor([14.6146, 10.7468,  8.0815,  6.2049,  4.8557,  
         3.8654,  3.1238,  2.5572,  2.1157,  1.7648,  
         1.4806,  1.2458,  1.0481,  0.8784,  0.7297,  
         0.5964,  0.4736,  0.3555,  0.2322,  0.0292,  0.0000])
```

<Tip>The starting value of sigma depends on the model, which is why a scheduler node requires a `MODEL` input to produce a SIGMAS output</Tip>

### Guider

A `GUIDER` is a generalisation of the denoising process, as 'guided' by a prompt or any other form of conditioning. In Comfy the guider is
represented by a `callable` Python object providing a `__call__(*args, **kwargs)` method which is called by the sample.

The `__call__` method takes (in `args[0]`) a batch of noisy latents (tensor `[B,C,H,W]`), and returns a prediction of the noise (a tensor of the same shape).

## Model datatypes

There are a number of more technical datatypes for stable diffusion models. The most significant ones are `MODEL`, `CLIP`, `VAE` and `CONDITIONING`.
Working with these is (for the time being) beyond the scope of this guide! {/* TODO but maybe not forever */}

## Additional Parameters

Below is a list of officially supported keys that can be used in the 'extra options' portion of an input definition.

<Warning>You can use additional keys for your own custom widgets, but should *not* reuse any of the keys below for other purposes.</Warning>

{/* TODO -- did I actually get everything? */}

| Key              | Description                                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default`        | The default value of the widget                                                                                                                                                                            |
| `min`            | The minimum value of a number (`FLOAT` or `INT`)                                                                                                                                                           |
| `max`            | The maximum value of a number (`FLOAT` or `INT`)                                                                                                                                                           |
| `step`           | The amount to increment or decrement a widget                                                                                                                                                              |
| `label_on`       | The label to use in the UI when the bool is `True` (`BOOL`)                                                                                                                                                |
| `label_off`      | The label to use in the UI when the bool is `False` (`BOOL`)                                                                                                                                               |
| `defaultInput`   | Defaults to an input socket rather than a supported widget                                                                                                                                                 |
| `forceInput`     | `defaultInput` and also don't allow converting to a widget                                                                                                                                                 |
| `multiline`      | Use a multiline text box (`STRING`)                                                                                                                                                                        |
| `placeholder`    | Placeholder text to display in the UI when empty (`STRING`)                                                                                                                                                |
| `dynamicPrompts` | Causes the front-end to evaluate dynamic prompts                                                                                                                                                           |
| `lazy`           | Declares that this input uses [Lazy Evaluation](./lazy_evaluation)                                                                                                                               |
| `rawLink`        | When a link exists, rather than receiving the evaluated value, you will receive the link (i.e. `["nodeId", <outputIndex>]`). Primarily useful when your node uses [Node Expansion](./expansion). |
