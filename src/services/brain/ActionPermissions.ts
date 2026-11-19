export type SensitiveActionKind =
  | "send_email"
  | "delete_data"
  | "modify_important"
  | "external_action"
  | "revoke_access"
  | "uninstall_app"
  | "calendar_write"
  | "automation_run"
  | "generic_sensitive";

export interface SensitiveActionRequest {
  kind: SensitiveActionKind;
  title: string;
  detail?: string;
  target?: string;
}

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
}

function defaultPromptText(req: SensitiveActionRequest): string {
  const base = req.detail ? `${req.title}\n\n${req.detail}` : req.title;
  return `${base}\n\nConfirmez-vous cette action sensible ?`;
}

/**
 * Gestion centralisée des permissions/actions sensibles (client).
 * Toute action sensible doit demander confirmation explicite avant exécution.
 */
export async function requestSensitiveActionConfirmation(
  req: SensitiveActionRequest,
  opts?: { confirm?: (message: string) => boolean | Promise<boolean> }
): Promise<PermissionDecision> {
  const confirmFn = opts?.confirm ?? ((message: string) => window.confirm(message));
  try {
    const ok = await confirmFn(defaultPromptText(req));
    return ok
      ? { allowed: true }
      : { allowed: false, reason: "Action annulée par l'utilisateur (confirmation refusée)." };
  } catch {
    return { allowed: false, reason: "Impossible d'obtenir la confirmation de l'utilisateur." };
  }
}

export function requiresExplicitConfirmation(kind: SensitiveActionKind): boolean {
  switch (kind) {
    case "send_email":
    case "delete_data":
    case "modify_important":
    case "external_action":
    case "revoke_access":
    case "uninstall_app":
    case "calendar_write":
    case "automation_run":
    case "generic_sensitive":
      return true;
    default:
      return true;
  }
}
