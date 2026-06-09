---
title: "Migrate from Legacy Desktop"
description: "Learn how to migrate your Legacy Desktop installation to Comfy Desktop"
icon: "arrow-right"
sidebarTitle: "Migrate"
---

<Info>
This page covers migration from **Legacy Desktop** (the previous single-install desktop app). If you're a first-time user, you can skip this.
</Info>

<CardGroup cols={1}>
  <Card title="Looking for a different installation?" icon="compass" href="/installation/desktop/usage/instance-management#tracking-an-existing-installation">
    If you already have a ComfyUI installation (portable, manual git clone, etc.) and want to add it to Comfy Desktop, see **Tracking an existing installation** in Instance Management.
  </Card>
</CardGroup>

If you already have Legacy Desktop installed, Comfy Desktop can detect and migrate it, creating a new Standalone installation in the Chooser view.

## What Gets Migrated

Legacy Desktop was a single-install app. Comfy Desktop is a multi-installation manager. When you migrate:

- **Workflows and settings** — copied to the new Standalone installation
- **Custom nodes** — scanned and re-installed in the new environment
- **Models** — your existing model folder is added as a shared directory (files stay where they are)
- **Input files and outputs** — copied to the new installation's shared directories
- **Python environment** — a fresh Python environment is created (Legacy's bundled Python is not reused)
- **ComfyUI version** — the latest version is installed in the new Standalone

The Legacy Desktop installation itself is **not modified** during migration. It remains on your system as a backup.

## What Changes After Migration

Once migration completes, your new Standalone installation works like any other Comfy Desktop installation:

- **Startup** — click the play button on the new installation card in the Chooser view to launch ComfyUI.
- **Port** — Legacy Desktop used port `8000` by default. The new installation carries over this port setting (and any other custom startup arguments you had).
- **Manage** — use the Manage panel to update, snapshot, and configure the installation.
- **Updates** — Standalone installations can be updated independently via the Manage panel. Unlike Legacy Desktop, you no longer need to download a new build for each update.
- **Multiple instances** — you can have multiple Standalone installations side by side, each with its own ComfyUI version and configuration.
- **Shared storage** — models are shared across all Standalone installations by default. Input and output directories are pinned to the adopted legacy workspace so your existing files stay where they are.

## Does My Old Link Still Work?

Legacy Desktop ran on port `8000` by default. The new installation **carries over the port** from your legacy config, so `http://localhost:8000` should still work. If you had custom CLI arguments configured (e.g. `--port 8188`), those are carried over too.

If you use a URL shortener, bookmark, or external integration that references the Legacy Desktop app by a different address, you may need to check the new installation's Startup Args tab and update accordingly.

## Step-by-Step Migration

<Steps>
<Step title="Install Comfy Desktop">
Download and install Comfy Desktop from the [official download page](https://comfy.org/download).
</Step>

<Step title="Start Comfy Desktop">
When you first open Comfy Desktop, it automatically detects any Legacy Desktop installation on your system and shows a migration prompt.
</Step>

<Step title="Confirm Migration">
Click **Migrate Now** to proceed. Comfy Desktop will:

1. Scan your existing installation (custom nodes, models, workflows)
2. Create a new Standalone installation with a fresh Python environment and the latest ComfyUI
3. Copy your user data (workflows, settings, etc.)
4. Copy your input files and outputs
5. Add your model folder as a shared directory
6. Install custom nodes in the new environment

After completion, the new Standalone installation card appears in the Chooser view.
</Step>

<Step title="Verify">
Launch your new installation and confirm:
- Your workflows are available
- Custom nodes are installed
- Models are accessible
- Your server is running on the carried-over URL (default `http://localhost:8000`)
</Step>
</Steps>

## Troubleshooting

### Legacy Desktop not detected automatically

If the migration prompt doesn't appear, you can migrate manually:

1. Click the **+** card in the Chooser view
2. Select **Legacy Desktop**
3. Choose your Legacy Desktop installation and follow the prompts

If your existing installation wasn't detected by the Chooser at all, you can also add it directly via the Manage panel. See [**Tracking an existing installation**](/installation/desktop/usage/instance-management#tracking-an-existing-installation) for instructions.

### Migration fails

- **Check logs** in the Manage panel's Console tab for error details
- **Ensure your Legacy installation is intact**: migration reads from your existing install
- **Try again**: network issues may resolve on a second attempt

### Models missing after migration

Models are added as a shared directory path (not copied). If models don't appear:

1. Open the migrated installation's **Manage** panel
2. Go to **Settings → Model directories**
3. Check if your old model folder is listed. If not, add it manually.
