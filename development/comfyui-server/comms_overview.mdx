---
title: "Server Overview"
description: "Run ComfyUI as a server and interact with it programmatically via REST and WebSocket APIs"
---

ComfyUI runs as an HTTP server on your machine by default. You can call it programmatically to submit workflows, upload files, download outputs, and monitor progress — all without opening the browser.

## Starting the Server

When you launch ComfyUI, it automatically starts an HTTP server at `http://127.0.0.1:8188`.

To run ComfyUI as a headless server (no browser):

<CodeGroup>
```bash
# Run without opening the browser
python main.py --disable-auto-launch
```

```bash
# Specify a custom port
python main.py --port 8288
```

```bash
# Listen on all network interfaces (for remote access)
python main.py --listen 0.0.0.0
```
</CodeGroup>

<Tip>
  For a full list of startup flags, run `python main.py --help` or see the [Startup Flags reference](/development/comfyui-server/startup-flags).
</Tip>

## Key Pages in This Section

<CardGroup cols={2}>
  <Card title="Startup Flags" icon="terminal" href="/development/comfyui-server/startup-flags">
    Complete reference for all main.py command-line arguments.
  </Card>
  <Card title="API Routes" icon="route" href="/development/comfyui-server/comms_routes">
    Available HTTP endpoints for submitting workflows, uploading files, and querying status.
  </Card>
  <Card title="API Examples" icon="code" href="/development/comfyui-server/api-examples">
    Code examples for calling the API: HTTP-only, WebSocket + History, and SaveImageWebsocket.
  </Card>
  <Card title="Server Messages" icon="comments" href="/development/comfyui-server/comms_messages">
    WebSocket message types the server sends to the client during execution.
  </Card>
  <Card title="Execution Model Inversion" icon="code-branch" href="/development/comfyui-server/execution_model_inversion_guide">
    Advanced: invert execution for custom control flows.
  </Card>
</CardGroup>

## Using Partner Nodes

If your workflow contains paid Partner Nodes, you can include your API key in the payload. See the [Partner Node API Integration](/development/comfyui-server/api-key-integration) guide for details.

---

## How the Server Works

The Comfy server runs on top of the [aiohttp framework](https://docs.aiohttp.org/), which in turn uses [asyncio](https://pypi.org/project/asyncio/).

Messages from the server to the client are sent by socket messages through the `send_sync` method of the server, which is an instance of `PromptServer` (defined in `server.py`). They are processed by a socket event listener registered in `api.js`. See [messages](/development/comfyui-server/comms_messages).

Messages from the client to the server are sent by the `api.fetchApi()` method defined in `api.js`, and are handled by HTTP routes defined by the server. See [routes](/development/comfyui-server/comms_routes).

<Tip>
  The client submits the whole workflow (widget values and all) when you queue a request.
  The server does not receive any changes you make after you send a request to the queue.
  If you want to modify server behavior during execution, you'll need routes.
</Tip>
