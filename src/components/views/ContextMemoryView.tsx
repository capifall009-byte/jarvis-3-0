/**
 * Vue additive « Mémoire contextuelle » — JARVIS 4.0 Phase 8.
 *
 * Recherche contextuelle locale, court/long terme, doublons suggérés,
 * consolidation et partage contrôlé. Les dépôts existants (souvenirs et
 * conversations) ne sont jamais modifiés : le « pont » ne fait que copier
 * explicitement des éléments choisis dans l'index contextuel du Core.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Layers3,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Tags,
} from "lucide-react";
import type { ConversationSession, MemoryItem } from "../../types/jarvis.ts";
import type {
  ContextDuplicatePair,
  ContextMemoryEntry,
  ContextMemoryKind,
  ContextMemoryScope,
  ContextMemoryStatusView,
  ContextRecallResult,
  ContextBridgeItem,
} from "../../core/memory/types.ts";
import { coreClient } from "../../services/core/CoreClient.ts";

interface ContextMemoryViewProps {
  isOnline: boolean;
  extremeDark: boolean;
  memories: MemoryItem[];
  sessions: ConversationSession[];
}

const KINDS: { id: ContextMemoryKind; label: string }[] = [
  { id: "fact", label: "Fait" },
  { id: "episode", label: "Épisode" },
  { id: "preference", label: "Préférence" },
  { id: "rule", label: "Règle" },
  { id: "decision", label: "Décision" },
];

export function ContextMemoryView({ isOnline, extremeDark, memories, sessions }: ContextMemoryViewProps) {
  const [status, setStatus] = useState<ContextMemoryStatusView | null>(null);
  const [entries, setEntries] = useState<ContextMemoryEntry[]>([]);
  const [duplicates, setDuplicates] = useState<ContextDuplicatePair[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ContextRecallResult | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<ContextMemoryKind>("fact");
  const [scope, setScope] = useState<ContextMemoryScope>("short");
  const [importance, setImportance] = useState(0.6);
  const [share, setShare] = useState<"private" | "agents" | "all">("private");
  const [stopActive, setStopActive] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [payload, pairs, coreStatus] = await Promise.all([
        coreClient.getContextMemory(40),
        coreClient.listContextDuplicates(),
        coreClient.getStatus(),
      ]);
      setStatus(payload.status);
      setEntries(payload.entries);
      setDuplicates(pairs);
      setStopActive(coreStatus.stopActive === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le Core.");
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void load();
  }, [isOnline, load]);

  const run = async (task: () => Promise<unknown>, success: (value: unknown) => string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const value = await task();
      setNotice(success(value));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await coreClient.recallContext({ query, limit: 10 });
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recherche impossible.");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!text.trim()) return;
    await run(
      () => coreClient.remember({ text, kind, scope, importance, share: { mode: share, allow: [] }, source: "user" }),
      () => "Souvenir enregistré dans l'index contextuel local.",
    );
    setText("");
  };

  const bridgeMemories = async () => {
    const items: ContextBridgeItem[] = memories
      .filter((item) => !item.sensitive && !item.disabled)
      .slice(0, 60)
      .map((item) => ({
        id: item.id,
        fact: item.fact,
        category: item.category,
        pinned: item.pinned,
        kind: item.kind,
        confidence: item.confidence,
        source: item.source,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    if (items.length === 0) return;
    await run(
      () => coreClient.bridgeMemories(items, true),
      (value) => {
        const r = value as { accepted: number; skipped: number };
        return `${r.accepted} souvenir(s) copié(s) dans l'index contextuel ; ${r.skipped} ignoré(s). Dépôt d'origine intact.`;
      },
    );
  };

  const bridgeConversations = async () => {
    const items: ContextBridgeItem[] = sessions.slice(0, 20).flatMap((session) =>
      session.messages.slice(-2).filter((message) => message.role === "assistant" || message.role === "user")
        .map((message) => ({
          id: `${session.id}_${message.id}`,
          fact: `[${session.title}] ${message.text}`.slice(0, 800),
          category: "conversation",
          createdAt: message.timestamp,
        }))
    ).filter((item) => item.fact.trim().length > 10);
    if (items.length === 0) return;
    await run(
      () => coreClient.bridgeConversationExcerpts(items, true),
      (value) => {
        const r = value as { accepted: number; skipped: number };
        return `${r.accepted} extrait(s) de conversation indexé(s) comme épisodes ; ${r.skipped} ignoré(s). Conversations intactes.`;
      },
    );
  };

  const panel = extremeDark ? "bg-black/60 border-white/[0.07]" : "jarvis-glass border-indigo-400/15";
  const input = `min-h-[38px] w-full rounded-lg border bg-transparent px-2 text-xs ${panel}`;

  if (!isOnline) {
    return (
      <div className="flex-1 grid place-items-center p-6">
        <div className={`max-w-md rounded-2xl border p-6 text-center ${panel}`}>
          <AlertTriangle className="w-7 h-7 mx-auto mb-3 text-amber-300" />
          <p className="text-sm text-slate-200">La mémoire contextuelle nécessite le serveur Core.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto jarvis-scroll p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-display tracking-wider text-indigo-100">Mémoire contextuelle</h1>
          <p className="mt-1 text-xs text-slate-400">
            Court et long terme, recherche locale, doublons suggérés et partage contrôlé avec les agents. Aucun service externe, aucune donnée transmise.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${panel}`}>
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          <button type="button" onClick={() => void coreClient.stopAll("STOP GLOBAL (vue Mémoire contextuelle)").then(load)} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 disabled:opacity-50">
            <Square className="w-3.5 h-3.5" /> STOP GLOBAL
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">{notice}</div>}
      {stopActive && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-[11px] text-orange-100">
          <AlertTriangle className="w-4 h-4 shrink-0" /> STOP GLOBAL actif : ajout, consolidation, revue et pont sont bloqués ; la lecture reste disponible.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Total indexé", value: status?.stats.total ?? 0, icon: Layers3 },
          { label: "Court terme", value: status?.stats.short ?? 0, icon: Sparkles },
          { label: "Long terme", value: status?.stats.long ?? 0, icon: BrainCircuit },
          { label: "Doublons", value: status?.stats.duplicates ?? 0, icon: Tags },
          { label: "Recherches", value: status?.stats.recalls ?? 0, icon: Search },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${panel}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
              <item.icon className="w-3.5 h-3.5" /> {item.label}
            </div>
            <p className="mt-2 text-sm font-display text-indigo-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-sm font-semibold text-slate-100">Recherche contextuelle locale</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Normalisation Unicode, radicalisation, synonymes locaux, TF-IDF et Jaccard calculés sur votre index. Aucun embedding distant.
          </p>
          <div className="mt-3 flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
              placeholder="Ex. réunion projet voiture" className={input} />
            <button type="button" onClick={() => void search()} disabled={busy || !query.trim()}
              className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-4 text-xs text-indigo-100 disabled:opacity-50">
              Chercher
            </button>
          </div>
          {result && (
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              <p className="text-[10px] text-slate-500">{result.hits.length} résultat(s) sur {result.scanned} indexé(s) · {result.strategy} · distant : {String(result.remote)}</p>
              {result.hits.map((hit) => (
                <div key={hit.entry.id} className="rounded-xl border border-white/[0.06] p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                    <span>{hit.entry.scope} · {hit.entry.kind} · score {hit.score.toFixed(3)}</span>
                    <span>{hit.entry.share.mode}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-200">{hit.entry.text}</p>
                  <p className="mt-1 text-[10px] text-indigo-200/60">{hit.reasons.join(" · ") || "pertinence locale"}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-sm font-semibold text-slate-100">Enregistrer un souvenir</h2>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000}
            placeholder="Ce que JARVIS doit retenir localement…" className={`mt-3 ${input} py-2`} />
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-[10px] text-slate-400">Type
              <select value={kind} onChange={(e) => setKind(e.target.value as ContextMemoryKind)} className={`mt-1 ${input}`}>
                {KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-slate-400">Durée
              <select value={scope} onChange={(e) => setScope(e.target.value as ContextMemoryScope)} className={`mt-1 ${input}`}>
                <option value="short">Court terme</option>
                <option value="long">Long terme</option>
              </select>
            </label>
            <label className="text-[10px] text-slate-400">Partage
              <select value={share} onChange={(e) => setShare(e.target.value as typeof share)} className={`mt-1 ${input}`}>
                <option value="private">Privé</option>
                <option value="agents">Agents autorisés</option>
                <option value="all">Tous</option>
              </select>
            </label>
            <label className="text-[10px] text-slate-400">Importance : {importance.toFixed(2)}
              <input type="range" min={0} max={1} step={0.05} value={importance} onChange={(e) => setImportance(Number(e.target.value))} className="mt-3 w-full" />
            </label>
          </div>
          <button type="button" onClick={() => void add()} disabled={busy || stopActive || !text.trim()}
            className="mt-3 rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-4 py-2 text-xs text-indigo-100 disabled:opacity-50">
            Enregistrer localement
          </button>
        </section>
      </div>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Souvenirs indexés</h2>
          <button type="button" onClick={() => void run(() => coreClient.consolidateContextMemory(), (v) => {
            const r = v as { promoted: number; pruned: number };
            return `${r.promoted} promu(s) en long terme, ${r.pruned} entrée(s) bornée(s).`;
          })} disabled={busy || stopActive}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-slate-200 disabled:opacity-50">
            Consolider
          </button>
        </div>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
          {entries.length === 0 && <p className="text-xs text-slate-500">Aucun souvenir contextuel pour l'instant.</p>}
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-white/[0.06] p-3">
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                <span className={entry.scope === "long" ? "text-indigo-200" : "text-cyan-200"}>{entry.scope}</span>
                <span>{entry.kind}</span>
                <span>source : {entry.source}</span>
                <span>partage : {entry.share.mode}</span>
                <span>importance {entry.importance.toFixed(2)}</span>
                <span>accès {entry.accessCount}</span>
              </div>
              <p className="mt-1 text-xs text-slate-200">{entry.text}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {[...entry.categories, ...entry.tags].map((tag) => (
                  <span key={tag} className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-slate-400">#{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="text-sm font-semibold text-slate-100">Doublons suggérés</h2>
        <p className="mt-1 text-[11px] text-slate-500">Aucune fusion n'est automatique : vous décidez après examen.</p>
        <div className="mt-3 space-y-2">
          {duplicates.length === 0 && <p className="text-xs text-slate-500">Aucun doublon détecté.</p>}
          {duplicates.map((pair) => (
            <div key={pair.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-2.5 text-[11px]">
              <span className="text-amber-100">Similarité {pair.similarity.toFixed(2)} · {pair.firstId} ↔ {pair.secondId} · {pair.status}</span>
              {pair.status === "suggested" && (
                <button type="button" onClick={() => void run(() => coreClient.reviewContextDuplicate(pair.id), () => "Doublon marqué comme examiné.")}
                  disabled={busy || stopActive} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-200 disabled:opacity-50">
                  Examiner
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Link2 className="w-4 h-4" /> Pont local avec l'existant</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Copie explicite et additive d'éléments choisis. Les souvenirs (`jarvis_persistent_memory_v1`, IndexedDB) et les conversations restent strictement inchangés.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void bridgeMemories()} disabled={busy || stopActive || memories.length === 0}
            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-100 disabled:opacity-50">
            Copier mes souvenirs locaux ({memories.filter((m) => !m.sensitive && !m.disabled).length})
          </button>
          <button type="button" onClick={() => void bridgeConversations()} disabled={busy || stopActive || sessions.length === 0}
            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-100 disabled:opacity-50">
            Indexer des extraits de conversations ({sessions.length})
          </button>
        </div>
      </section>

      <div className={`rounded-xl border px-4 py-3 text-[11px] ${panel} text-slate-400`}>
        <p className="flex items-center gap-2 text-indigo-100"><ShieldCheck className="w-4 h-4" /> Garanties Phase 8</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Recherche locale déterministe : aucun embedding externe, aucun appel réseau, aucune dépendance ajoutée.</li>
          <li>Partage fail closed : un souvenir « privé » n'est jamais transmis à un agent.</li>
          <li>Doublons détectés mais jamais fusionnés ni supprimés automatiquement.</li>
          <li>STOP GLOBAL bloque toute mutation ; les dépôts de mémoire et de conversations existants sont préservés.</li>
          <li><CheckCircle2 className="inline w-3 h-3" /> Les notifications et fonctions hors ligne ne sont pas annoncées comme testées ici (Phase 9).</li>
        </ul>
      </div>
    </div>
  );
}
