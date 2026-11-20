/**
 * Gestionnaire de permissions du noyau JARVIS 4.0.
 *
 * Règle absolue : une action sensible n'est JAMAIS autorisée implicitement.
 * Elle retourne `requires_approval` jusqu'à ce qu'une approbation explicite
 *ait été enregistrée pour la paire (action, cible).
 */

import { SENSITIVE_ACTIONS } from "./types.ts";
import type {
  CoreSensitiveAction,
  CoreState,
  PermissionDecision,
  PermissionRequest,
} from "./types.ts";
import type { AuditLog } from "./AuditLog.ts";

export interface PermissionManagerDeps {
  state: CoreState;
  audit: AuditLog;
  now?: () => number;
}

/** Clé d'approbation : une autorisation donnée pour une cible ne couvre pas une autre cible. */
export function permissionKey(action: CoreSensitiveAction, target?: string): string {
  return `${action}|${target ?? "*"}`;
}

export class PermissionManager {
  private readonly state: CoreState;
  private readonly audit: AuditLog;
  private readonly now: () => number;

  constructor(deps: PermissionManagerDeps) {
    this.state = deps.state;
    this.audit = deps.audit;
    this.now = deps.now ?? Date.now;
    if (!this.state.approvals || typeof this.state.approvals !== "object") {
      this.state.approvals = {};
    }
  }

  isSensitive(action: string): action is CoreSensitiveAction {
    return (SENSITIVE_ACTIONS as readonly string[]).includes(action);
  }

  isApproved(request: PermissionRequest): boolean {
    return this.state.approvals[permissionKey(request.action, request.target)]?.approved === true;
  }

  /**
   * Vérifie une action. Aucune action sensible n'est autorisée sans approbation
   * explicite préalable, même en mode autonome.
   */
  check(request: PermissionRequest): PermissionDecision {
    const key = permissionKey(request.action, request.target);
    const record = this.state.approvals[key];

    if (record?.approved === true) {
      this.audit.record({
        actor: request.missionId ? `mission:${request.missionId}` : "core",
        action: "permission_granted",
        target: key,
        outcome: "success",
        detail: request.title,
      });
      return {
        allowed: true,
        decision: "allow",
        reason: "Approbation explicite enregistrée pour cette action et cette cible.",
        approvalId: key,
      };
    }

    // Un refus explicite enregistré doit rester un refus (pas une simple attente).
    if (record?.approved === false) {
      this.audit.record({
        actor: request.missionId ? `mission:${request.missionId}` : "core",
        action: "permission_denied_check",
        target: key,
        outcome: "denied",
        severity: "warn",
        detail: request.title,
      });
      return {
        allowed: false,
        decision: "deny",
        reason: "Cette action a été explicitement refusée par l'utilisateur.",
        approvalId: key,
      };
    }

    this.audit.record({
      actor: request.missionId ? `mission:${request.missionId}` : "core",
      action: "permission_required",
      target: key,
      outcome: "denied",
      severity: "warn",
      detail: request.title,
    });

    return {
      allowed: false,
      decision: "requires_approval",
      reason: `L'action « ${request.action} » nécessite une autorisation explicite avant exécution.`,
      approvalId: key,
    };
  }

  approve(action: CoreSensitiveAction, target?: string, decidedBy = "user"): PermissionDecision {
    const key = permissionKey(action, target);
    this.state.approvals[key] = { approved: true, decidedAt: this.now() };
    this.audit.record({
      actor: decidedBy,
      action: "permission_approved",
      target: key,
      outcome: "success",
      detail: `Approbation explicite enregistrée pour ${action}.`,
    });
    return { allowed: true, decision: "allow", reason: "Approbation enregistrée.", approvalId: key };
  }

  deny(action: CoreSensitiveAction, target?: string, decidedBy = "user"): PermissionDecision {
    const key = permissionKey(action, target);
    this.state.approvals[key] = { approved: false, decidedAt: this.now() };
    this.audit.record({
      actor: decidedBy,
      action: "permission_denied",
      target: key,
      outcome: "denied",
      severity: "warn",
      detail: `Refus explicite enregistré pour ${action}.`,
    });
    return { allowed: false, decision: "deny", reason: "Action refusée par l'utilisateur.", approvalId: key };
  }

  /** Retrait contrôlé d'une approbation (le journal d'audit conserve l'historique). */
  revoke(action: CoreSensitiveAction, target?: string, decidedBy = "user"): boolean {
    const key = permissionKey(action, target);
    const existed = Object.prototype.hasOwnProperty.call(this.state.approvals, key);
    delete this.state.approvals[key];
    this.audit.record({
      actor: decidedBy,
      action: "permission_revoked",
      target: key,
      outcome: "info",
      severity: "warn",
      detail: `Approbation retirée pour ${action}.`,
    });
    return existed;
  }

  listApprovals(): Array<{ key: string; approved: boolean; decidedAt: number }> {
    return Object.entries(this.state.approvals).map(([key, value]) => ({
      key,
      approved: value.approved,
      decidedAt: value.decidedAt,
    }));
  }
}
