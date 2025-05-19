---
title: "Sidebar Tabs"
---

The Sidebar Tabs API allows extensions to add custom tabs to the sidebar of the ComfyUI interface. This is useful for adding features that require persistent visibility and quick access.

## Basic Usage

```javascript
app.extensionManager.registerSidebarTab({
  id: "customSidebar",
  icon: "pi pi-compass",
  title: "Custom Tab",
  tooltip: "My Custom Sidebar Tab",
  type: "custom",
  render: (el) => {
    el.innerHTML = '<div>This is my custom sidebar content</div>';
  }
});
```

## Tab Configuration

Each tab requires several properties:

```javascript
{
  id: string,              // Unique identifier for the tab
  icon: string,            // Icon class for the tab button
  title: string,           // Title text for the tab
  tooltip?: string,        // Tooltip text on hover (optional)
  type: string,            // Tab type (usually "custom")
  render: (element) => void // Function that populates the tab content
}
```

The `render` function receives a DOM element where you should insert your tab's content.

## Icon Options

Sidebar tab icons can use various icon sets:

- PrimeVue icons: `pi pi-[icon-name]` (e.g., `pi pi-home`)
- Material Design icons: `mdi mdi-[icon-name]` (e.g., `mdi mdi-robot`)
- Font Awesome icons: `fa-[style] fa-[icon-name]` (e.g., `fa-solid fa-star`)

Ensure the corresponding icon library is loaded before using these icons.

## Stateful Tab Example

You can create tabs that maintain state:

```javascript
app.extensionManager.registerSidebarTab({
  id: "statefulTab",
  icon: "pi pi-list",
  title: "Notes",
  type: "custom",
  render: (el) => {
    // Create elements
    const container = document.createElement('div');
    container.style.padding = '10px';
    
    const notepad = document.createElement('textarea');
    notepad.style.width = '100%';
    notepad.style.height = '200px';
    notepad.style.marginBottom = '10px';
    
    // Load saved content if available
    const savedContent = localStorage.getItem('comfyui-notes');
    if (savedContent) {
      notepad.value = savedContent;
    }
    
    // Auto-save content
    notepad.addEventListener('input', () => {
      localStorage.setItem('comfyui-notes', notepad.value);
    });
    
    // Assemble the UI
    container.appendChild(notepad);
    el.appendChild(container);
  }
});
```

## Using React Components

You can mount React components in sidebar tabs:

```javascript
// Import React dependencies in your extension
import React from "react";
import ReactDOM from "react-dom/client";

// Register sidebar tab with React content
app.extensionManager.registerSidebarTab({
  id: "reactSidebar",
  icon: "mdi mdi-react",
  title: "React Tab",
  type: "custom",
  render: (el) => {
    const container = document.createElement("div");
    container.id = "react-sidebar-container";
    el.appendChild(container);
    
    // Define a simple React component
    function SidebarContent() {
      const [count, setCount] = React.useState(0);
      
      return (
        <div style={{ padding: "10px" }}>
          <h3>React Sidebar</h3>
          <p>Count: {count}</p>
          <button onClick={() => setCount(count + 1)}>
            Increment
          </button>
        </div>
      );
    }
    
    // Mount React component
    ReactDOM.createRoot(container).render(
      <React.StrictMode>
        <SidebarContent />
      </React.StrictMode>
    );
  }
});
```

For a real-world example of a React application integrated as a sidebar tab, check out the [ComfyUI-Copilot project on GitHub](https://github.com/AIDC-AI/ComfyUI-Copilot).

## Dynamic Content Updates

You can update sidebar content in response to graph changes:

```javascript
app.extensionManager.registerSidebarTab({
  id: "dynamicSidebar",
  icon: "pi pi-chart-line",
  title: "Stats",
  type: "custom",
  render: (el) => {
    const container = document.createElement('div');
    container.style.padding = '10px';
    el.appendChild(container);
    
    // Function to update stats
    function updateStats() {
      const stats = {
        nodes: app.graph._nodes.length,
        connections: Object.keys(app.graph.links).length
      };
      
      container.innerHTML = `
        <h3>Workflow Stats</h3>
        <ul>
          <li>Nodes: ${stats.nodes}</li>
          <li>Connections: ${stats.connections}</li>
        </ul>
      `;
    }
    
    // Initial update
    updateStats();
    
    // Listen for graph changes
    const api = app.api;
    api.addEventListener("graphChanged", updateStats);
    
    // Clean up listeners when tab is destroyed
    return () => {
      api.removeEventListener("graphChanged", updateStats);
    };
  }
});
```