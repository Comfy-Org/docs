---
title: "Hidden and Flexible inputs"
---

## Hidden inputs

Alongside the `required` and `optional` inputs, which create corresponding inputs or widgets on the client-side,
there are three `hidden` input options which allow the custom node to request certain information from the server.

These are accessed by returning a value for `hidden` in the `INPUT_TYPES` `dict`, with the signature `dict[str,str]`,
containing one or more of `PROMPT`, `EXTRA_PNGINFO`, or `UNIQUE_ID`

```python
@classmethod
def INPUT_TYPES(s):
    return {
        "required": {...},
        "optional": {...},
        "hidden": {
            "unique_id": "UNIQUE_ID",
            "prompt": "PROMPT", 
            "extra_pnginfo": "EXTRA_PNGINFO",
        }
    }
```

### UNIQUE_ID 
`UNIQUE_ID` is the unique identifier of the node, and matches the `id` property of the node on the client side. 
It is commonly used in client-server communications (see [messages](/development/comfyui-server/comms_messages#getting-node-id)).

### PROMPT
`PROMPT` is the complete prompt sent by the client to the server. 
See [the prompt object](/custom-nodes/js/javascript_objects_and_hijacking#prompt) for a full description.

### EXTRA_PNGINFO
`EXTRA_PNGINFO` is a dictionary that will be copied into the metadata of any `.png` files saved. Custom nodes can store additional
information in this dictionary for saving (or as a way to communicate with a downstream node).

<Tip>Note that if Comfy is started with the `disable_metadata` option, this data won't be saved.</Tip>

### DYNPROMPT
`DYNPROMPT` is an instance of `comfy_execution.graph.DynamicPrompt`. It differs from `PROMPT` in that it may mutate during the course of execution in response to [Node Expansion](/custom-nodes/backend/expansion).
<Tip>`DYNPROMPT` should only be used for advanced cases (like implementing loops in custom nodes).</Tip>

## Flexible inputs

### Custom datatypes

If you want to pass data between your own custom nodes, you may find it helpful to define a custom datatype. This is (almost) as simple as 
just choosing a name for the datatype, which should be a unique string in upper case, such as `CHEESE`.

You can then use `CHEESE` in your node `INPUT_TYPES` and `RETURN_TYPES`, and the Comfy client will only allow `CHEESE` outputs to connect to a `CHEESE` input. 
`CHEESE` can be any python object.

The only point to note is that because the Comfy client doesn't know about `CHEESE` you need (unless you define a custom widget for `CHEESE`, 
which is a topic for another day), to force it to be an input rather than a widget. This can be done with the `forceInput` option in the input options dictionary:

```python
@classmethod
def INPUT_TYPES(s):
    return {
        "required": { "my_cheese": ("CHEESE", {"forceInput":True}) }
    }
```

### Wildcard inputs

```python
@classmethod
def INPUT_TYPES(s):
    return {
        "required": { "anything": ("*",{})},
    }

@classmethod
def VALIDATE_INPUTS(s, input_types):
    return True
```

The frontend allows `*` to indicate that an input can be connected to any source. Because this is not officially supported by the backend, you can skip the backend validation of types by accepting a parameter named `input_types` in your `VALIDATE_INPUTS` function. (See [VALIDATE_INPUTS](./server_overview#validate-inputs) for more information.)
It's up to the node to make sense of the data that is passed.

### Dynamically created inputs

If inputs are dynamically created on the client side, they can't be defined in the Python source code.
In order to access this data we need an `optional` dictionary that allows Comfy to pass data with 
arbitrary names. Since the Comfy server 

```python
class ContainsAnyDict(dict):
    def __contains__(self, key):
        return True
...

@classmethod
def INPUT_TYPES(s):
    return {
        "required": {},
        "optional": ContainsAnyDict()
    }
...

def main_method(self, **kwargs):
    # the dynamically created input data will be in the dictionary kwargs

```
<Tip>Hat tip to rgthree for this pythonic trick!</Tip>
