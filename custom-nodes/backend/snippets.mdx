---
title: "Annotated Examples"
---

A growing collection of fragments of example code...

## Images and Masks

### Load an image

Load an image into a batch of size 1 (based on `LoadImage` source code in `nodes.py`)
```python
i = Image.open(image_path)
i = ImageOps.exif_transpose(i)
if i.mode == 'I':
    i = i.point(lambda i: i * (1 / 255))
image = i.convert("RGB")
image = np.array(image).astype(np.float32) / 255.0
image = torch.from_numpy(image)[None,]
```

### Save an image batch

Save a batch of images (based on `SaveImage` source code in `nodes.py`)
```python     
for (batch_number, image) in enumerate(images):
    i = 255. * image.cpu().numpy()
    img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
    filepath = # some path that takes the batch number into account
    img.save(filepath)
```

### Invert a mask

Inverting a mask is a straightforward process. Since masks are normalised to the range [0,1]:

```python
mask = 1.0 - mask
```

### Convert a mask to Image shape

```Python
# We want [B,H,W,C] with C = 1
if len(mask.shape)==2: # we have [H,W], so insert B and C as dimension 1
    mask = mask[None,:,:,None]
elif len(mask.shape)==3 and mask.shape[2]==1: # we have [H,W,C]
    mask = mask[None,:,:,:]
elif len(mask.shape)==3:                      # we have [B,H,W]
    mask = mask[:,:,:,None]
```

### Using Masks as Transparency Layers

When used for tasks like inpainting or segmentation, the MASK's values will eventually be rounded to the nearest integer so that they are binary — 0 indicating regions to be ignored and 1 indicating regions to be targeted. However, this doesn't happen until the MASK is passed to those nodes. This flexibility allows you to use MASKs as you would in digital photography contexts as a transparency layer:

```python
# Invert mask back to original transparency layer
mask = 1.0 - mask

# Unsqueeze the `C` (channels) dimension
mask = mask.unsqueeze(-1)

# Concatenate ("cat") along the `C` dimension
rgba_image = torch.cat((rgb_image, mask), dim=-1)
```

## Noise

### Creating noise variations

Here's an example of creating a noise object which mixes the noise from two sources. This could be used to create slight noise variations by varying `weight2`.

```python
class Noise_MixedNoise:
    def __init__(self, nosie1, noise2, weight2):
        self.noise1  = noise1
        self.noise2  = noise2
        self.weight2 = weight2

    @property
    def seed(self): return self.noise1.seed

    def generate_noise(self, input_latent:torch.Tensor) -> torch.Tensor:
        noise1 = self.noise1.generate_noise(input_latent)
        noise2 = self.noise2.generate_noise(input_latent)
        return noise1 * (1.0-self.weight2) + noise2 * (self.weight2)
```