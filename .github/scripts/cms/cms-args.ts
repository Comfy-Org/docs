import type { CmsConfig } from "./cms-config.ts";
import { listProjectIds } from "./cms-config.ts";

export function stripProjectArg(argv: string[]): { project: string | undefined; rest: string[] } {
  const rest: string[] = [];
  let project: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--project" && argv[i + 1]) {
      project = argv[++i];
    } else if (arg.startsWith("--project=")) {
      project = arg.slice("--project=".length);
    } else {
      rest.push(arg);
    }
  }
  return { project, rest };
}

export function resolveProject(config: CmsConfig, cliProject?: string): string {
  const project = cliProject?.trim() || process.env.CMS_PROJECT?.trim() || config.default_project;
  const known = listProjectIds(config);
  if (!known.includes(project)) {
    throw new Error(`Unknown project "${project}". Known: ${known.join(", ")}`);
  }
  return project;
}

/** Default: all projects (comfyui + cloud). Pass --project or CMS_PROJECT for one only. */
export function resolveProjects(config: CmsConfig, cliProject?: string): string[] {
  const single = cliProject?.trim() || process.env.CMS_PROJECT?.trim();
  if (single) return [resolveProject(config, single)];
  return listProjectIds(config);
}
