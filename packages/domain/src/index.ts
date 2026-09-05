import type { ActionExecutor } from "@project-bridge/actions";
import type { ConversationInterpreter } from "@project-bridge/conversation";

export interface DomainModule {
  readonly id: string;
  readonly displayName: string;
  readonly interpreter: ConversationInterpreter;
  readonly actions: readonly ActionExecutor[];
}

export function validateDomainModule(module: DomainModule): readonly string[] {
  const issues: string[] = [];

  if (module.id.trim() === "")
    issues.push("Domain module id must not be empty.");
  if (module.displayName.trim() === "") {
    issues.push("Domain module display name must not be empty.");
  }

  const actionNames = module.actions.map((action) => action.definition.name);
  const duplicateNames = actionNames.filter(
    (name, index) => actionNames.indexOf(name) !== index,
  );
  for (const name of new Set(duplicateNames)) {
    issues.push(`Duplicate action name: ${name}`);
  }

  return issues;
}
