---
title: "Publishing to the Manager"
---

{/*
description: "Understand how to publish a custom node to the ComfyUI Manager database."
*/}


{/*
## What is a custom node?

One of the great powers of Comfy is that its node-based approach allows you to develop new workflows by plugging together the nodes provided in different ways. The built-in nodes provide a wide range of functionality, but you may find that you need a feature not provided by a core node. 

Custom nodes are nodes developed by the community. It allows you to implement new features and share them with the wider community. If you are interested in developing custom nodes, you can read more about it [here](/custom-nodes/overview).

## ComfyUI Manager

While custom nodes can be installed manually, most people use
[ComfyUI Manager](https://github.com/ltdrdata/ComfyUI-Manager) to install them. **ComfyUI Manager** takes care of installing, 
updating, and removing custom nodes, and any dependencies. But it isn't part
of the Comfy core, so you need to manually install it. 

### Installing ComfyUI Manager

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
```

Restart Comfy afterwards. 
See [ComfyUI Manager Install](https://github.com/ltdrdata/ComfyUI-Manager?tab=readme-ov-file#installation) for details or special cases.

*/}

### Using ComfyUI Manager

To make your custom node available through **ComfyUI Manager** you need to save it as a git repository (generally at `github.com`)
and then submit a Pull Request on the **ComfyUI Manager** git, in which you have edited `custom-node-list.json` to add your node.
[More details](https://github.com/ltdrdata/ComfyUI-Manager?tab=readme-ov-file#how-to-register-your-custom-node-into-comfyui-manager).

When a user installs the node, **ComfyUI Manager** will:

<Steps>
<Step title="Git Clone">
git clone the repository, 
</Step>
<Step title="Install Python Dependencies">
install the pip dependencies listed in the custom node repository under `requirements.txt` (if present), 
```
pip install -r requirements.txt
```
<Tip>As is always the case with `pip`, it is possible that your node requirements will be in conflict with other
custom nodes. Don't make your `requirements.txt` any more restrictive than they need to be.</Tip>
</Step>
<Step title="Run Install Script">
execute `install.py`, if it is present in the custom node repository.
<Tip>`install.py` is executed from the root path of the custom node</Tip>
</Step>
</Steps>

### ComfyUI Manager files

As indicated above, there are a number of files and scripts that **ComfyUI Manager** will use to manage the lifecycle of 
a custom node. These are all optional.

- `requirements.txt` - Python dependencies as mentioned above
- `install.py`, `uninstall.py` - executed when the custom node is installed or uninstalled
<Tip>Users can just delete the directory, so you can't rely on `uninstall.py` being run</Tip>
- `disable.py`, `enable.py` - executed when a custom node is disabled or re-enabled 
<Tip>`enable.py` is only run when a disabled node is re-enabled - it should just reverse anything done in `disable.py`</Tip>
<Tip>Disabled custom node subdirectory have `.disabled` appended to their names, and Comfy ignores these modules</Tip>
- `node_list.json` - only required if the custom nodes pattern of NODE_CLASS_MAPPINGS is not conventional.

See the [ComfyUI Manager guide](https://github.com/ltdrdata/ComfyUI-Manager?tab=readme-ov-file#custom-node-support-guide) for official details.
