---
title: "Comfy Objects"
---

## LiteGraph

The Comfy UI is built on top of [LiteGraph](https://github.com/jagenjo/litegraph.js). 
Much of the Comfy functionality is provided by LiteGraph, so if developing more complex
nodes you will probably find it helpful to clone that repository and browse the documentation, 
which can be found at `doc/index.html`.

## ComfyApp

The `app` object (always accessible by `import { app } from "../../scripts/app.js";`) represents the Comfy application running in the browser,
and contains a number of useful properties and functions, some of which are listed below.

<Note>
**Deprecated:** Hijacking/monkey-patching functions on `app` or prototypes is deprecated and subject to change at any point in the near future. Use the official [extension hooks](/custom-nodes/js/javascript_hooks) and [Context Menu API](/custom-nodes/js/context-menu-migration) instead.
</Note>

<Warning>Hijacking functions on `app` is not recommended, as Comfy is under constant development, and core behavior may change.</Warning>

### Properties

Important properties of `app` include (this is not an exhaustive list):

| property        | contents                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvas`        | An LGraphCanvas object, representing the current user interface. It contains some potentially interesting properties, such as `node_over` and `selected_nodes`. |
| `canvasEl`      | The DOM `<canvas>` element                                                                                                                                      |
| `graph`         | A reference to the LGraph object describing the current graph                                                                                                   |
| `runningNodeId` | During execution, the node currently being executed                                                                                                             |
| `ui`            | Provides access to some UI elements, such as the queue, menu, and dialogs                                                                                       |

`canvas` (for graphical elements) and `graph` (for logical connections) are probably the ones you are most likely to want to access. 

### Functions

Again, there are many. A few significant ones are:

| function          | notes                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| graphToPrompt     | Convert the graph into a prompt that can be sent to the Python server |
| loadGraphData     | Load a graph                                                          |
| queuePrompt       | Submit a prompt to the queue                                          |
| registerExtension | You've seen this one - used to add an extension                       |

## LGraph

The `LGraph` object is part of the LiteGraph framework, and represents the current logical state of the graph (nodes and links). 
If you want to manipulate the graph, the LiteGraph documentation (at `doc/index.html` if you clone `https://github.com/jagenjo/litegraph.js`) 
describes the functions you will need.

You can use `graph` to obtain details of nodes and links, for example:

```Javascript
const ComfyNode_object_for_my_node = app.graph._nodes_by_id(my_node_id) 
ComfyNode_object_for_my_node.inputs.forEach(input => {
    const link_id = input.link;
    if (link_id) {
        const LLink_object = app.graph.links[link_id]
        const id_of_upstream_node = LLink_object.origin_id
        // etc
    }
});
```

## LLink

The `LLink` object, accessible through `graph.links`, represents a single link in the graph, from node `link.origin_id` output slot `link.origin_slot`
to node `link.target_id` slot `link.target_slot`. It also has a string representing the data type, in `link.type`, and `link.id`.

`LLink`s are created in the `connect` method of a `LGraphNode` (of which `ComfyNode` is a subclass). 

<Tip>Avoid creating your own LLink objects - use the LiteGraph functions instead.</Tip>

## ComfyNode

`ComfyNode` is a subclass of `LGraphNode`, and the LiteGraph documentation is therefore helpful for more generic
operations. However, Comfy has significantly extended the LiteGraph core behavior, and also does not make 
use of all LiteGraph functionality.

<Tip>The description that follows applies to a normal node. 
Group nodes, primitive nodes, notes, and redirect nodes have different properties.</Tip>

A `ComfyNode` object represents a node in the current workflow. It has a number of important properties 
that you may wish to make use of, a very large number of functions that you may wish to use, or hijack to 
modify behavior.

<Note>
**Deprecated:** Hijacking prototype methods on `ComfyNode` or `LGraphNode` is deprecated and subject to change at any point in the near future. Use the official [extension hooks](/custom-nodes/js/javascript_hooks) where available, such as `getNodeMenuItems` for context menus. See the [Context Menu Migration Guide](/custom-nodes/js/context-menu-migration) for examples.
</Note> 

To get a more complete sense of the node object, you may find it helpful to insert the following
code into your extension and place a breakpoint on the `console.log` command. When you then create a new node
you can use your favorite debugger to interrogate the node.

```Javascript
async nodeCreated(node) {
    console.log("nodeCreated")
}
```

### Properties

| property          | contents                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `bgcolor`         | The background color of the node, or undefined for the default                                                                      |
| `comfyClass`      | The Python class representing the node                                                                                              |
| `flags`           | A dictionary that may contain flags related to the state of the node. In particular, `flags.collapsed` is true for collapsed nodes. |
| `graph`           | A reference to the LGraph object                                                                                                    |
| `id`              | A unique id                                                                                                                         |
| `input_type`      | A list of the input types (eg "STRING", "MODEL", "CLIP" etc). Generally matches the Python INPUT_TYPES                              |
| `inputs`          | A list of inputs (discussed below)                                                                                                  |
| `mode`            | Normally 0, set to 2 if the node is muted and 4 if the node is bypassed. Values of 1 and 3 are not used by Comfy                    |
| `order`           | The node's position in the execution order. Set by `LGraph.computeExecutionOrder()` when the prompt is submitted                    |
| `pos`             | The [x,y] position of the node on the canvas                                                                                        |
| `properties`      | A dictionary containing `"Node name for S&R"`, used by LiteGraph                                                                    |
| `properties_info` | The type and default value of entries in `properties`                                                                               |
| `size`            | The width and height of the node on the canvas                                                                                      |
| `title`           | Display Title                                                                                                                       |
| `type`            | The unique name (from Python) of the node class                                                                                     |
| `widgets`         | A list of widgets (discussed below)                                                                                                 |
| `widgets_values`  | A list of the current values of widgets                                                                                             |


### Functions

There are a very large number of functions (85, last time I counted). A selection are listed below.
Most of these functions are unmodified from the LiteGraph core code. 

#### Inputs, Outputs, Widgets

| function               | notes                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Inputs / Outputs       | Most have output methods with the equivalent names: s/In/Out/                                      |
| `addInput`             | Create a new input, defined by name and type                                                       |
| `addInputs`            | Array version of `addInput`                                                                        |
| `findInputSlot`        | Find the slot index from the input name                                                            |
| `findInputSlotByType`  | Find an input matching the type. Options to prefer, or only use, free slots                        |
| `removeInput`          | By slot index                                                                                      |
| `getInputNode`         | Get the node connected to this input. The output equivalent is `getOutputNodes` and returns a list |
| `getInputLink`         | Get the LLink connected to this input. No output equivalent                                        |
| Widgets                |                                                                                                    |
| `addWidget`            | Add a standard Comfy widget                                                                        |
| `addCustomWidget`      | Add a custom widget (defined in the `getComfyWidgets` hook)                                        |
| `addDOMWidget`         | Add a widget defined by a DOM element                                                              |
| `convertWidgetToInput` | Convert a widget to an input if allowed by `isConvertableWidget` (in `widgetInputs.js`)            |

#### Connections

| function              | notes                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `connect`             | Connect this node's output to another node's input                                                |
| `connectByType`       | Connect output to another node by specifying the type - connects to first available matching slot |
| `connectByTypeOutput` | Connect input to another node output by type                                                      |
| `disconnectInput`     | Remove any link into the input (specified by name or index)                                       |
| `disconnectOutput`    | Disconnect an output from a specified node's input                                                |
| `onConnectionChange`  | Called on each node. `side==1` if it's an input on this node                                      |
| `onConnectInput`      | Called _before_ a connection is made. If this returns `false`, the connection is refused          |

#### Display  

| function           | notes                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `setDirtyCanvas`   | Specify that the foreground (nodes) and/or background (links and images) need to be redrawn            |
| `onDrawBackground` | Called with a `CanvasRenderingContext2D` object to draw the background. Used by Comfy to render images |
| `onDrawForeground` | Called with a `CanvasRenderingContext2D` object to draw the node.                                      |
| `getTitle`         | The title to be displayed.                                                                             |
| `collapse`         | Toggles the collapsed state of the node.                                                               |

<Warning>`collapse` is badly named; it _toggles_ the collapsed state. 
It takes a boolean parameter, which can be used to override 
`node.collapsable === false`.</Warning>

#### Other

| function     | notes                                                              |
| ------------ | ------------------------------------------------------------------ |
| `changeMode` | Use to set the node to bypassed (`mode == 4`) or not (`mode == 0`) |


## Inputs and Widgets

Inputs and Widgets represent the two ways that data can be fed into a node. In general a widget can be 
converted to an input, but not all inputs can be converted to a widget (as many datatypes can't be
entered through a UI element).

`node.inputs` is a list of the current inputs (colored dots on the left hand side of the node),
specifying their `.name`, `.type`, and `.link` (a reference to the connected `LLink` in `app.graph.links`). 

If an input is a widget which has been converted, it also holds a reference to the, now inactive, widget in `.widget`.

`node.widgets` is a list of all widgets, whether or not they have been converted to an input. A widget has:

| property/function | notes                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `callback`        | A function called when the widget value is changed                        |
| `last_y`          | The vertical position of the widget in the node                           |
| `name`            | The (unique within a node) widget name                                    |
| `options`         | As specified in the Python code (such as default, min, and max)           |
| `type`            | The name of the widget type (see below) in lowercase                      |
| `value`           | The current widget value. This is a property with `get` and `set` methods |

### Widget Types

`app.widgets` is a dictionary of currently registered widget types, keyed in the UPPER CASE version of the name of the type. 
Build in Comfy widgets types include the self explanatory `BOOLEAN`, `INT`, and `FLOAT`, 
as well as `STRING` (which comes in two flavours, single line and multiline),
`COMBO` for dropdown selection from a list, and `IMAGEUPLOAD`, used in Load Image nodes.

Custom widget types can be added by providing a `getCustomWidgets` method in your extension.
{/* TODO add link */}

### Linked widgets

Widgets can also be linked - the built in behavior of `seed` and `control_after_generate`, for example. 
A linked widget has `.type = 'base_widget_type:base_widget_name'`; so `control_after_generate` may have
type `int:seed`.

## Prompt

When you press the `Queue Prompt` button in Comfy, the `app.graphToPrompt()` method is called to convert the 
current graph into a prompt that can be sent to the server. 

`app.graphToPrompt` returns an object (referred to herein as `prompt`) with two properties, `output` and `workflow`. 

### output

`prompt.output` maps from the `node_id` of each node in the graph to an object with two properties.

- `prompt.output[node_id].class_type`, the unique name of the custom node class, as defined in the Python code
- `prompt.output[node_id].inputs`, which contains the value of each input (or widget) as a map from the input name to:
    - the selected value, if it is a widget, or
    - an array containing (`upstream_node_id`, `upstream_node_output_slot`) if there is a link connected to the input, or
    - undefined, if it is a widget that has been converted to an input and is not connected
    - other unconnected inputs are not included in `.inputs`

<Tip>Note that the `upstream_node_id` in the array describing a connected input is represented as a string, not an integer.</Tip>

### workflow

`prompt.workflow` contains the following properties:

- `config` - a dictionary of additional configuration options (empty by default)
- `extra` - a dictionary containing extra information about the workflow. By default it contains:
    - `extra.ds` - describes the current view of the graph (`scale` and `offset`)
- `groups` - all groups in the workflow
- `last_link_id` - the id of the last link added 
- `last_node_id` - the id of the last node added
- `links` - a list of all links in the graph. Each entry is an array of five integers and one string:
    - (`link_id`, `upstream_node_id`, `upstream_node_output_slot`, `downstream_node_id`, `downstream_node_input_slot`, `data type`)
- `nodes` - a list of all nodes in the graph. Each entry is a map of a subset of the properties of the node as described [above](#comfynode)
    - The following properties are included: `flags`, `id`, `inputs`, `mode`, `order`, `pos`, `properties`, `size`, `type`, `widgets_values`
    - In addition, unless a node has no outputs, there is an `outputs` property, which is a list of the outputs of the node, each of which contains:
        - `name` - the name of the output
        - `type` - the data type of the output
        - `links` - a list of the `link_id` of all links from this output (if there are no connections, may be an empty list, or null), 
        - `shape` - the shape used to draw the output (default 3 for a dot)
        - `slot_index` - the slot number of the output
- `version` - the LiteGraph version number (at time of writing, `0.4`)

<Tip>`nodes.output` is absent for nodes with no outputs, not an empty list.</Tip>
