#!/usr/bin/env bash
set -euo pipefail

# Cloud Agent install for the ComfyUI docs repo.
# Idempotent: safe to run repeatedly against cached or partial state.

cd "$(dirname "$0")/.."

# Node dependencies for the Mintlify docs site (mint, sharp).
npm ci

# Bun toolchain for the i18n / CMS / analytics pipelines (translate, cms:*, analytics:*).
# Skip the download when bun is already available.
if ! command -v bun >/dev/null 2>&1; then
  export BUN_INSTALL="$HOME/.bun"
  curl -fsSL https://bun.sh/install | bash
  # Expose bun on the default PATH for login and non-login shells.
  sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
fi

bun --version
