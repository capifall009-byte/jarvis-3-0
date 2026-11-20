/**
 * Vue additive « Outils » — Phase 6 du Central Intelligence Core.
 * Pilotage du registre déclaratif : activation, exécution bornée, templates,
 * historique audité. Aucun code arbitraire, aucun accès réseau/fichier.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  History,
  Play,
  RefreshCw,
  ShieldAlert,
  Square,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ToolDefinition, ToolExecution, ToolResult } from "../../core/tools/types.ts";
import type { CoreStatus } from "../../core/types.ts";
import { coreClient } from "../../services/core/CoreClient.ts";

interface ToolsViewProps {
  isOnline: boolean;
  extremeDark: boolean;
}

const OUTCOME_STYLE: Record<string, string> = {
  success: "text-emerald-300",
  failure: "text-red-300",
  blocked: "text-orange-300",
};

export function ToolsView({ isOnline, extremeDark }: ToolsViewProps) {
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const [definitions, setDefinitions] = useState<ToolDefinition[]>([]);
  const [executions, setExecutions] = useState<ToolExecution[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);

  const [selected, setSelected] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({ objectif: "", contexte: "" });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("Synthèse : {{input.objectif}}");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, tools, history] = await Promise.all([
        coreClient.getStatus(),
        coreClient.getTools(),
        coreClient.getToolExecutions(50),
      ]);
      setStatus(nextStatus);
      setDefinitions(tools.definitions);
      setExecutions(history);
      setSelected((current) => {
        if (current && tools.definitions.some((tool) => tool.name === current)) return current;
        return tools.definitions[0]?.name ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le Core.");
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void load();
  }, [isOnline, load]);

  const active = definitions.find((tool) => tool.name === selected);

  useEffect(() => {
    if (!active) return;
    setInputs((current) => {
      const next: Record<string, string> = {};
      for (const field of active.fields) next[field.name] = current[field.name] ?? "";
      return next;
    });
  }, [active]);

  const execute = async () => {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of active.fields) {
        const value = inputs[field.name];
        if (value !== undefined && value !== "") {
          payload[field.name] = field.type === "number" ? Number(value) : value;
        }
      }
      const next = await coreClient.executeTool(active.name, payload, { actor: "user" });
      setResult(next);
      setNotice(next.ok ? `Outil « ${active.name} » exécuté.` : `Outil « ${active.name} » refusé : ${next.error ?? ""}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Exécution impossible.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (tool: ToolDefinition) => {
    setBusy(true);
    setError(null);
    try {
      await coreClient.toggleTool(tool.name, !tool.enabled);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    if (busy || !name.trim() || !description.trim() || !template.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const tool = await coreClient.registerTool({
        name: name.trim(),
        description: description.trim(),
        template: template.trim(),
        fields: [
          { name: "objectif", type: "string", required: true, maxLength: 500 },
          { name: "contexte", type: "string", maxLength: 1000 },
        ],
        enabled: false,
        maxOutputChars: 2000,
      });
      setNotice(`Template « ${tool.name} » enregistré (désactivé par défaut).`);
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await coreClient.stopAll("STOP GLOBAL (vue Outils)");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "STOP GLOBAL a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const panel = extremeDark ? "bg-black/60 border-white/[0.07]" : "jarvis-glass border-cyan-400/15";
  const selectClass = `min-h-[38px] rounded-lg border bg-transparent px-2 text-xs ${panel}`;

  if (!isOnline) {
    return (
      <div className="flex-1 grid place-items-center p-6">
        <div className={`max-w-md rounded-2xl border p-6 text-center ${panel}`}>
          <AlertTriangle className="w-7 h-7 mx-auto mb-3 text-amber-300" />
          <p className="text-sm text-slate-200">Le registre d'outils nécessite le serveur local.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto jarvis-scroll p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-display tracking-wider text-cyan-100">Registre d'outils</h1>
          <p className="mt-1 text-xs text-slate-400">
            {status?.tools?.total ?? 0} outil(s) · {status?.tools?.enabled ?? 0} activé(s) · {status?.tools?.executions ?? 0} exécution(s) · validation stricte · permissions fail-closed · STOP GLOBAL prioritaire
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
      {result && (
        <div className="rounded-xl border border-white/[0.06] px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Sortie bornée</p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-cyan-100/80">{result.output ?? result.error ?? "(vide)"}</pre>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Outils", value: status?.tools?.total ?? 0, icon: Wrench },
          { label: "Activés", value: status?.tools?.enabled ?? 0, icon: CheckCircle2 },
          { label: "Réussites", value: status?.tools?.successes ?? 0, icon: Play },
          { label: "Bloqués", value: status?.tools?.blocked ?? 0, icon: ShieldAlert },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${panel}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
              <item.icon className="w-3.5 h-3.5" /> {item.label}
            </div>
            <p className="mt-2 text-xl font-display text-cyan-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-sm font-semibold text-slate-100">Exécuter un outil</h2>
          {active ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-cyan-100">{active.name}</span>
                <span className="font-mono text-[10px] text-slate-500">{active.kind}{active.permission ? ` · ${active.permission}` : ""}</span>
              </div>
              <p className="text-[11px] text-slate-400">{active.description}</p>
              {active.fields.map((field) => (
                <label key={field.name} className="block">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{field.name} {field.required ? "(requis)" : ""}</span>
                  <input
                    value={inputs[field.name] ?? ""}
                    onChange={(e) => setInputs((current) => ({ ...current, [field.name]: e.target.value }))}
                    className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-xs ${panel}`}
                    placeholder={field.type}
                  />
                </label>
              ))}
              <button type="button" onClick={() => void execute()} disabled={busy || status?.stopActive} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs text-cyan-100 disabled:opacity-50">
                <Play className="w-3.5 h-3.5" /> Exécuter
              </button>
              <p className="text-[10px] text-slate-500">Sortie limitée à {active.maxOutputChars} caractères · toute exécution est journalisée.</p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">Aucun outil disponible.</p>
          )}
        </section>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-sm font-semibold text-slate-100">Outils déclarés</h2>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {definitions.map((tool) => (
              <div key={tool.name} className="rounded-xl border border-white/[0.06] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => setSelected(tool.name)} className="text-left text-xs font-semibold text-slate-100 hover:text-cyan-200">
                    {tool.name}
                  </button>
                  <span className={`text-[10px] font-mono ${tool.enabled ? "text-emerald-300" : "text-slate-500"}`}>
                    {tool.enabled ? "ACTIVÉ" : "DÉSACTIVÉ"}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">{tool.builtin ? "intégré" : "template local"} · {tool.kind} {tool.permission ? `· permission ${tool.permission}` : ""} · {tool.fields.length} champ(s)</p>
                <button type="button" onClick={() => void toggle(tool)} disabled={busy} className="mt-2 rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300">
                  {tool.enabled ? "Désactiver" : "Activer"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><FileText className="w-4 h-4" /> Nouveau template déclaratif</h2>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (ex. rapport_local)" className={selectClass} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className={selectClass} />
          <input value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="Template {{input.objectif}}" className={selectClass} />
          <button type="button" onClick={() => void register()} disabled={busy || !name.trim() || !description.trim() || !template.trim()} className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 text-xs text-cyan-100 disabled:opacity-50">
            Enregistrer (désactivé)
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Seuls les champs <code>objectif</code> et <code>contexte</code> sont exposés. Le remplacement est littéral : aucun eval, aucune expression.</p>
      </section>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><History className="w-4 h-4" /> Historique des exécutions ({executions.length})</h2>
        <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] p-2">
          {executions.length === 0 && <p className="text-[10px] text-slate-500">Aucune exécution.</p>}
          {executions.map((entry) => (
            <p key={entry.id} className="text-[10px] text-slate-400">
              <span className={OUTCOME_STYLE[entry.outcome]}>{entry.outcome.toUpperCase()}</span> · {entry.toolName} · {entry.actor} · {new Date(entry.ts).toLocaleTimeString("fr-FR")} · {(entry.error ?? entry.output).slice(0, 120)}
            </p>
          ))}
        </div>
      </section>

      {status?.stopActive && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-[11px] text-orange-100">
          <XCircle className="w-4 h-4 shrink-0" /> STOP GLOBAL actif : les outils sont bloqués ; seule la reprise explicite les rétablit.
        </div>
      )}
    </div>
  );
}
