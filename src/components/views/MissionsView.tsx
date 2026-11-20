/**
 * Vue additive « Missions » — tableau de bord du Central Intelligence Core 4.0.
 * Le chat Gemini historique n'est pas modifié : c'est ici que le Core est activé.
 * Les capacités non livrées sont affichées comme indisponibles (aucune simulation).
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
  Square,
  XCircle,
} from "lucide-react";
import type { AuditEvent, CoreResponse, CoreStatus, Mission } from "../../core/types.ts";
import { coreClient } from "../../services/core/CoreClient.ts";
import type { AppView } from "../../types/jarvis.ts";

interface MissionsViewProps {
  isOnline: boolean;
  extremeDark: boolean;
  onNavigate?: (view: AppView) => void;
}

const STATUS_STYLE: Record<string, string> = {
  planned: "border-cyan-400/30 text-cyan-200 bg-cyan-500/10",
  running: "border-blue-400/30 text-blue-200 bg-blue-500/10",
  paused: "border-amber-400/30 text-amber-200 bg-amber-500/10",
  completed: "border-emerald-400/30 text-emerald-200 bg-emerald-500/10",
  failed: "border-red-400/30 text-red-200 bg-red-500/10",
  cancelled: "border-slate-500/30 text-slate-300 bg-slate-500/10",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono tracking-wider ${STATUS_STYLE[status] ?? STATUS_STYLE.planned}`}>
      {status.toUpperCase()}
    </span>
  );
}

export function MissionsView({ isOnline, extremeDark, onNavigate }: MissionsViewProps) {
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextMissions, nextAudit] = await Promise.all([
        coreClient.getStatus(),
        coreClient.listMissions(),
        coreClient.getAudit(25),
      ]);
      setStatus(nextStatus);
      setMissions(nextMissions);
      setAudit(nextAudit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le Core.");
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void load();
  }, [isOnline, load]);

  const submitGoal = async () => {
    const text = goal.trim();
    if (!text || busy || !isOnline) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response: CoreResponse = await coreClient.handle(text);
      if (response.kind === "simple") {
        setNotice("Demande simple : aucune mission créée. Le chat Gemini reste responsable de la réponse.");
      } else {
        setNotice(`Mission créée : ${response.mission?.id ?? "?"} — ${response.message}`);
        setGoal("");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'analyse de la mission.");
    } finally {
      setBusy(false);
    }
  };

  const stopGlobal = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await coreClient.stopAll("STOP GLOBAL (interface)");
      setNotice(`STOP GLOBAL exécuté : ${result.cancelledMissions} mission(s), ${result.cancelledTasks} tâche(s) annulée(s).`);
      setConfirmStop(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "STOP GLOBAL a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const panel = extremeDark
    ? "bg-black/60 border-white/[0.07]"
    : "jarvis-glass border-cyan-400/15";

  if (!isOnline) {
    return (
      <div className="flex-1 grid place-items-center p-6">
        <div className={`max-w-md rounded-2xl border p-6 text-center ${panel}`}>
          <AlertTriangle className="w-7 h-7 mx-auto mb-3 text-amber-300" />
          <p className="text-sm text-slate-200">Le Core nécessite une connexion au serveur.</p>
          <p className="mt-2 text-xs text-slate-400">Le chat local et la mémoire existante restent inchangés.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto jarvis-scroll p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-cyan-300" />
            <h1 className="font-display text-lg tracking-[0.16em] text-cyan-50">CERVEAU CENTRAL</h1>
            <span className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] font-mono text-cyan-300">4.0 · PHASE {status?.phase ?? 2}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Un seul cerveau, indépendant du fournisseur IA. Missions planifiées, suivies et tracées.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:text-cyan-200 cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          {onNavigate && (
            <button type="button" onClick={() => onNavigate("conversations")} className="rounded-xl border border-cyan-400/25 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/10 cursor-pointer">
              Ouvrir le chat
            </button>
          )}
        </div>
      </header>

      <div className={`rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200/90`}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Stockage local uniquement (aucune base externe configurée). Les missions ne sont pas
            partagées entre appareils et peuvent être perdues lors d&apos;un redéploiement gratuit.
            Aucune synchronisation multi-appareils n&apos;est revendiquée.
          </span>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-xs text-emerald-200">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-xs uppercase tracking-[0.14em] text-cyan-200">Nouvelle mission</h2>
          <p className="mt-1 text-[11px] text-slate-400">
            Une demande simple est automatiquement renvoyée vers le chat Gemini (aucune mission créée).
          </p>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
            placeholder="Ex. : Analyse mon projet et améliore ses performances…"
            className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/40"
          />
          <button
            type="button"
            disabled={busy || !goal.trim()}
            onClick={() => void submitGoal()}
            className="mt-3 w-full rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40 cursor-pointer"
          >
            {busy ? "Analyse en cours…" : "Analyser et planifier"}
          </button>
        </section>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs uppercase tracking-[0.14em] text-cyan-200">État réel du noyau</h2>
            <ShieldAlert className="w-4 h-4 text-cyan-300/70" />
          </div>
          {status ? (
            <div className="mt-3 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between gap-2">
                <span>Identité</span>
                <span className="font-mono text-cyan-200">{status.identity.name} {status.identity.version}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Stockage</span>
                <span className="font-mono text-right text-slate-400">{status.storage.kind} · local</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Missions</span>
                <span className="font-mono text-cyan-200">{status.missions.total}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Événements d&apos;audit</span>
                <span className="font-mono text-cyan-200">{status.auditCount}</span>
              </div>
              <div className="mt-2 border-t border-white/[0.06] pt-2 space-y-1">
                {Object.entries(status.capabilities).map(([key, enabled]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-400">{key}</span>
                    {enabled ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-300" aria-label="disponible" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 shrink-0 text-slate-600" aria-label="non disponible" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-400">Chargement du statut…</p>
          )}
        </section>
      </div>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs uppercase tracking-[0.14em] text-cyan-200">Missions ({missions.length})</h2>
          {confirmStop ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-amber-200">Interrompre toutes les missions actives ?</span>
              <button type="button" onClick={() => void stopGlobal()} className="rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-[11px] text-red-200 cursor-pointer">Confirmer</button>
              <button type="button" onClick={() => setConfirmStop(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-slate-300 cursor-pointer">Annuler</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmStop(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-200 hover:bg-red-500/20 disabled:opacity-40 cursor-pointer">
              <Square className="w-3 h-3" /> STOP GLOBAL
            </button>
          )}
        </div>

        {missions.length === 0 ? (
          <p className="mt-4 text-xs text-slate-400">Aucune mission. Les demandes simples restent dans le chat Gemini.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {missions.map((mission) => (
              <article key={mission.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-100">{mission.goal}</p>
                    <p className="font-mono text-[10px] text-slate-500">{mission.id}</p>
                  </div>
                  <Badge status={mission.status} />
                </div>
                <ul className="mt-2 space-y-1">
                  {mission.tasks.map((task) => (
                    <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className="min-w-0 truncate">{task.name} <span className="text-slate-600">· {task.agent}</span></span>
                      <span className="flex items-center gap-2">
                        {task.permission && <span className="text-amber-300/80">{task.permission} · approbation requise</span>}
                        <Badge status={task.status} />
                      </span>
                    </li>
                  ))}
                </ul>
                {mission.summary && <p className="mt-2 text-[11px] text-emerald-300/80">{mission.summary}</p>}
                {mission.error && <p className="mt-2 text-[11px] text-red-300/80">{mission.error}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="text-xs uppercase tracking-[0.14em] text-cyan-200">Journal d&apos;audit (récent)</h2>
        {audit.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">Aucun événement.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {audit.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                <Clock3 className="w-3 h-3 text-slate-600" />
                <span className="font-mono text-slate-500">{new Date(event.ts).toLocaleTimeString("fr-FR")}</span>
                <span className="text-cyan-200/80">{event.action}</span>
                <span className={`${event.outcome === "denied" || event.outcome === "failure" ? "text-red-300/80" : "text-slate-400"}`}>
                  {event.detail ?? event.target ?? ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
