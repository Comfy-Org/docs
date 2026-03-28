---
title: "ComfyUI MCP Server"
description: "Connect AI agents to Comfy Cloud for image generation via the Model Context Protocol (MCP)"
---

import GetApiKey from '/snippets/get-api-key.mdx'

<Warning>
  **Research Preview:** The ComfyUI MCP Server is currently in limited early access. Features, tools, and behavior may change as the project evolves. Interested? [Sign up for the waitlist](https://form.typeform.com/to/hHmvw1UH).
</Warning>

The ComfyUI MCP Server connects AI assistants — including Claude Desktop, Claude Code, and Cursor — to [Comfy Cloud](https://cloud.comfy.org) via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). It lets AI agents generate images, search models/nodes/templates, and run full ComfyUI workflows on cloud GPUs, with no local GPU required.

## Quick Start

### 1. Get Your API Key

<GetApiKey />

### 2. Connect Your Client

The ComfyUI MCP Server is hosted at `https://cloud.comfy.org/mcp`. No local installation or Node.js required — just point your MCP client at the server URL with your API key.

<Tabs>
  <Tab title="Claude Code">
    ```bash
    claude mcp add comfyui-cloud \
      --transport http \
      https://cloud.comfy.org/mcp \
      -H "X-API-Key: your-api-key-here"
    ```
  </Tab>

  <Tab title="Claude Desktop">
    Add the following to your Claude Desktop config file:

    | OS | Config path |
    |:---|:------------|
    | macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
    | Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
    | Linux | `~/.config/Claude/claude_desktop_config.json` |

    ```json
    {
      "mcpServers": {
        "comfyui-cloud": {
          "url": "https://cloud.comfy.org/mcp",
          "headers": {
            "X-API-Key": "your-api-key-here"
          }
        }
      }
    }
    ```
  </Tab>

  <Tab title="Cursor">
    Add the following to your Cursor MCP config (`.cursor/mcp.json` in your project or global config):

    ```json
    {
      "mcpServers": {
        "comfyui-cloud": {
          "url": "https://cloud.comfy.org/mcp",
          "headers": {
            "X-API-Key": "your-api-key-here"
          }
        }
      }
    }
    ```

    See [Cursor's MCP documentation](https://docs.cursor.com/context/model-context-protocol) for more details.
  </Tab>
</Tabs>

<Info>
  After adding the server, restart your MCP client to pick up the new configuration.
</Info>

---

## Available Tools

### Discovery

| Tool | Description |
|:-----|:------------|
| `search_templates` | Search pre-built workflow templates from [comfy.org](https://comfy.org/workflows) by text, tag, media type, or model |
| `search_models` | Search model catalog by text, type, base model, or source |
| `search_nodes` | Search available nodes by text, category, or input/output types |

### Execution

| Tool | Description |
|:-----|:------------|
| `submit_workflow` | Submit a ComfyUI API-format workflow for execution on Comfy Cloud |
| `upload_file` | Upload an input image or file for use in workflows (e.g. LoadImage) |
| `get_job_status` | Poll execution status of a submitted workflow |
| `get_output` | Retrieve output images, videos, or audio from a completed workflow |
| `use_previous_output` | Chain workflows by reusing the output of one as input to another |
| `cancel_job` | Cancel a pending or running job |
| `get_queue` | Check how many jobs are running and pending |

### Saved Workflows

| Tool | Description |
|:-----|:------------|
| `list_saved_workflows` | Browse your saved workflows from Comfy Cloud |
| `get_saved_workflow` | Inspect a saved workflow's nodes, inputs, and configuration |

<Info>
  The server checks for a matching pre-built template before building a workflow from scratch, leading to better results and faster generation.
</Info>

---

## How It Works

```
┌──────────────┐    HTTPS/MCP    ┌─────────────────────────────────────────────┐
│  AI Agent    │◄───────────────►│            Comfy Cloud                      │
│  (Claude,    │   X-API-Key     │  cloud.comfy.org/mcp → Workflow Execution   │
│   Cursor)    │                 │                        on Cloud GPUs        │
└──────────────┘                 └─────────────────────────────────────────────┘
```

Your AI agent connects directly to the hosted MCP server at `cloud.comfy.org/mcp`. The server translates MCP tool calls into workflow executions on Comfy Cloud GPUs — no local server or GPU required.

The AI agent uses the discovery tools to find templates and nodes, then constructs the ComfyUI API-format workflow JSON, submits it, and returns the results — just describe what you want in natural language.

---

## Example Prompts

After installing, try these prompts in your AI assistant:

```
Generate an image of a cat astronaut floating in space, cartoon style
```

```
Find me workflow templates for text-to-video generation
```

```
Search for SDXL checkpoint models and tell me which ones are available
```

```
Generate a fantasy landscape with mountains and a glowing river at sunset
```

```
What nodes are available for image upscaling?
```

The agent will search for a matching template, build the ComfyUI workflow, submit it to Comfy Cloud, and return the generated image directly in the conversation.

---

## Output Handling

- **Images** are displayed inline in the conversation (Claude Code) or in the artifact side panel (Claude Desktop)
- **Video and audio** outputs are returned as downloadable links
- **Animated images** (GIF, WebP) are saved but not previewed inline to preserve animation
- Inline image previews are resized to 1024px for efficient display; full-resolution outputs are always available via the `get_output` tool

---

## Known Limitations

<Warning>
  This is an early release. The following limitations are known and being actively worked on.
</Warning>

**Workflows**
- **Cannot run saved workflows by ID.** You can browse and inspect saved workflows (`list_saved_workflows`, `get_saved_workflow`), but not execute them directly. Saved workflows use the ComfyUI graph format, which requires conversion to API format. The AI agent must reconstruct the workflow from scratch.
- **Generated assets have no workflow metadata.** Images created via the MCP server don't include workflow JSON in their metadata, so they won't show the workflow when opened in ComfyUI.
- **Workflow accuracy depends on the AI.** The agent constructs ComfyUI workflows from natural language. Complex multi-node workflows or unusual node configurations may require iteration.

**File Handling**
- **Upload size limits** may apply depending on your MCP client.
- **Image previews are resized.** Inline previews are limited to 1024px (JPEG). Full-resolution files are saved to disk.

**Authentication**
- **API key only.** Authentication requires a Comfy Cloud API key passed via the `X-API-Key` header. Browser-based OAuth is not yet available.

**Client-Specific**
- **Claude Desktop** — Generated images appear in the artifact side panel via HTML, not as native image artifacts.

---

## Troubleshooting

### MCP server not showing up

Restart your MCP client (close and reopen Claude Code, Claude Desktop, or Cursor). MCP servers are loaded at startup. Double-check that the server URL is exactly `https://cloud.comfy.org/mcp` in your config.

### API key errors

Verify your API key is valid at [platform.comfy.org/profile/api-keys](https://platform.comfy.org/profile/api-keys). Make sure the key is passed in the `X-API-Key` header (not as a Bearer token). Generate a new key if needed and update your client config.

### Connection errors

If the MCP client can't reach the server, check that:
1. You have an active internet connection
2. Your firewall or proxy isn't blocking `cloud.comfy.org`
3. You have an active [Comfy Cloud subscription](https://www.comfy.org/cloud/pricing?utm_source=docs&utm_campaign=cloud-api)
