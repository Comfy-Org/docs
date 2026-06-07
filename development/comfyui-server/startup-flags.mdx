---
title: "Startup Flags"
sidebarTitle: "Startup Flags"
description: "Complete reference for ComfyUI main.py command-line arguments"
icon: "terminal"
---

ComfyUI accepts command-line arguments when started with `python main.py`. This page documents every flag defined in [`comfy/cli_args.py`](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/cli_args.py).

<Note>
  **Windows Portable** users can add flags to the `.bat` launch files (for example, `run_nvidia_gpu.bat`). See the [Windows Portable guide](/installation/comfyui_portable_windows) for details.
</Note>

Run `python main.py --help` in your ComfyUI directory for the built-in help text. Combine multiple flags as needed:

```bash
python main.py --listen 0.0.0.0 --port 8288 --disable-auto-launch --lowvram
```

## Network & Server

| Flag | Default | Description |
|------|---------|-------------|
| `--listen` `[IP]` | `127.0.0.1` | IP address to listen on. Comma-separated list supported (e.g. `127.2.2.2,127.3.3.3`). If provided without a value, defaults to `0.0.0.0,::` (all IPv4 and IPv6 interfaces). |
| `--port` | `8188` | Port to listen on. |
| `--tls-keyfile` `PATH` | — | Path to TLS (SSL) key file. Enables HTTPS. Requires `--tls-certfile`. |
| `--tls-certfile` `PATH` | — | Path to TLS (SSL) certificate file. Enables HTTPS. Requires `--tls-keyfile`. |
| `--enable-cors-header` `[ORIGIN]` | disabled | Enable CORS. Optional origin, or `*` for all origins when no value is given. |
| `--max-upload-size` | `100` | Maximum upload size in MB. |
| `--enable-compress-response-body` | disabled | Enable compressing the HTTP response body. |

<CodeGroup>
```bash
# Listen on all interfaces (LAN access)
python main.py --listen

# Listen on a specific IP
python main.py --listen 0.0.0.0

# Custom port with HTTPS
python main.py --port 8443 --tls-keyfile key.pem --tls-certfile cert.pem
```
</CodeGroup>

## Directories

| Flag | Default | Description |
|------|---------|-------------|
| `--base-directory` `PATH` | ComfyUI root | Base directory for models, custom_nodes, input, output, temp, and user directories. |
| `--extra-model-paths-config` `PATH` | — | Load one or more `extra_model_paths.yaml` files. Can be specified multiple times. |
| `--output-directory` `PATH` | — | Output directory. Overrides `--base-directory`. |
| `--temp-directory` `PATH` | — | Temp directory. Overrides `--base-directory`. |
| `--input-directory` `PATH` | — | Input directory. Overrides `--base-directory`. |
| `--user-directory` `PATH` | — | User directory (absolute path). Overrides `--base-directory`. Path must exist and be readable. |

## Launch & Browser

| Flag | Default | Description |
|------|---------|-------------|
| `--auto-launch` | disabled | Automatically open ComfyUI in the default browser on startup. |
| `--disable-auto-launch` | disabled | Disable auto-launching the browser. |
| `--windows-standalone-build` | disabled | Windows portable build convenience mode. Enables auto-launch on startup (equivalent to `--auto-launch`). |

<Note>
  `--windows-standalone-build` sets `auto_launch` to `true`. `--disable-auto-launch` overrides it. To run as a server without opening a browser, use `--disable-auto-launch`.
</Note>

```bash
# Run server without opening browser
python main.py --disable-auto-launch
```

## Devices & CUDA

| Flag | Default | Description |
|------|---------|-------------|
| `--cuda-device` `DEVICE_ID` | — | CUDA device IDs to use, comma-separated (e.g. `0` or `0,1`). Other devices are hidden. |
| `--default-device` `ID` | — | Default device ID. All other devices remain visible. |
| `--cuda-malloc` | auto (torch 2.0+) | Enable cudaMallocAsync. Mutually exclusive with `--disable-cuda-malloc`. |
| `--disable-cuda-malloc` | — | Disable cudaMallocAsync. Mutually exclusive with `--cuda-malloc`. |
| `--directml` `[DEVICE]` | — | Use torch-directml. Optional device index; defaults to `-1` when no value is given. |
| `--oneapi-device-selector` `STRING` | — | oneAPI device selector string for Intel devices. |

## Precision & Inference

<Note>
  Flags in the **Global**, **UNET**, **VAE**, and **Text Encoder** groups below are mutually exclusive within each group. Only one flag per group can be used at a time.
</Note>

### Global floating point

| Flag | Description |
|------|-------------|
| `--force-fp32` | Force fp32 globally. Report if this improves GPU performance. |
| `--force-fp16` | Force fp16 globally. Also sets `--fp16-unet`. |

### UNET precision

| Flag | Description |
|------|-------------|
| `--fp32-unet` | Run the diffusion model in fp32. |
| `--fp64-unet` | Run the diffusion model in fp64. |
| `--bf16-unet` | Run the diffusion model in bf16. |
| `--fp16-unet` | Run the diffusion model in fp16. |
| `--fp8_e4m3fn-unet` | Store UNet weights in fp8 (e4m3fn). |
| `--fp8_e5m2-unet` | Store UNet weights in fp8 (e5m2). |
| `--fp8_e8m0fnu-unet` | Store UNet weights in fp8 (e8m0fnu). |

### VAE precision

| Flag | Description |
|------|-------------|
| `--fp16-vae` | Run the VAE in fp16. May cause black images. |
| `--fp32-vae` | Run the VAE in full precision fp32. |
| `--bf16-vae` | Run the VAE in bf16. |
| `--cpu-vae` | Run the VAE on the CPU (not mutually exclusive with VAE precision flags). |

### Text encoder precision

| Flag | Description |
|------|-------------|
| `--fp8_e4m3fn-text-enc` | Store text encoder weights in fp8 (e4m3fn). |
| `--fp8_e5m2-text-enc` | Store text encoder weights in fp8 (e5m2). |
| `--fp16-text-enc` | Store text encoder weights in fp16. |
| `--fp32-text-enc` | Store text encoder weights in fp32. |
| `--bf16-text-enc` | Store text encoder weights in bf16. |

### Other inference options

| Flag | Default | Description |
|------|---------|-------------|
| `--fp16-intermediates` | disabled | Experimental: use fp16 for intermediate tensors between nodes instead of fp32. |
| `--force-channels-last` | disabled | Force channels-last memory format during inference. |
| `--supports-fp8-compute` | disabled | Act as if the device supports fp8 compute. |
| `--enable-triton-backend` | disabled | Enable Triton backend in comfy-kitchen. Disabled by default at launch. |

## Preview

| Flag | Default | Description |
|------|---------|-------------|
| `--preview-method` | `none` | Preview method for sampler nodes. Choices: `none`, `auto`, `latent2rgb`, `taesd`. |
| `--preview-size` | `512` | Maximum preview image size in pixels. |

## Cache

<Note>
  Cache mode flags are mutually exclusive. Only one of `--cache-ram`, `--cache-classic`, `--cache-lru`, or `--cache-none` should be used.
</Note>

| Flag | Default | Description |
|------|---------|-------------|
| `--cache-ram` `[GB] [GB]` | enabled (default mode) | RAM pressure caching. First value: active-cache threshold in GB. Optional second value: inactive-cache/pin threshold in GB. When no values given: active = 10% of system RAM (min 2 GB, max 10 GB); inactive = 100% of system RAM (max 96 GB). Accepts at most two values. |
| `--cache-classic` | — | Use the old aggressive caching style. |
| `--cache-lru` `N` | `0` (disabled) | LRU caching with a maximum of N node results cached. May use more RAM/VRAM. |
| `--cache-none` | — | Reduced RAM/VRAM usage; re-executes every node on each run. |

## Attention

<Note>
  Cross-attention method flags are mutually exclusive. Split and quad attention are ignored when xformers is used.
</Note>

| Flag | Description |
|------|-------------|
| `--use-split-cross-attention` | Use split cross attention optimization. |
| `--use-quad-cross-attention` | Use sub-quadratic cross attention optimization. |
| `--use-pytorch-cross-attention` | Use PyTorch 2.0 cross attention. |
| `--use-sage-attention` | Use Sage attention. |
| `--use-flash-attention` | Use FlashAttention. |
| `--disable-xformers` | Disable xformers. |
| `--force-upcast-attention` | Force attention upcasting. Report if this fixes black images. Mutually exclusive with `--dont-upcast-attention`. |
| `--dont-upcast-attention` | Disable all attention upcasting. For debugging only. |

## VRAM & Memory

<Note>
  VRAM mode flags (`--gpu-only`, `--highvram`, `--lowvram`, `--novram`, `--cpu`) are mutually exclusive.
</Note>

| Flag | Default | Description |
|------|---------|-------------|
| `--gpu-only` | — | Store and run everything on the GPU (text encoders, CLIP, etc.). |
| `--highvram` | — | Keep models in GPU memory instead of unloading to CPU after use. |
| `--lowvram` | — | No effect when dynamic VRAM is enabled. Otherwise, runs text encoders on CPU. |
| `--novram` | — | Minimal VRAM usage when `--lowvram` is not enough. |
| `--cpu` | — | Use CPU for everything (slow). |
| `--reserve-vram` `GB` | OS-dependent | VRAM in GB to reserve for the OS and other software. |
| `--async-offload` `[NUM_STREAMS]` | enabled on Nvidia | Async weight offloading. Optional stream count (default: 2). |
| `--disable-async-offload` | — | Disable async weight offloading. |
| `--disable-dynamic-vram` | — | Disable dynamic VRAM; use estimate-based model loading. |
| `--enable-dynamic-vram` | auto on Nvidia | Enable dynamic VRAM on systems where it is not enabled by default. |
| `--fast-disk` | disabled | Prefer disk-backed dynamic loading over unpinned RAM. Useful with fast NVMe. |
| `--force-non-blocking` | disabled | Force non-blocking tensor operations. May help on non-Nvidia systems; can break some workflows. |
| `--disable-smart-memory` | disabled | Aggressively offload to RAM instead of keeping models in VRAM. |
| `--disable-pinned-memory` | disabled | Disable pinned memory use. |
| `--mmap-torch-files` | disabled | Use mmap when loading ckpt/pt files. |
| `--disable-mmap` | disabled | Do not use mmap when loading safetensors. |

## Performance & Debugging

| Flag | Default | Description |
|------|---------|-------------|
| `--fast` `[OPT...]` | disabled | Enable experimental optimizations that may affect quality or stability. `--fast` alone enables all. Specific options: `fp16_accumulation`, `fp8_matrix_mult`, `cublas_ops`, `autotune`. |
| `--deterministic` | disabled | Use slower deterministic PyTorch algorithms where possible. Does not guarantee identical images in all cases. |
| `--default-hashing-function` | `sha256` | Hash function for duplicate filename/content comparison. Choices: `md5`, `sha1`, `sha256`, `sha512`. |

```bash
# Enable all fast optimizations (experimental)
python main.py --fast

# Enable specific optimizations only
python main.py --fast fp16_accumulation cublas_ops
```

## ComfyUI Manager

See [ComfyUI-Manager Installation](/manager/install) for setup instructions.

| Flag | Description |
|------|-------------|
| `--enable-manager` | Enable ComfyUI-Manager. |
| `--disable-manager-ui` | Disable Manager UI and endpoints only. Background tasks (scheduled installs, etc.) continue. Requires `--enable-manager`. |
| `--enable-manager-legacy-ui` | Use the legacy Manager UI. Requires `--enable-manager`. |

## Custom Nodes & API Nodes

| Flag | Default | Description |
|------|---------|-------------|
| `--disable-all-custom-nodes` | disabled | Disable loading all custom nodes. |
| `--whitelist-custom-nodes` `FOLDER...` | — | Custom node folders to load even when `--disable-all-custom-nodes` is set. |
| `--disable-api-nodes` | disabled | Disable API nodes and prevent the frontend from communicating with the internet. |
| `--disable-metadata` | disabled | Disable saving prompt metadata in output files. |

```bash
# Troubleshoot custom node issues
python main.py --disable-all-custom-nodes

# Allow only specific custom nodes
python main.py --disable-all-custom-nodes --whitelist-custom-nodes ComfyUI-Manager
```

## Frontend & API

| Flag | Default | Description |
|------|---------|-------------|
| `--front-end-version` | `comfyanonymous/ComfyUI@latest` | Frontend version in `[owner]/[repo]@[version]` format. Requires internet to download from GitHub releases. Version can be `latest` or a semver (e.g. `1.0.0`). |
| `--front-end-root` `PATH` | — | Local filesystem path to the frontend directory. Overrides `--front-end-version`. |
| `--comfy-api-base` | `https://api.comfy.org` | Base URL for the ComfyUI API. |
| `--database-url` | `sqlite:///<ComfyUI>/user/comfyui.db` | Database URL. Use `sqlite:///:memory:` for in-memory. |
| `--enable-assets` | disabled | Enable the assets system (API routes, database sync, background scanning). |
| `--feature-flag` `KEY[=VALUE]` | — | Set a server feature flag. Bare `KEY` sets true. Can be repeated. Booleans and numbers are auto-converted. |
| `--list-feature-flags` | — | Print known CLI-settable feature flags as JSON and exit. |

```bash
# List available feature flags
python main.py --list-feature-flags

# Set feature flags
python main.py --feature-flag show_signin_button=true
```

## Logging & Misc

| Flag | Default | Description |
|------|---------|-------------|
| `--verbose` `[LEVEL]` | `INFO` | Logging level. Choices: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`. `--verbose` alone sets `DEBUG`. |
| `--log-stdout` | disabled | Send normal process output to stdout instead of stderr. |
| `--dont-print-server` | disabled | Do not print server output to the console. |
| `--multi-user` | disabled | Enable per-user storage. |
| `--quick-test-for-ci` | disabled | Quick startup test for CI. Exits immediately after initialization. |

---

<Note>
  This reference is based on ComfyUI [`comfy/cli_args.py`](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/cli_args.py). When upgrading ComfyUI, run `python main.py --help` or compare your local [`cli_args.py`](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/cli_args.py) against this page to check for new or changed flags.
</Note>
