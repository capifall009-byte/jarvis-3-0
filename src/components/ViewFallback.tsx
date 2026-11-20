/**
 * Fallback accessible pour les vues chargées à la demande (React.lazy).
 * Phase 9 — ne contient aucune donnée fictive : il annonce uniquement qu'une
 * vue est en cours de chargement, via un statut ARIA lisible par les lecteurs
 * d'écran. Les animations sont désactivées par `prefers-reduced-motion`.
 */
export function ViewFallback({ label = "Chargement de la vue" }: { label?: string }) {
  return (
    <div className="jarvis-view-fallback" role="status" aria-live="polite">
      <div className="jarvis-view-fallback__ring" aria-hidden="true" />
      <p className="text-xs font-medium text-slate-300">{label}…</p>
      <div className="jarvis-view-fallback__bar" aria-hidden="true" />
    </div>
  );
}

export default ViewFallback;
