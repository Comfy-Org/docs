---
title: "Topbar Menu"
---

The Topbar Menu API allows extensions to add custom menu items to the ComfyUI's top menu bar. This is useful for providing access to advanced features or less frequently used commands.

## Basic Usage

```javascript
app.registerExtension({
  name: "MyExtension",
  // Define commands
  commands: [
    { 
      id: "myCommand", 
      label: "My Command", 
      function: () => { alert("Command executed!"); } 
    }
  ],
  // Add commands to menu
  menuCommands: [
    { 
      path: ["Extensions", "My Extension"], 
      commands: ["myCommand"] 
    }
  ]
});
```

Command definitions follow the same pattern as in the [Commands and Keybindings API](./javascript_commands_keybindings). See that page for more detailed information about defining commands.

## Command Configuration

Each command requires an `id`, `label`, and `function`:

```javascript
{
  id: string,              // Unique identifier for the command
  label: string,           // Display name for the command
  function: () => void     // Function to execute when command is triggered
}
```

## Menu Configuration

The `menuCommands` array defines where to place commands in the menu structure:

```javascript
{
  path: string[],          // Array representing menu hierarchy
  commands: string[]       // Array of command IDs to add at this location
}
```

The `path` array specifies the menu hierarchy. For example, `["File", "Export"]` would add commands to the "Export" submenu under the "File" menu.

## Menu Examples

### Adding to Existing Menus

```javascript
app.registerExtension({
  name: "MenuExamples",
  commands: [
    { 
      id: "saveAsImage", 
      label: "Save as Image", 
      function: () => { 
        // Code to save canvas as image
      } 
    },
    { 
      id: "exportWorkflow", 
      label: "Export Workflow", 
      function: () => { 
        // Code to export workflow
      } 
    }
  ],
  menuCommands: [
    // Add to File menu
    { 
      path: ["File"], 
      commands: ["saveAsImage", "exportWorkflow"] 
    }
  ]
});
```

### Creating Submenu Structure

```javascript
app.registerExtension({
  name: "SubmenuExample",
  commands: [
    { 
      id: "option1", 
      label: "Option 1", 
      function: () => { console.log("Option 1"); } 
    },
    { 
      id: "option2", 
      label: "Option 2", 
      function: () => { console.log("Option 2"); } 
    },
    { 
      id: "suboption1", 
      label: "Sub-option 1", 
      function: () => { console.log("Sub-option 1"); } 
    }
  ],
  menuCommands: [
    // Create a nested menu structure
    { 
      path: ["Extensions", "My Tools"], 
      commands: ["option1", "option2"] 
    },
    { 
      path: ["Extensions", "My Tools", "Advanced"], 
      commands: ["suboption1"] 
    }
  ]
});
```

### Multiple Menu Locations

You can add the same command to multiple menu locations:

```javascript
app.registerExtension({
  name: "MultiLocationExample",
  commands: [
    { 
      id: "helpCommand", 
      label: "Get Help", 
      function: () => { window.open("https://docs.example.com", "_blank"); } 
    }
  ],
  menuCommands: [
    // Add to Help menu
    { 
      path: ["Help"], 
      commands: ["helpCommand"] 
    },
    // Also add to Extensions menu
    { 
      path: ["Extensions"], 
      commands: ["helpCommand"] 
    }
  ]
});
```

Commands can work with other ComfyUI APIs like settings. For more information about the Settings API, see the [Settings API](./javascript_settings) documentation.