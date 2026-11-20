/**
 * Vue additive « Agents » — Phase 4 du Central Intelligence Core.
 * Pilotage réel des rôles logiques, des runs, de la mémoire partagée et des
 * validations humaines. Aucunagent n'est une simple interface de discussion.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Square,
  XCircle,
} from "lucide-react";
import type { AgentDefinition, AgentRun, SharedMemoryEntry } from "../../core/agents/types.ts";
import type { CoreStatus, Mission } from "../../core/types.ts";
import { coreClient } from "../../services/core/CoreClient.ts";

interface AgentsViewProps {
  isOnline: boolean;
  extremeDark: boolean;
}

const RUN_STYLE: Record<string, string> = {
  planned: "border-slate-500/30 text-slate-300 bg-slate-500/10",
  running: "border-blue-400/30 text-blue-200 bg-blue-500/10",
  paused: "border-amber-400/30 text-amber-200 bg-amber-500/10",
  awaiting_validation: "border-orange-400/30 text-orange-200 bg-orange-500/10",
  completed: "border-emerald-400/30 text-emerald-200 bg-emerald-500/10",
  failed: "border-red-400/30 text-red-200 bg-red-500/10",
  cancelled: "border-slate-500/30 text-slate-300 bg-slate-500/10",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-mono tracking-wider ${RUN_STYLE[status] ?? RUN_STYLE.planned}`}>
      {status.toUpperCase().replace("_", " ")}
    </span>
  );
}

export function AgentsView({ isOnline, extremeDark }: AgentsViewProps) {
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memory, setMemory] = useState<SharedMemoryEntry[]>([]);
  const [missionId, setMissionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (keepSelection = true) => {
    setError(null);
    try {
      const [nextStatus, nextAgents, nextMissions, nextRuns] = await Promise.all([
        coreClient.getStatus(),
        coreClient.getAgents(),
        coreClient.listMissions(),
        coreClient.getAgentRuns(),
      ]);
      setStatus(nextStatus);
      setAgents(nextAgents);
      setMissions(nextMissions);
      setRuns(nextRuns);
      setSelectedId((current) => {
        if (keepSelection && current && nextRuns.some((r) => r.id === current)) return current;
        return nextRuns[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le Core.");
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void load();
  }, [isOnline, load]);

  useEffect(() => {
    if (!isOnline || !selectedId) return;
    void coreClient.getAgentMemory(selectedId).then(setMemory).catch(() => setMemory([]));
  }, [isOnline, selectedId]);

  const selected = runs.find((run) => run.id === selectedId) ?? null;

  const dispatch = async () => {
    if (!missionId || busy || !isOnline) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const run = await coreClient.dispatchMission(missionId, { maxConcurrency: 2 });
      setNotice(`${run.status.toUpperCase()} — ${run.steps.length} étapes, ${run.steps.filter((s) => s.status === "done").length} terminées.`);
      setSelectedId(run.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch impossible.");
    } finally {
      setBusy(false);
    }
  };

  const validate = async (stepId: string, decision: "approve" | "reject") => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      let run = await coreClient.validateAgentStep(selected.id, stepId, decision);
      if (decision === "approve" && run.status === "paused") {
        run = await coreClient.runAgents(run.id);
      }
      setNotice(decision === "approve" ? "Validation accordée et exécution reprise." : "Validation refusée : run annulé.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const result = await coreClient.stopAll("STOP GLOBAL (vue Agents)");
      setNotice(`STOP GLOBAL : ${result.cancelledMissions} mission(s) annulée(s).`);
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
          <p className="text-sm text-slate-200">Le système multi-agents nécessite le serveur local.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto jarvis-scroll p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-display tracking-wider text-cyan-100">Système multi-agents</h1>
          <p className="mt-1 text-xs text-slate-400">
            {agents.length} rôles logiques coordonnés par le Main Agent · {status?.agents?.runs ?? 0} run(s) · concurrence bornée · STOP GLOBAL prioritaire
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${panel}`}>
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          <button type="button" onClick={() => void stop()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 disabled:opacity-50">
            <Square className="w-3.5 h-3.5" /> STOP GLOBAL
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">{notice}</div>}

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {agents.map((agent) => (
          <div key={agent.id} className={`rounded-xl border p-3 ${panel}`}>
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-cyan-300 shrink-0" />
              <span className="text-xs font-semibold text-slate-100 truncate">{agent.name}</span>
              {agent.canDelegate && <span className="ml-auto text-[9px] font-mono text-cyan-300">COORDONNATEUR</span>}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400 leading-snug">{agent.role}</p>
          </div>
        ))}
      </section>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="text-sm font-semibold text-slate-100">Lancer une mission</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            className={`min-h-[40px] flex-1 min-w-[220px] rounded-lg border bg-transparent px-3 text-xs ${panel}`}
          >
            <option value="">Choisir une mission…</option>
            {missions.filter((m) => !["completed", "cancelled"].includes(m.status)).map((m) => (
              <option key={m.id} value={m.id}>{m.goal.slice(0, 70)} ({m.status})</option>
            ))}
          </select>
          <button type="button" onClick={() => void dispatch()} disabled={!missionId || busy} className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 text-xs text-cyan-100 disabled:opacity-50">
            Répartir et exécuter
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4">
        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-sm font-semibold text-slate-100">Runs</h2>
          <div className="mt-3 space-y-2">
            {runs.length === 0 && <p className="text-xs text-slate-500">Aucun run. Lancez une mission ci-dessus.</p>}
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedId(run.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === run.id ? "border-cyan-400/40 bg-cyan-500/10" : "border-white/[0.06] hover:bg-white/[0.03]"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-300 truncate">{run.id}</span>
                  <Badge status={run.status} />
                </div>
                <p className="mt-1 text-xs text-slate-400 truncate">{run.goal}</p>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" />{run.steps.filter((s) => s.status === "done").length}/{run.steps.length} étapes</span>
                  <span>concurrence max {run.metrics.maxConcurrentObserved}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-sm font-semibold text-slate-100">Détail du run</h2>
          {!selected ? (
            <p className="mt-3 text-xs text-slate-500">Sélectionnez un run.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {selected.error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">{selected.error}</div>
              )}
              {selected.summary && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> {selected.summary}
                </div>
              )}
              <div className="space-y-2">
                {selected.steps.map((step) => (
                  <div key={step.id} className="rounded-xl border border-white/[0.06] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono text-cyan-300">{step.assignee.toUpperCase()}</span>
                        <span className="text-xs text-slate-200 truncate">{step.name}</span>
                      </div>
                      <span className={`text-[10px] font-mono ${step.status === "done" ? "text-emerald-300" : step.status === "failed" ? "text-red-300" : "text-slate-400"}`}>
                        {step.status.toUpperCase()} · {step.attempts}/{step.maxAttempts}
                      </span>
                    </div>
                    {step.output && <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-400 max-h-28 overflow-y-auto">{step.output.slice(0, 800)}</p>}
                    {step.error && <p className="mt-1 text-[11px] text-red-300/80">{step.error}</p>}
                    {step.status === "needs_validation" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2">
                        <ShieldAlert className="w-4 h-4 text-orange-300" />
                        <span className="text-[11px] text-orange-100 flex-1">{step.validationReason ?? "Validation requise."}</span>
                        <button type="button" disabled={busy} onClick={() => void validate(step.id, "approve")} className="rounded border border-emerald-400/40 px-2 py-1 text-[10px] text-emerald-200">Approuver</button>
                        <button type="button" disabled={busy} onClick={() => void validate(step.id, "reject")} className="rounded border border-red-400/40 px-2 py-1 text-[10px] text-red-200">Refuser</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-200"><MessageSquare className="w-3.5 h-3.5" /> Communication inter-agents</h3>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] p-2">
                  {selected.messages.map((message) => (
                    <p key={message.id} className="text-[10px] text-slate-400">
                      <span className="text-cyan-300/80">{message.from}</span> → <span className="text-cyan-300/80">{message.to}</span> · {message.subject} : {message.body.slice(0, 110)}
                    </p>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-200">Mémoire partagée ({memory.length})</h3>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] p-2">
                  {memory.length === 0 && <p className="text-[10px] text-slate-500">Aucune entrée.</p>}
                  {memory.map((entry) => (
                    <p key={entry.id} className="text-[10px] text-slate-400">
                      <span className="font-mono text-slate-300">{entry.key}</span> · {entry.author} · {entry.value.slice(0, 100)}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {runs.some((r) => ["running", "planned", "paused", "awaiting_validation"].includes(r.status)) && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-100">
          <XCircle className="w-4 h-4 shrink-0" /> Des runs sont actifs : STOP GLOBAL les interrompt immédiatement.
        </div>
      )}
    </div>
  );
}
