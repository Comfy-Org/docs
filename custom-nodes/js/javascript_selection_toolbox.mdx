---
title: "Selection Toolbox"
---

The Selection Toolbox API allows extensions to add custom action buttons that appear when nodes are selected on the canvas. This provides quick access to context-sensitive commands for selected items (nodes, groups, etc.).

## Basic Usage

To add commands to the selection toolbox, your extension needs to:
1. Define commands with the standard [command interface](https://docs.comfy.org/custom-nodes/js/javascript_commands_keybindings)
2. Implement the `getSelectionToolboxCommands` method to specify which commands appear in the toolbox

Note: The `getSelectionToolboxCommands` method is called for each item in the selection set whenever a new selection is made.

```javascript
app.registerExtension({
  name: "MyExtension",
  commands: [
    {
      id: "my-extension.duplicate-special",
      label: "Duplicate Special",
      icon: "pi pi-copy",
      function: (selectedItem) => {
        // Your command logic here
        console.log("Duplicating selected nodes with special behavior");
      }
    }
  ],
  getSelectionToolboxCommands: (selectedItem) => {
    // Return array of command IDs to show in the toolbox
    return ["my-extension.duplicate-special"];
  }
});
```

## Command Definition

Commands for the selection toolbox use the standard ComfyUI command interface:

```javascript
{
  id: string,          // Unique identifier for the command
  label: string,       // Display text for the button tooltip
  icon?: string,       // Icon class for the button (optional)
  function: (selectedItem) => void  // Function executed when clicked
}
```

The `function` receives the selected item(s) as a parameter, allowing you to perform actions on the current selection.

## Icon Options

Selection toolbox buttons support the same icon libraries as other UI elements:

- PrimeVue icons: `pi pi-[icon-name]` (e.g., `pi pi-star`)
- Material Design icons: `mdi mdi-[icon-name]` (e.g., `mdi mdi-content-copy`)

## Dynamic Command Visibility

The `getSelectionToolboxCommands` method is called each time the selection changes, allowing you to show different commands based on what's selected:

```javascript
app.registerExtension({
  name: "ContextualCommands",
  commands: [
    {
      id: "my-ext.align-nodes",
      label: "Align Nodes",
      icon: "pi pi-align-left",
      function: () => {
        // Align multiple nodes
      }
    },
    {
      id: "my-ext.configure-single",
      label: "Configure",
      icon: "pi pi-cog",
      function: () => {
        // Configure single node
      }
    }
  ],
  getSelectionToolboxCommands: (selectedItem) => {
    const selectedItems = app.canvas.selectedItems;
    const itemCount = selectedItems ? selectedItems.size : 0;
    
    if (itemCount > 1) {
      // Show alignment command for multiple items
      return ["my-ext.align-nodes"];
    } else if (itemCount === 1) {
      // Show configuration for single item
      return ["my-ext.configure-single"];
    }
    
    return [];
  }
});
```

## Working with Selected Items

Access information about selected items through the app's canvas object. The `selectedItems` property is a Set that includes nodes, groups, and other canvas elements:

```javascript
app.registerExtension({
  name: "SelectionInfo",
  commands: [
    {
      id: "my-ext.show-info",
      label: "Show Selection Info",
      icon: "pi pi-info-circle",
      function: () => {
        const selectedItems = app.canvas.selectedItems;
        
        if (selectedItems && selectedItems.size > 0) {
          console.log(`Selected ${selectedItems.size} items`);
          
          // Iterate through selected items
          selectedItems.forEach(item => {
            if (item.type) {
              console.log(`Item: ${item.type} (ID: ${item.id})`);
            }
          });
        }
      }
    }
  ],
  getSelectionToolboxCommands: () => ["my-ext.show-info"]
});
```

## Complete Example

Here's a simple example showing various selection toolbox features:

```javascript
app.registerExtension({
  name: "SelectionTools",
  commands: [
    {
      id: "selection-tools.count",
      label: "Count Selection",
      icon: "pi pi-hashtag",
      function: () => {
        const count = app.canvas.selectedItems?.size || 0;
        app.extensionManager.toast.add({
          severity: "info",
          summary: "Selection Count",
          detail: `You have ${count} item${count !== 1 ? 's' : ''} selected`,
          life: 3000
        });
      }
    },
    {
      id: "selection-tools.copy-ids",
      label: "Copy IDs",
      icon: "pi pi-copy",
      function: () => {
        const items = Array.from(app.canvas.selectedItems || []);
        const ids = items.map(item => item.id).filter(id => id !== undefined);
        
        if (ids.length > 0) {
          navigator.clipboard.writeText(ids.join(', '));
          app.extensionManager.toast.add({
            severity: "success",
            summary: "Copied",
            detail: `Copied ${ids.length} IDs to clipboard`,
            life: 2000
          });
        }
      }
    },
    {
      id: "selection-tools.log-types",
      label: "Log Types",
      icon: "pi pi-info-circle",
      function: () => {
        const items = Array.from(app.canvas.selectedItems || []);
        const typeCount = {};
        
        items.forEach(item => {
          const type = item.type || 'unknown';
          typeCount[type] = (typeCount[type] || 0) + 1;
        });
        
        console.log("Selection types:", typeCount);
      }
    }
  ],
  
  getSelectionToolboxCommands: (selectedItem) => {
    const selectedItems = app.canvas.selectedItems;
    const itemCount = selectedItems ? selectedItems.size : 0;
    
    if (itemCount === 0) return [];
    
    const commands = ["selection-tools.count", "selection-tools.log-types"];
    
    // Only show copy command if items have IDs
    const hasIds = Array.from(selectedItems).some(item => item.id !== undefined);
    if (hasIds) {
      commands.push("selection-tools.copy-ids");
    }
    
    return commands;
  }
});
```

## Notes

- The selection toolbox must be enabled in settings: `Comfy.Canvas.SelectionToolbox`
- Commands must be defined in the `commands` array before being referenced in `getSelectionToolboxCommands`
- The toolbox automatically updates when the selection changes
- The `getSelectionToolboxCommands` method is called for each item in the selection set whenever a new selection is made
- Use `app.canvas.selectedItems` (a Set) to access all selected items including nodes, groups, and other canvas elements
- For backward compatibility, `app.canvas.selected_nodes` still exists but only contains nodes