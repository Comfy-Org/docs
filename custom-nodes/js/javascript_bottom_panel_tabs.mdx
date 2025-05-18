---
title: "Bottom Panel Tabs"
---

The Bottom Panel Tabs API allows extensions to add custom tabs to the bottom panel of the ComfyUI interface. This is useful for adding features like logs, debugging tools, or custom panels.

## Basic Usage

```javascript
app.registerExtension({
  name: "MyExtension",
  bottomPanelTabs: [
    {
      id: "customTab",
      title: "Custom Tab",
      type: "custom",
      render: (el) => {
        el.innerHTML = '<div>This is my custom tab content</div>';
      }
    }
  ]
});
```

## Tab Configuration

Each tab requires an `id`, `title`, and `type`, along with a render function:

```javascript
{
  id: string,              // Unique identifier for the tab
  title: string,           // Display title shown on the tab
  type: string,            // Tab type (usually "custom")
  icon?: string,           // Icon class (optional)
  render: (element) => void // Function that populates the tab content
}
```

The `render` function receives a DOM element where you should insert your tab's content.

## Interactive Elements

You can add interactive elements like buttons:

```javascript
app.registerExtension({
  name: "InteractiveTabExample",
  bottomPanelTabs: [
    {
      id: "controlsTab",
      title: "Controls",
      type: "custom",
      render: (el) => {
        el.innerHTML = `
          <div style="padding: 10px;">
            <button id="runBtn">Run Workflow</button>
          </div>
        `;
        
        // Add event listeners
        el.querySelector('#runBtn').addEventListener('click', () => {
          app.queuePrompt();
        });
      }
    }
  ]
});
```

## Using React Components

You can mount React components in bottom panel tabs:

```javascript
// Import React dependencies in your extension
import React from "react";
import ReactDOM from "react-dom/client";

// Simple React component
function TabContent() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div style={{ padding: "10px" }}>
      <h3>React Component</h3>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}

// Register the extension with React content
app.registerExtension({
  name: "ReactTabExample",
  bottomPanelTabs: [
    {
      id: "reactTab",
      title: "React Tab",
      type: "custom",
      render: (el) => {
        const container = document.createElement("div");
        container.id = "react-tab-container";
        el.appendChild(container);
        
        // Mount React component
        ReactDOM.createRoot(container).render(
          <React.StrictMode>
            <TabContent />
          </React.StrictMode>
        );
      }
    }
  ]
});
```

## Standalone Registration

You can also register tabs outside of `registerExtension`:

```javascript
app.extensionManager.registerBottomPanelTab({
  id: "standAloneTab",
  title: "Stand-Alone Tab",
  type: "custom",
  render: (el) => {
    el.innerHTML = '<div>This tab was registered independently</div>';
  }
});
```