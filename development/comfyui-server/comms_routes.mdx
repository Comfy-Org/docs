---
title: "Routes"
---

## Routes

The server defines a series of `get` and `post` methods 
which can be found by searching for `@routes` in `server.py`. When you submit a workflow
in the web client, it is posted to `/prompt` which validates the prompt and adds it to an execution queue,
returning either a `prompt_id` and `number` (the position in the queue), or `error` and `node_errors` if validation fails.
The prompt queue is defined in `execution.py`, which also defines the `PromptExecutor` class. 

### Built in routes

`server.py` defines the following routes:

#### Core API Routes

| path                           | get/post/ws | purpose                                                                   |
| ------------------------------ | ----------- | ------------------------------------------------------------------------- |
| `/`                            | get         | load the comfy webpage                                                    |
| `/ws`                          | websocket   | WebSocket endpoint for real-time communication with the server            |
| `/embeddings`                  | get         | retrieve a list of the names of embeddings available                      |
| `/extensions`                  | get         | retrieve a list of the extensions registering a `WEB_DIRECTORY`           |
| `/features`                    | get         | retrieve server features and capabilities                                 |
| `/models`                      | get         | retrieve a list of available model types                                  |
| `/models/{folder}`             | get         | retrieve models in a specific folder                                      |
| `/workflow_templates`          | get         | retrieve a map of custom node modules and associated template workflows   |
| `/upload/image`                | post        | upload an image                                                           |
| `/upload/mask`                 | post        | upload a mask                                                             |
| `/view`                        | get         | view an image. Lots of options, see `@routes.get("/view")` in `server.py` |
| `/view_metadata`/{folder_name} | get         | retrieve metadata for a model                                             |
| `/system_stats`                | get         | retrieve information about the system (python version, devices, vram etc) |
| `/prompt`                      | get         | retrieve current queue status and execution information                   |
| `/prompt`                      | post        | submit a prompt to the queue                                              |
| `/object_info`                 | get         | retrieve details of all node types                                        |
| `/object_info/{node_class}`    | get         | retrieve details of one node type                                         |
| `/history`                     | get         | retrieve the queue history                                                |
| `/history/{prompt_id}`         | get         | retrieve the queue history for a specific prompt                          |
| `/history`                     | post        | clear history or delete history item                                      |
| `/queue`                       | get         | retrieve the current state of the execution queue                         |
| `/queue`                       | post        | manage queue operations (clear pending/running)                           |
| `/interrupt`                   | post        | stop the current workflow execution                                       |
| `/free`                        | post        | free memory by unloading specified models                                 |
| `/userdata`                    | get         | list user data files in a specified directory                             |
| `/v2/userdata`                 | get         | enhanced version that lists files and directories in structured format    |
| `/userdata/{file}`             | get         | retrieve a specific user data file                                        |
| `/userdata/{file}`             | post        | upload or update a user data file                                         |
| `/userdata/{file}`             | delete      | delete a specific user data file                                          |
| `/userdata/{file}/move/{dest}` | post        | move or rename a user data file                                           |
| `/users`                       | get         | get user information                                                      |
| `/users`                       | post        | create a new user (multi-user mode only)                                  |

### WebSocket Communication

The `/ws` endpoint provides real-time bidirectional communication between the client and server. This is used for:
- Receiving execution progress updates
- Getting node execution status in real-time
- Receiving error messages and debugging information
- Live updates when queue status changes

The WebSocket connection sends JSON messages with different types such as:
- `status` - Overall system status updates
- `execution_start` - When a prompt execution begins
- `execution_cached` - When cached results are used
- `executing` - Updates during node execution
- `progress` - Progress updates for long-running operations
- `executed` - When a node completes execution

### Custom routes

If you want to send a message from the client to the server during execution, you will need to add a custom route to the server.
For anything complicated, you will need to dive into the [aiohttp framework docs](https://docs.aiohttp.org/), but most cases can 
be handled as follows:

```Python
from server import PromptServer
from aiohttp import web
routes = PromptServer.instance.routes
@routes.post('/my_new_path')
async def my_function(request):
    the_data = await request.post()
    # the_data now holds a dictionary of the values sent
    MyClass.handle_my_message(the_data)
    return web.json_response({})
```

<Tip>Unless you know what you are doing, don't try to define `my_function` within a class. 
The `@routes.post` decorator does a lot of work! Instead, define the function as above
and then call a classmethod.</Tip>

<Tip>You can also define a `@routes.get` if you aren't changing anything.</Tip>

The client can use this new route by sending a `FormData` object with code something like this,
which would result in `the_data`, in the above code, containing `message` and `node_id` keys:

```Javascript
import { api } from "../../scripts/api.js";
function send_message(node_id, message) {
    const body = new FormData();
    body.append('message',message);
    body.append('node_id', node_id);
    api.fetchApi("/my_new_path", { method: "POST", body, });
}
```