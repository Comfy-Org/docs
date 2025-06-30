---
title: "Messages"
---

## Messages

During execution (or when the state of the queue changes), the `PromptExecutor` sends messages back to the client
through the `send_sync` method of `PromptServer`.

These messages are received by a socket event listener defined in `api.js` (at time of writing around line 90, or search for `this.socket.addEventListener`),
which creates a `CustomEvent` object for any known message type, and dispatches it to any registered listeners.

An extension can register to receive events (normally done in the `setup()` function) following the standard Javascript idiom:

```Javascript
api.addEventListener(message_type, messageHandler);
```

If the `message_type` is not one of the built in ones, it will be added to the list of known message types automatically. The message `messageHandler`
will be called with a `CustomEvent` object, which extends the event raised by the socket to add a `.detail` property, which is a dictionary of
the data sent by the server. So usage is generally along the lines of:

```Javascript
function messageHandler(event) {
    if (event.detail.node == aNodeIdThatIsInteresting) {
        // do something with event.detail.other_things
    }
}
```

### Built in message types

During execution (or when the state of the queue changes), the `PromptExecutor` sends the following messages back to the client
through the `send_sync` method of `PromptServer`. An extension can register as a listener for any of these.

| event                   | when                                                                       | data                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `execution_start`       | When a prompt is about to run                                              | `prompt_id`                                                                                             |
| `execution_error`       | When an error occurs during execution                                      | `prompt_id`, plus additional information                                                                |
| `execution_interrupted` | When execution is stopped by a node raising `InterruptProcessingException` | `prompt_id`, `node_id`, `node_type` and `executed` (a list of executed nodes)                           |
| `execution_cached`      | At the start of execution                                                  | `prompt_id`, `nodes` (a list of nodes which are being skipped because their cached outputs can be used) |
| `execution_success`     | When all nodes from the prompt have been successfully executed             | `prompt_id`, `timestamp`                                                                                |
| `executing`             | When a new node is about to be executed                                    | `node` (node id or `None` to indicate completion), `prompt_id`                                          |
| `executed`              | When a node returns a ui element                                           | `node` (node id), `prompt_id`, `output`                                                                 |
| `progress`              | During execution of a node that implements the required hook               | `node` (node id), `prompt_id`, `value`, `max`                                                           |
| `status`                | When the state of the queue changes                                        | `exec_info`, a dictionary holding `queue_remaining`, the number of entries in the queue                 |

### Using executed

Despite the name, an `executed` message is not sent whenever a node completes execution (unlike `executing`), but only when the node
returns a ui update.

To do this, the main function needs to return a dictionary instead of a tuple:

```python
# at the end of my main method
        return { "ui":a_new_dictionary, "result": the_tuple_of_output_values }
```

`a_new_dictionary` will then be sent as the value of `output` in an `executed` message.
The `result` key can be omitted if the node has no outputs (see, for instance, the code for `SaveImage` in `nodes.py`)

### Custom message types

As indicated above, on the client side, a custom message type can be added simply by registering as a listener for a unique message type name.

```Javascript
api.addEventListener("my.custom.message", messageHandler);
```

On the server, the code is equally simple:

```Python
from server import PromptServer
# then, in your main execution function (normally)
        PromptServer.instance.send_sync("my.custom.message", a_dictionary)
```

#### Getting node\_id

Most of the built-in messages include the current node id in the value of `node`. It's likely that you will want to do the same.

The node\_id is available on the server side through a hidden input, which is obtained with the `hidden` key in the `INPUT_TYPES` dictionary:

```Python
    @classmethod    
    def INPUT_TYPES(s):
        return {"required" : { }, # whatever your required inputs are 
                "hidden": { "node_id": "UNIQUE_ID" } } # Add the hidden key

    def my_main_function(self, required_inputs, node_id):
        # do some things
        PromptServer.instance.send_sync("my.custom.message", {"node": node_id, "other_things": etc})
```