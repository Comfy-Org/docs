export interface CloudPublishSafetyInput {
  dryRun: boolean;
  projects: string[];
  explicitProject?: string;
  versions: string[];
  renderedPreview?: string;
  rollbackOwner?: string;
}

/**
 * Cloud publishes are production launches. Require one exact version plus
 * durable preview and rollback ownership before allowing the write path.
 */
export function validateCloudPublishSafety(
  input: CloudPublishSafetyInput,
): void {
  if (input.dryRun || !input.projects.includes("cloud")) return;

  if (input.explicitProject !== "cloud" || input.projects.length !== 1) {
    throw new Error(
      "Cloud publish must be scoped explicitly with --project cloud. Do not publish multiple projects in one command.",
    );
  }
  if (input.versions.length !== 1) {
    throw new Error(
      "Cloud publish requires exactly one explicit target version.",
    );
  }
  if (!input.renderedPreview?.trim()) {
    throw new Error(
      "Cloud publish requires --rendered-preview <URL-or-artifact> from the native What's New renderer.",
    );
  }
  if (!input.rollbackOwner?.trim()) {
    throw new Error("Cloud publish requires --rollback-owner <name>.");
  }
}
