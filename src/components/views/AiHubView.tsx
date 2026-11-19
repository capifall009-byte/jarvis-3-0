import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, CircleSlash, Eye, FlaskConical, ImagePlus, Loader2, RefreshCw, Scale, Settings2, Sparkles, XCircle } from "lucide-react";
import {
  fetchAiProviders,
  testOllamaModel,
  type AiProviderId,
  type AiProviderInfo,
} from "../../services/ai/AiProvidersClient";
import {
  getStoredAiSelection,
  setStoredAiSelection,
  selectAiProvider,
  type AiSelectionMode,
} from "../../services/ai/AiProviderManager";

interface AiHubViewProps {
  extremeDark: boolean;
  isOnline: boolean;
}

const VISIBLE_CORE_IDS: AiProviderId[] = ["gemini"];
const OLLAMA_CHAT_ORDER = ["ollama:qwen2.5:0.5b", "ollama:qwen2.5:1.5b", "ollama:qwen2.5:3b"];

type TestState = {
  running?: boolean;
  ok?: boolean;
  responseMs?: number;
  reply?: string;
  error?: string;
  note?: string;
};

function statusMeta(status: AiProviderInfo["status"]) {
  if (status === "available") return { label: "Disponible", icon: CheckCircle2, cls: "text-emerald-300" };
  if (status === "not_configured") return { label: "Non configurée", icon: Settings2, cls: "text-amber-300" };
  return { label: "Indisponible", icon: XCircle, cls: "text-slate-400" };
}

function isOllamaProvider(p: AiProviderInfo): boolean {
  return p.providerFamily === "ollama" || String(p.id).startsWith("ollama:");
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossible de lire l'image."));
    reader.readAsDataURL(file);
  });
}

function ProviderCard({
  p,
  extremeDark,
  mode,
  active,
  onSelect,
  testState,
  onTestChat,
  onTestVision,
}: {
  p: AiProviderInfo;
  extremeDark: boolean;
  mode: AiSelectionMode;
  active: boolean;
  onSelect: () => void;
  testState?: TestState;
  onTestChat?: () => void;
  onTestVision?: (file: File) => void;
}) {
  const meta = statusMeta(p.status);
  const Icon = meta.icon;
  const isVisionOnly = Boolean(p.capabilities.vision) && !p.capabilities.chat;
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className={`text-left rounded-2xl border p-4 space-y-3 transition-colors ${active && mode === "manual" ? "border-cyan-400/40 bg-cyan-500/10" : extremeDark ? "border-white/[0.06] bg-black" : "border-cyan-400/15 jarvis-glass"} ${mode === "auto" ? "" : "cursor-pointer"}`}
      onClick={() => {
        if (mode === "manual") onSelect();
      }}
      role={mode === "manual" ? "button" : undefined}
      tabIndex={mode === "manual" ? 0 : -1}
      onKeyDown={(e) => {
        if (mode === "manual" && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl grid place-items-center bg-cyan-500/10 border border-cyan-400/20 shrink-0"><Bot className="w-4 h-4 text-cyan-300" /></div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">{p.name}</p>
            {(p.model || p.ollamaName) && <p className="text-[11px] text-slate-500 truncate">{p.ollamaName || p.model}</p>}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs shrink-0 ${meta.cls}`}><Icon className="w-3.5 h-3.5" />{meta.label}</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{p.note}</p>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className={`px-2 py-0.5 rounded-full border ${p.capabilities.chat ? "border-emerald-400/25 text-emerald-200" : "border-white/[0.08] text-slate-500"}`}>Chat {p.capabilities.chat ? "✓" : "—"}</span>
        <span className={`px-2 py-0.5 rounded-full border ${p.capabilities.vision ? "border-emerald-400/25 text-emerald-200" : "border-white/[0.08] text-slate-500"}`}>Vision {p.capabilities.vision ? "✓" : "—"}</span>
        <span className={`px-2 py-0.5 rounded-full border ${p.capabilities.imageGeneration ? "border-emerald-400/25 text-emerald-200" : "border-white/[0.08] text-slate-500"}`}>Image {p.capabilities.imageGeneration ? "✓" : "—"}</span>
      </div>

      {isOllamaProvider(p) && (
        <div className="space-y-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-2">
            {p.capabilities.chat && onTestChat && (
              <button
                type="button"
                onClick={onTestChat}
                disabled={testState?.running || p.status !== "available"}
                className="min-h-[34px] px-3 rounded-lg border border-cyan-400/25 bg-cyan-500/10 text-xs text-cyan-100 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {testState?.running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                Tester (texte)
              </button>
            )}
            {isVisionOnly && p.capabilities.vision && onTestVision && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onTestVision(f);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={testState?.running || p.status !== "available"}
                  className="min-h-[34px] px-3 rounded-lg border border-cyan-400/25 bg-cyan-500/10 text-xs text-cyan-100 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {testState?.running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                  Tester analyse d&apos;image
                </button>
              </>
            )}
          </div>
          {testState && (testState.reply || testState.error || testState.note || typeof testState.responseMs === "number") && (
            <div className={`rounded-lg border p-2.5 text-xs space-y-1 ${testState.ok ? "border-emerald-400/20 bg-emerald-500/5 text-emerald-100" : "border-amber-400/20 bg-amber-500/5 text-amber-100"}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] opacity-90">
                <span>Statut: {testState.ok ? "succès" : "échec/à compléter"}</span>
                {typeof testState.responseMs === "number" && <span>Temps: {testState.responseMs} ms</span>}
              </div>
              {testState.note && <p className="text-slate-200 whitespace-pre-wrap">{testState.note}</p>}
              {testState.reply && <p className="text-slate-100 whitespace-pre-wrap">Réponse: {testState.reply}</p>}
              {testState.error && <p className="text-red-200 whitespace-pre-wrap">Erreur: {testState.error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AiHubView({ extremeDark, isOnline }: AiHubViewProps) {
  const stored = useMemo(() => getStoredAiSelection(), []);
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AiSelectionMode>(stored.mode);
  const [selected, setSelected] = useState<AiProviderId>(stored.preferredProvider || "gemini");
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareResult, setCompareResult] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const persistSelection = (nextMode: AiSelectionMode, nextSelected: AiProviderId) => {
    setMode(nextMode);
    setSelected(nextSelected);
    setStoredAiSelection({ mode: nextMode, preferredProvider: nextSelected });
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchAiProviders();
      setProviders(items);
      // Sécuriser la sélection stockée si elle pointe vers un fournisseur masqué
      const safeSelected = (selected === "gemini" || String(selected).startsWith("ollama:")) ? selected : "gemini";
      const hasSelected = items.some((p) => p.id === safeSelected);
      if (!hasSelected || safeSelected !== selected) {
        const fallback = items.find((p) => p.id === "gemini")?.id || "gemini";
        persistSelection(mode, hasSelected ? safeSelected : fallback);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coreProviders = useMemo(() => {
    // Interface simplifiée : afficher uniquement Gemini comme cerveau principal.
    // Les fournisseurs non configurés (ChatGPT, Claude, DeepSeek, Perplexity, Llama) sont masqués de l'UI/sélection visible.
    return VISIBLE_CORE_IDS.map((id) => providers.find((p) => p.id === id)).filter(Boolean) as AiProviderInfo[];
  }, [providers]);

  const ollamaProviders = useMemo(() => {
    const ollama = providers.filter((p) => isOllamaProvider(p));
    const idx = (id: string) => {
      const i = OLLAMA_CHAT_ORDER.indexOf(id);
      if (i >= 0) return i;
      if (id.startsWith("ollama:moondream")) return 100;
      return 50;
    };
    return [...ollama].sort((a, b) => idx(a.id) - idx(b.id));
  }, [providers]);

  const selectedInfo = useMemo(() => providers.find((p) => p.id === selected) || null, [providers, selected]);
  const selectionResult = useMemo(() => selectAiProvider(providers, { mode, preferredProvider: selected, capability: "chat" }), [providers, mode, selected]);

  const card = `rounded-2xl border p-4 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"}`;

  const runCompare = async () => {
    setCompareBusy(true);
    setCompareResult(null);
    try {
      const res = await fetch("/api/ai/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      setCompareResult(typeof data?.note === "string" ? data.note : "Comparaison indisponible pour le moment.");
    } catch {
      setCompareResult("Comparaison indisponible (erreur réseau/serveur).");
    } finally {
      setCompareBusy(false);
    }
  };

  const runChatTest = async (p: AiProviderInfo) => {
    const key = p.id;
    setTests((prev) => ({ ...prev, [key]: { running: true } }));
    try {
      const data = await testOllamaModel({
        model: p.ollamaName || p.model || p.id,
        prompt: "Réponds en une courte phrase: dis bonjour de la part de JARVIS.",
      });
      setTests((prev) => ({ ...prev, [key]: { running: false, ok: Boolean(data?.ok), responseMs: data?.responseMs, reply: data?.reply, error: data?.error, note: data?.note } }));
    } catch (e) {
      setTests((prev) => ({ ...prev, [key]: { running: false, ok: false, error: e instanceof Error ? e.message : "Erreur test." } }));
    }
  };

  const runVisionTest = async (p: AiProviderInfo, file: File) => {
    const key = p.id;
    setTests((prev) => ({ ...prev, [key]: { running: true } }));
    try {
      const dataUrl = await fileToDataUrl(file);
      const data = await testOllamaModel({
        model: p.ollamaName || p.model || p.id,
        prompt: "Décris brièvement cette image en français.",
        imageBase64: dataUrl,
      });
      setTests((prev) => ({ ...prev, [key]: { running: false, ok: Boolean(data?.ok), responseMs: data?.responseMs, reply: data?.reply, error: data?.error, note: data?.note } }));
    } catch (e) {
      setTests((prev) => ({ ...prev, [key]: { running: false, ok: false, error: e instanceof Error ? e.message : "Erreur test vision." } }));
    }
  };

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>Intelligences artificielles</h1>
          <p className={`text-sm ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Configuration simplifiée : Gemini cerveau principal, Ollama/Qwen 2.5 en secours local, Moondream pour la vision locale. Statuts réels, budget 0 € — aucune API payante.
          </p>
        </header>

        <section className={`${card} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => persistSelection("auto", selected)} className={`min-h-[40px] px-3.5 rounded-xl border text-sm cursor-pointer ${mode === "auto" ? "bg-cyan-500/15 border-cyan-400/35 text-cyan-100" : "border-white/[0.08] text-slate-300"}`}>
                <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4" />Mode automatique</span>
              </button>
              <button type="button" onClick={() => persistSelection("manual", selected)} className={`min-h-[40px] px-3.5 rounded-xl border text-sm cursor-pointer ${mode === "manual" ? "bg-cyan-500/15 border-cyan-400/35 text-cyan-100" : "border-white/[0.08] text-slate-300"}`}>
                <span className="inline-flex items-center gap-2"><Settings2 className="w-4 h-4" />Mode manuel</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void load()} className="min-h-[40px] px-3.5 rounded-xl border border-white/[0.08] text-sm text-slate-200 inline-flex items-center gap-2 cursor-pointer">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Actualiser
              </button>
              <button type="button" onClick={() => void runCompare()} disabled={compareBusy} className="min-h-[40px] px-3.5 rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-sm text-cyan-100 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50">
                {compareBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}Comparer les réponses
              </button>
            </div>
          </div>
          <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            {mode === "auto"
              ? "Mode automatique : priorité à Gemini (cerveau principal). Si Gemini est indisponible, JARVIS utilise un modèle Qwen local disponible (Ollama) comme alternative pour la conversation."
              : "Mode manuel : sélectionnez un modèle/fournisseur. Les modèles non opérationnels ne seront pas utilisés pour des appels réels (repli automatique vers un modèle opérationnel si nécessaire)."}
          </p>
          {!isOnline && (
            <p className="text-xs text-amber-300">Hors ligne : Gemini (cloud) peut être indisponible. Les modèles Ollama locaux restent utilisables s&apos;ils sont disponibles sur cette machine.</p>
          )}
          {error && <p className="text-xs text-red-300">{error}</p>}
          {compareResult && (
            <div className={`rounded-xl border p-3 text-sm ${extremeDark ? "border-cyan-500/20 bg-cyan-950/10 text-slate-200" : "border-cyan-400/20 bg-cyan-500/5 text-slate-200"}`}>
              {compareResult}
            </div>
          )}
        </section>

        {loading ? (
          <div className={`${card} flex items-center gap-2 text-sm text-slate-300`}><Loader2 className="w-4 h-4 animate-spin" />Chargement des fournisseurs et modèles Ollama…</div>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Cerveau principal</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {coreProviders.map((p) => (
                  <ProviderCard
                    key={p.id}
                    p={p}
                    extremeDark={extremeDark}
                    mode={mode}
                    active={selected === p.id}
                    onSelect={() => persistSelection("manual", p.id)}
                    testState={tests[p.id]}
                  />
                ))}
              </div>
              <p className="text-[11px] text-slate-500">Gemini est le cerveau principal. Les fournisseurs non configurés (ChatGPT, Claude, DeepSeek, Perplexity, Llama) sont masqués. Ollama/Qwen 2.5 assure le secours local.</p>
            </section>

            <section className="space-y-3">
              <h2 className={`text-sm font-medium flex items-center gap-2 ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}><Eye className="w-4 h-4" />Modèles locaux Ollama (secours & vision)</h2>
              <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                Qwen 2.5 (0.5B/1.5B/3B) : modèles conversationnels locaux de secours. Moondream : analyse d&apos;images locale (vision réelle si disponible).
              </p>
              {ollamaProviders.length === 0 ? (
                <div className={`${card} text-sm text-slate-400`}>Aucun modèle Ollama cible détecté. Vérifiez qu&apos;Ollama est lancé (http://localhost:11434).</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {ollamaProviders.map((p) => (
                    <ProviderCard
                      key={p.id}
                      p={p}
                      extremeDark={extremeDark}
                      mode={mode}
                      active={selected === p.id}
                      onSelect={() => persistSelection("manual", p.id)}
                      testState={tests[p.id]}
                      onTestChat={() => void runChatTest(p)}
                      onTestVision={(file) => void runVisionTest(p, file)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <section className={`${card} space-y-2`}>
          <h2 className="text-sm font-medium text-cyan-100 flex items-center gap-2"><CircleSlash className="w-4 h-4" />État d&apos;exécution</h2>
          <p className="text-sm text-slate-300">
            Sélection (AI Hub) : <span className="text-cyan-200 font-medium">{selectedInfo?.name || "—"}</span> — mode <span className="text-cyan-200">{mode === "auto" ? "automatique" : "manuel"}</span>.
          </p>
          <p className="text-sm text-slate-300">
            Résolution chat effective : <span className="text-cyan-200 font-medium">{selectionResult.resolvedProvider?.name || "Aucun"}</span>
            {selectionResult.fallbackUsed ? <span className="text-amber-300"> (repli)</span> : null}
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">{selectionResult.reason}</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Gemini reste le cerveau principal. Ollama avec Qwen 2.5 sert de solution locale de secours pour la conversation ; Moondream peut assurer l'analyse d'images en local lorsque disponible. Les fournisseurs non configurés sont masqués de l'interface. Aucune API payante n'est appelée.
          </p>
        </section>
      </div>
    </div>
  );
}
