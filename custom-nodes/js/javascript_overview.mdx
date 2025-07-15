---
title: "Javascript Extensions"
---

## Extending the Comfy Client

Comfy can be modified through an extensions mechanism. To add an extension you need to:

- Export `WEB_DIRECTORY` from your Python module, 
- Place one or more `.js` files into that directory,
- Use `app.registerExtension` to register your extension.

These three steps are below. Once you know how to add an extension, look 
through the [hooks](/custom-nodes/js/javascript_hooks) available to get your code called, 
a description of various [Comfy objects](/custom-nodes/js/javascript_objects_and_hijacking) you might need,
or jump straight to some [example code snippets](/custom-nodes/js/javascript_examples).

### Exporting `WEB_DIRECTORY`

The Comfy web client can be extended by creating a subdirectory in your custom node directory, conventionally called `js`, and
exporting `WEB_DIRECTORY` - so your `__init_.py` will include something like:
```python
WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
```

### Including `.js` files

<Tip>All Javascript `.js` files will be loaded by the browser as the Comfy webpage loads. You don't need to specify the file 
your extension is in.</Tip>

_Only_ `.js` files will be added to the webpage. Other resources (such as `.css` files) can be accessed
at `extensions/custom_node_subfolder/the_file.css` and added programmatically.

<Warning>That path does _not_ include the name of the subfolder. The value of `WEB_DIRECTORY` is inserted by the server.</Warning>

### Registering an extension

The basic structure of an extension follows is to import the main Comfy `app` object, and call `app.registerExtension`, 
passing a dictionary that contains a unique `name`, 
and one or more functions to be called by hooks in the Comfy code.

A complete, trivial, and annoying, extension might look like this:
```Javascript
import { app } from "../../scripts/app.js";
app.registerExtension({ 
	name: "a.unique.name.for.a.useless.extension",
	async setup() { 
		alert("Setup complete!")
	},
})
```

