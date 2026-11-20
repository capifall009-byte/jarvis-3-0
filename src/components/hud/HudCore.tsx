import type { ReactNode } from "react";

/**
 * Noyau holographique du command center.
 *
 * L'état affiché est toujours fourni par l'appelant : aucun état n'est simulé.
 * Les animations sont purement CSS et neutralisées par prefers-reduced-motion.
 */
export type HudCoreState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "offline"
  | "stopped";

export interface HudCoreProps {
  state: HudCoreState;
  /** Libellé lisible de l'état réel, affiché sous le noyau. */
  label?: string;
  /** Contenu central (par exemple l'orbe vocal existant). */
  children?: ReactNode;
  className?: string;
}

export function HudCore({ state, label, children, className = "" }: HudCoreProps) {
  return (
    <div className={`hud-core ${className}`} data-state={state}>
      <span className="hud-core__halo" aria-hidden="true" />
      <span className="hud-core__sweep" aria-hidden="true" />
      <span className="hud-core__ring hud-core__ring--outer" aria-hidden="true" />
      <span className="hud-core__ring hud-core__ring--middle" aria-hidden="true" />
      <span className="hud-core__ring hud-core__ring--inner" aria-hidden="true" />
      <span className="hud-core__particle hud-core__particle--a" aria-hidden="true" />
      <span className="hud-core__particle hud-core__particle--b" aria-hidden="true" />
      <span className="hud-core__particle hud-core__particle--c" aria-hidden="true" />
      <span className="hud-core__content">{children}</span>
      {label ? (
        <span
          className="hud-chip absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap"
          role="status"
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

export default HudCore;
