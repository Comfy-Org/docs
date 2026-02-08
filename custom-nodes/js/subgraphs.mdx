---
title: "Subgraphs"
description: "Working with subgraphs in ComfyUI extensions: node IDs, graph traversal, events, widget promotion, and cleanup."
---

## Overview

Subgraphs let users group nodes into reusable, nestable components. Each subgraph is its own `LGraph` with a UUID. For the user-facing guide, see [Subgraphs](/interface/features/subgraph).

## Node Identifiers

ComfyUI uses three distinct node identifier types. Using the wrong one causes silent failures.

| Type | Format | Used for |
|------|--------|----------|
| `node.id` | `42` (number) | Local to its immediate graph level. `graph.getNodeById(id)` |
| Execution ID | `"1:2:3"` (colon-separated string) | Backend progress messages, `UNIQUE_ID` |
| Locator ID | `"<uuid>:<localId>"` or `"<localId>"` | UI state: badges, errors, images |

To construct a node's locator ID from within an extension:

```javascript
function getLocatorId(node) {
  const graphId = node.graph?.id
  return graphId ? `${graphId}:${node.id}` : String(node.id)
}
```

## Traversing Nodes

### Current layer only

```javascript
for (const node of app.graph.nodes) {
  console.log(node.id, node.type)
}
```

### All nodes recursively

To walk into nested subgraphs, use a recursive helper that calls a callback on every node:

```javascript
function walkGraph(graph, callback) {
  for (const node of graph.nodes ?? []) {
    callback(node, graph)
    if (node.subgraph) walkGraph(node.subgraph, callback)
  }
}
```

Full example:

```javascript
import { app } from "../../scripts/app.js"

function walkGraph(graph, callback) {
  for (const node of graph.nodes ?? []) {
    callback(node, graph)
    if (node.subgraph) walkGraph(node.subgraph, callback)
  }
}

app.registerExtension({
  name: "MyExtension.SubgraphWalker",
  async afterConfigureGraph() {
    walkGraph(app.graph, (node, graph) => {
      console.log(`[${graph.id ?? "root"}] node ${node.id}: ${node.type}`)
    })
  }
})
```

## Root vs Active Graph

| You want to... | Use |
|-----------------|-----|
| Operate on all nodes in the workflow | `app.graph` (root) |
| Operate on only the visible layer | `app.canvas?.graph` |
| Access a specific subgraph | `someNode.subgraph` |

```javascript
// All nodes (including nested subgraphs)
walkGraph(app.graph, (node) => { /* ... */ })

// Only nodes the user currently sees
for (const node of app.canvas?.graph?.nodes ?? []) { /* ... */ }
```

## Events

### Subgraph-level events

Dispatched on `subgraph.events`:

| Event | Payload | When |
|-------|---------|------|
| `widget-promoted` | `{ widget, subgraphNode }` | Widget promoted to parent node |
| `widget-demoted` | `{ widget, subgraphNode }` | Widget removed from parent node |
| `input-added` | `{ input }` | Input slot added |
| `removing-input` | `{ input, index }` | Input slot being removed |
| `output-added` | `{ output }` | Output slot added |
| `removing-output` | `{ output, index }` | Output slot being removed |
| `renaming-input` | `{ input, index, oldName, newName }` | Input slot renamed |
| `renaming-output` | `{ output, index, oldName, newName }` | Output slot renamed |

### Canvas-level events

Dispatched on `app.canvas.canvas` (the HTML canvas element):

| Event | Payload | When |
|-------|---------|------|
| `subgraph-opened` | `{ subgraph, closingGraph, fromNode }` | User navigates into a subgraph |
| `subgraph-converted` | `{ subgraphNode }` | Selection converted to a subgraph |

### Listening pattern

```javascript
import { app } from "../../scripts/app.js"

app.registerExtension({
  name: "MyExtension.SubgraphEvents",
  async setup() {
    app.canvas.canvas.addEventListener("subgraph-opened", (e) => {
      const { subgraph, fromNode } = e.detail
      console.log(`Opened subgraph from node ${fromNode.id}`)
    })
  }
})
```

## Widget Promotion

When a `SubgraphInput` connects to a widget inside a subgraph, a copy of that widget appears on the parent subgraph node. This fires `widget-promoted`. Removing the connection fires `widget-demoted`.

<Warning>
Widget promotion behavior is still evolving and may change in future releases.
</Warning>

```javascript
import { app } from "../../scripts/app.js"

function walkGraph(graph, callback) {
  for (const node of graph.nodes ?? []) {
    callback(node, graph)
    if (node.subgraph) walkGraph(node.subgraph, callback)
  }
}

app.registerExtension({
  name: "MyExtension.WidgetPromotion",
  async afterConfigureGraph() {
    walkGraph(app.graph, (node) => {
      if (!node.subgraph) return
      if (node._promCleanup) node._promCleanup.abort()
      const controller = new AbortController()
      node._promCleanup = controller
      const { signal } = controller

      node.subgraph.events.addEventListener("widget-promoted", (e) => {
        console.log(`Widget "${e.detail.widget.name}" promoted`)
      }, { signal })

      node.subgraph.events.addEventListener("widget-demoted", (e) => {
        console.log(`Widget "${e.detail.widget.name}" demoted`)
      }, { signal })

      const origRemoved = node.onRemoved
      node.onRemoved = function () {
        controller.abort()
        origRemoved?.apply(this, arguments)
      }
    })
  }
})
```

## Cleanup

Use an `AbortController` to clean up all event listeners when a node is removed.

```javascript
import { app } from "../../scripts/app.js"

app.registerExtension({
  name: "MyExtension.Cleanup",
  async nodeCreated(node) {
    if (!node.subgraph) return

    const controller = new AbortController()
    const { signal } = controller

    node.subgraph.events.addEventListener("input-added", (e) => {
      console.log(`Input added: ${e.detail.input.name}`)
    }, { signal })

    node.subgraph.events.addEventListener("removing-input", (e) => {
      console.log(`Input removing: ${e.detail.input.name}`)
    }, { signal })

    const origRemoved = node.onRemoved
    node.onRemoved = function () {
      controller.abort()
      origRemoved?.apply(this, arguments)
    }
  }
})
```

<Tip>
`onRemoved` can also fire during subgraph conversion, not just deletion. Guard teardown logic if you need to preserve state across restructuring.
</Tip>

## See Also

- [Subgraphs (User Guide)](/interface/features/subgraph)
- [Extension Hooks](/custom-nodes/js/javascript_hooks)
