import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  History,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";

interface ImageStudioViewProps {
  extremeDark: boolean;
  isOnline: boolean;
}

type Tab = "generate" | "edit" | "analyze" | "history";

type ImageGenStatus = {
  available?: boolean;
  provider?: string;
  billing?: string;
  note?: string;
  capabilities?: {
    textToImage?: boolean;
    styles?: string[];
    imageToImage?: boolean;
    inpainting?: boolean;
  };
};

type GeneratedItem = {
  id: string;
  url: string;
  prompt: string;
  finalPrompt?: string;
  style?: string;
  createdAt: number;
  verified?: boolean | null;
  note?: string | null;
};

const STYLES = [
  { id: "", label: "Auto" },
  { id: "realistic", label: "Réaliste" },
  { id: "artistic", label: "Artistique" },
  { id: "futuristic", label: "Futuriste" },
  { id: "professional", label: "Professionnel" },
];

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function downloadImage(url: string, filename = "jarvis-image.png") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Téléchargement impossible");
    const blob = await res.blob();
    const a = document.createElement("a");
    const obj = URL.createObjectURL(blob);
    a.href = obj;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 1500);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Lecture du fichier impossible."));
    r.readAsDataURL(file);
  });
}

export function ImageStudioView({ extremeDark, isOnline }: ImageStudioViewProps) {
  const [tab, setTab] = useState<Tab>("generate");
  const [status, setStatus] = useState<ImageGenStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // edit tab
  const [editRefName, setEditRefName] = useState<string | null>(null);
  const [editRefPreview, setEditRefPreview] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState("");

  // analyze tab
  const [anFile, setAnFile] = useState<File | null>(null);
  const [anPreview, setAnPreview] = useState<string | null>(null);
  const [anQuestion, setAnQuestion] = useState("Décris l'image, identifie les objets/scènes/éléments visibles, lis le texte présent (OCR) si possible, et signale les incertitudes.");
  const [analyzing, setAnalyzing] = useState(false);
  const [anResult, setAnResult] = useState<string | null>(null);
  const [anError, setAnError] = useState<string | null>(null);

  const card = `rounded-2xl border p-4 sm:p-5 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"}`;
  const input = `w-full px-3 py-2.5 rounded-xl border text-sm bg-transparent focus:outline-none ${extremeDark ? "border-white/[0.1] text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/40" : "border-cyan-400/20 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/45"}`;
  const btnPrimary = `min-h-[42px] px-4 rounded-xl border text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${extremeDark ? "bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/30 text-cyan-100 disabled:opacity-50 disabled:cursor-not-allowed" : "bg-cyan-400/20 hover:bg-cyan-400/30 border-cyan-400/30 text-cyan-50 disabled:opacity-50 disabled:cursor-not-allowed"}`;
  const btnGhost = `min-h-[40px] px-3.5 rounded-xl border text-sm inline-flex items-center justify-center gap-2 cursor-pointer ${extremeDark ? "border-white/[0.1] text-slate-200 hover:bg-white/[0.03]" : "border-cyan-400/20 text-slate-200 hover:bg-white/[0.04]"}`;

  const loadStatus = async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch("/api/images/status");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Statut indisponible (${res.status})`);
      setStatus(data);
    } catch (e) {
      setStatus(null);
      setStatusError(e instanceof Error ? e.message : "Impossible de vérifier le statut de génération.");
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const selected = useMemo(() => history.find((h) => h.id === selectedId) || history[0] || null, [history, selectedId]);
  useEffect(() => {
    if (!selectedId && history.length > 0) setSelectedId(history[0].id);
  }, [history, selectedId]);

  const generate = async (promptText: string, chosenStyle?: string, source?: "generate" | "edit") => {
    const p = promptText.trim();
    if (!p) {
      setGenError("Veuillez saisir une description.");
      return;
    }
    if (!isOnline) {
      setGenError("Hors ligne : la génération d'images via le service gratuit Pollinations.ai nécessite une connexion réseau.");
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, style: chosenStyle || style || undefined }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.ok || !data?.url) {
        throw new Error(data?.error || data?.message || `Échec de génération (${res.status}).`);
      }
      const item: GeneratedItem = {
        id: uid(),
        url: String(data.url),
        prompt: String(data.prompt || p),
        finalPrompt: data.finalPrompt ? String(data.finalPrompt) : undefined,
        style: chosenStyle || style || undefined,
        createdAt: Date.now(),
        verified: typeof data.verified === "boolean" ? data.verified : null,
        note: data.limitsNote || data.verifyNote || null,
      };
      setHistory((prev) => [item, ...prev]);
      setSelectedId(item.id);
      if (source === "generate") {
        // keep prompt for iterations
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Erreur lors de la génération d'image.");
    } finally {
      setGenerating(false);
    }
  };

  const onEditRefChange = async (file: File | null) => {
    setEditRefName(file?.name || null);
    setEditRefPreview(null);
    if (!file) return;
    try {
      if ((file.type || "").startsWith("image/")) {
        const url = await toDataUrl(file);
        setEditRefPreview(url);
      }
    } catch {
      // preview optional
    }
  };

  const generateEditedVersion = async () => {
    const base = prompt.trim();
    const instr = editInstruction.trim();
    const ref = editRefName ? `Image de référence fournie: ${editRefName}. ` : "";
    const composed = [
      base || "Créer une image",
      instr ? `Modifications demandées: ${instr}.` : "",
      ref ? `${ref}Reproduire l'intention générale et appliquer les modifications décrites (nouvelle génération, pas une retouche pixel-level).` : "",
    ].filter(Boolean).join(" ");
    await generate(composed, style || undefined, "edit");
  };

  const onAnalyzeFile = async (file: File | null) => {
    setAnFile(file);
    setAnResult(null);
    setAnError(null);
    setAnPreview(null);
    if (!file) return;
    if ((file.type || "").startsWith("image/")) {
      try { setAnPreview(await toDataUrl(file)); } catch { /* ignore */ }
    }
  };

  const runAnalysis = async () => {
    if (!anFile) { setAnError("Sélectionnez une image à analyser."); return; }
    if (!isOnline) { setAnError("Hors ligne : l'analyse via Gemini nécessite une connexion réseau et une configuration serveur disponible."); return; }
    setAnalyzing(true);
    setAnError(null);
    setAnResult(null);
    try {
      const dataUrl = await toDataUrl(anFile);
      const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, "");
      const res = await fetch("/api/files/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: anFile.name,
          mimeType: anFile.type || "image/png",
          base64Data,
          question: anQuestion.trim() || "Analyse cette image.",
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.error || `Analyse impossible (${res.status}).`);
      }
      const text = typeof data?.analysis === "string" ? data.analysis : typeof data?.result === "string" ? data.result : typeof data?.text === "string" ? data.text : "";
      if (!text.trim()) throw new Error("Aucune analyse exploitable retournée par le service.");
      setAnResult(text.trim());
    } catch (e) {
      setAnError(e instanceof Error ? e.message : "Erreur lors de l'analyse.");
    } finally {
      setAnalyzing(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "generate", label: "Générer", icon: Wand2 },
    { id: "edit", label: "Modifier (nouvelle version)", icon: Sparkles },
    { id: "analyze", label: "Analyser", icon: ScanSearch },
    { id: "history", label: "Historique", icon: History },
  ];

  const canGenerate = isOnline && !generating && !!prompt.trim();

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="max-w-5xl mx-auto space-y-5">
        <header className="space-y-1">
          <h1 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>Studio Images</h1>
          <p className={`text-sm ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Génération d'images réelle (0 €) et analyse visuelle selon les capacités disponibles.
          </p>
        </header>

        <div className={`rounded-xl border p-3 flex gap-2.5 text-xs leading-relaxed ${extremeDark ? "border-cyan-500/20 bg-cyan-950/10 text-slate-200" : "border-cyan-400/20 bg-cyan-500/5 text-slate-200"}`}>
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-cyan-300" />
          <div className="space-y-1">
            <p><strong>Génération :</strong> Pollinations.ai (service public gratuit, 0 €). Disponibilité/limites non garanties. <strong>Modification :</strong> pas d'édition pixel-level/inpainting ; une « modification » génère une nouvelle image à partir d'un prompt ajusté (itération honnête).</p>
            <p><strong>Analyse :</strong> via Gemini Vision côté serveur lorsque configuré/disponible. Aucune capacité n'est simulée.</p>
            {statusLoading && <p className="inline-flex items-center gap-1 text-cyan-300"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Vérification du statut…</p>}
            {statusError && <p className="text-amber-300">Statut génération : {statusError}</p>}
            {status && (
              <p className="text-slate-300">
                Statut génération : {status.available ? "disponible" : "indisponible"} {status.provider ? `· fournisseur ${status.provider}` : ""} {status.billing ? `· ${status.billing}` : ""}. {status.note || ""}
              </p>
            )}
            {!isOnline && <p className="text-amber-300">Mode hors ligne : génération et analyse réseau indisponibles.</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border text-sm cursor-pointer ${active ? "bg-cyan-500/15 border-cyan-400/35 text-cyan-100" : "border-white/[0.08] text-slate-300 hover:bg-white/[0.03]"}`}>
                <Icon className="w-4 h-4" />{t.label}
              </button>
            );
          })}
          <button type="button" onClick={loadStatus} className={btnGhost} title="Actualiser le statut"><RefreshCw className={`w-4 h-4 ${statusLoading ? "animate-spin" : ""}`} />Statut</button>
        </div>

        {tab === "generate" && (
          <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
            <div className={`${card} space-y-4`}>
              <label className="text-xs text-slate-400 space-y-1 block">
                Description (texte → image)
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder="Décrivez l'image à générer (sujet, scène, composition, détails)…" className={input} />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-slate-400 space-y-1 block">
                  Style
                  <select value={style} onChange={(e) => setStyle(e.target.value)} className={input}>
                    {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <div className="text-xs text-slate-400 space-y-1">
                  <span className="block">Réseau</span>
                  <div className={`min-h-[42px] px-3 rounded-xl border flex items-center ${isOnline ? "border-emerald-400/25 text-emerald-200" : "border-amber-400/25 text-amber-200"}`}>
                    {isOnline ? "En ligne" : "Hors ligne"}
                  </div>
                </div>
              </div>
              {genError && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 text-amber-200 text-xs px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{genError}</span></div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!canGenerate} onClick={() => void generate(prompt, style || undefined, "generate")} className={btnPrimary}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Générer l'image
                </button>
                <p className="text-xs text-slate-500 self-center">Styles : réaliste, artistique, futuriste, professionnel.</p>
              </div>
            </div>

            <div className={`${card} space-y-3`}>
              <h2 className="text-sm font-medium text-slate-100">Résultat</h2>
              {selected ? (
                <>
                  <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-black/20">
                    <img src={selected.url} alt={selected.prompt} className="w-full h-auto" onError={(e) => { (e.currentTarget as HTMLImageElement).alt = "Image indisponible"; }} />
                  </div>
                  <p className="text-xs text-slate-300 break-words"><strong>Prompt :</strong> {selected.prompt}</p>
                  {selected.note && <p className="text-[11px] text-slate-500">{selected.note}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnGhost} onClick={() => downloadImage(selected.url, `jarvis-${selected.id}.png`)}><Download className="w-4 h-4" />Télécharger</button>
                    <button type="button" className={btnGhost} onClick={() => { setTab("edit"); setPrompt(selected.prompt); setEditInstruction(""); }}><Sparkles className="w-4 h-4" />Créer une variante</button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-white/[0.1] p-6 text-center text-sm text-slate-400">
                  Aucune image générée pour le moment. Décrivez une image puis lancez la génération.
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "edit" && (
          <section className={`${card} space-y-4`}>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-3 text-xs text-slate-300 flex gap-2">
              <Info className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
              <p>Les modifications pixel-level/inpainting ne sont pas disponibles via les services gratuits intégrés. L'option ci-dessous génère une <strong>nouvelle image</strong> à partir de votre description et des changements demandés (itération honnête). Vous pouvez joindre une image de référence locale pour vous guider, mais elle n'est pas envoyée au générateur texte→image.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={`${btnGhost} w-fit`}>
                  <Upload className="w-4 h-4" />Importer une image de référence (optionnel)
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void onEditRefChange(e.target.files?.[0] || null)} />
                </label>
                {editRefName && <p className="text-xs text-slate-300">Référence locale : {editRefName}</p>}
                {editRefPreview && <img src={editRefPreview} alt="Référence" className="max-h-40 rounded-xl border border-white/[0.08]" />}
              </div>
              <label className="text-xs text-slate-400 space-y-1 block">
                Style
                <select value={style} onChange={(e) => setStyle(e.target.value)} className={input}>
                  {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <label className="text-xs text-slate-400 space-y-1 block">
              Description de base / sujet
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Sujet ou description de base…" className={input} />
            </label>
            <label className="text-xs text-slate-400 space-y-1 block">
              Changements souhaités (nouvelle version)
              <textarea value={editInstruction} onChange={(e) => setEditInstruction(e.target.value)} rows={3} placeholder="Ex. : changer le fond en ville futuriste de nuit, ajouter des néons cyan, rendre l'ambiance plus professionnelle…" className={input} />
            </label>
            {genError && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 text-amber-200 text-xs px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{genError}</span></div>
            )}
            <button type="button" disabled={generating || !isOnline || (!prompt.trim() && !editInstruction.trim())} onClick={() => void generateEditedVersion()} className={btnPrimary}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Générer la nouvelle version
            </button>
          </section>
        )}

        {tab === "analyze" && (
          <section className={`${card} space-y-4`}>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-3 text-xs text-slate-300 flex gap-2">
              <Info className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
              <p>Analyse réelle via l'endpoint serveur <code>/api/files/analyze</code> (Gemini Vision) lorsque Gemini est configuré et disponible. Si Gemini n'est pas configuré, l'analyse échouera avec une erreur explicite (aucune simulation).</p>
            </div>
            <label className={`${btnGhost} w-fit`}>
              <Upload className="w-4 h-4" />Importer une image à analyser
              <input type="file" accept="image/*" className="hidden" onChange={(e) => void onAnalyzeFile(e.target.files?.[0] || null)} />
            </label>
            {anPreview && <img src={anPreview} alt={anFile?.name || "Image à analyser"} className="max-h-64 rounded-xl border border-white/[0.08]" />}
            {anFile && <p className="text-xs text-slate-300">Fichier : {anFile.name} ({anFile.type || "type inconnu"})</p>}
            <label className="text-xs text-slate-400 space-y-1 block">
              Question / consigne d'analyse
              <textarea value={anQuestion} onChange={(e) => setAnQuestion(e.target.value)} rows={3} className={input} />
            </label>
            {anError && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 text-amber-200 text-xs px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{anError}</span></div>
            )}
            <button type="button" disabled={analyzing || !anFile || !isOnline} onClick={() => void runAnalysis()} className={btnPrimary}>
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}Analyser l'image
            </button>
            {anResult && (
              <div className={`rounded-xl border p-4 text-sm whitespace-pre-wrap leading-relaxed ${extremeDark ? "border-white/[0.08] bg-white/[0.02] text-slate-200" : "border-cyan-400/20 bg-cyan-500/5 text-slate-100"}`}>
                {anResult}
              </div>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className={`${card} space-y-3`}>
            <h2 className="text-sm font-medium text-slate-100">Historique (session en cours)</h2>
            {history.length === 0 ? (
              <div className={`rounded-xl border p-4 text-sm text-slate-400 ${extremeDark ? "border-white/[0.06]" : "border-white/[0.08]"}`}>
                Aucune génération réalisée pendant cette session. L'historique se remplit après des générations réelles.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {history.map((item) => (
                  <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setTab("generate"); }} className={`text-left rounded-xl border overflow-hidden cursor-pointer ${selectedId === item.id ? "border-cyan-400/40" : "border-white/[0.08] hover:border-cyan-400/25"}`}>
                    <img src={item.url} alt={item.prompt} className="w-full h-40 object-cover bg-black/20" loading="lazy" />
                    <div className="p-2.5">
                      <p className="text-xs text-slate-200 line-clamp-2">{item.prompt}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{new Date(item.createdAt).toLocaleString("fr-FR")} {item.style ? `· ${item.style}` : ""}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
