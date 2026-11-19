import { useMemo, useState } from "react";
import { Image as ImageIcon, Info, Upload, Wand2, ScanSearch, History, GitCompare, AlertTriangle } from "lucide-react";

interface ImageStudioViewProps {
  extremeDark: boolean;
  isOnline: boolean;
}

type Tab = "generate" | "edit" | "analyze" | "history";

export function ImageStudioView({ extremeDark, isOnline }: ImageStudioViewProps) {
  const [tab, setTab] = useState<Tab>("generate");
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("auto");
  const [fileName, setFileName] = useState<string | null>(null);
  const card = `rounded-2xl border p-4 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"}`;

  const tabs: { id: Tab; label: string; icon: typeof Wand2 }[] = [
    { id: "generate", label: "Générer", icon: Wand2 },
    { id: "edit", label: "Modifier", icon: ImageIcon },
    { id: "analyze", label: "Analyser", icon: ScanSearch },
    { id: "history", label: "Historique", icon: History },
  ];

  const banner = (
    <div className={`rounded-xl border p-3 flex gap-2.5 text-xs leading-relaxed ${extremeDark ? "border-amber-500/25 bg-amber-950/10 text-amber-100" : "border-amber-400/25 bg-amber-500/10 text-amber-100"}`}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p><strong>Statut des capacités (0 €)</strong> : aucune API payante, aucune facturation. Les fonctions de génération/édition d’images dépendent des fournisseurs <strong>réellement configurés et disponibles gratuitement</strong>. À ce stade, aucune génération/édition d’image multi-fournisseurs n’est opérationnelle sans intégration/configuration compatible ; les options sont affichées avec leur statut réel.</p>
        <p>Alternative disponible : analyse de fichiers/images via l’espace « Analyse de fichiers » et le chat Gemini (vision) lorsque configuré. Les créations ne sont pas simulées.</p>
      </div>
    </div>
  );

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>Studio Images</h1>
          <p className={`text-sm ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Création, édition et compréhension visuelle multi-IA (selon disponibilités réelles). Interface cohérente avec JARVIS.
          </p>
        </header>

        {banner}

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border text-sm cursor-pointer ${active ? "bg-cyan-500/15 border-cyan-400/35 text-cyan-100" : "border-white/[0.08] text-slate-300"}`}>
                <Icon className="w-4 h-4" />{t.label}
              </button>
            );
          })}
        </div>

        <section className={`${card} space-y-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400 space-y-1">
              Choix de l’IA
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className={`w-full min-h-[40px] px-3 rounded-xl border text-sm bg-transparent ${extremeDark ? "border-white/[0.1] text-slate-100" : "border-cyan-400/20 text-slate-100"}`}>
                <option value="auto">Auto (meilleur fournisseur disponible)</option>
                <option value="gemini">Gemini (cerveau principal)</option>
                <option value="chatgpt">ChatGPT (nécessite accès compatible)</option>
                <option value="claude">Claude (nécessite accès compatible)</option>
                <option value="deepseek">DeepSeek (capacités réelles uniquement)</option>
                <option value="perplexity">Perplexity (capacités réelles uniquement)</option>
                <option value="llama">Llama local (si modèle compatible)</option>
              </select>
            </label>
            <div className="text-xs text-slate-400 space-y-1">
              <span className="block">Réseau</span>
              <div className={`min-h-[40px] px-3 rounded-xl border flex items-center ${isOnline ? "border-emerald-400/25 text-emerald-200" : "border-amber-400/25 text-amber-200"} ${extremeDark ? "bg-black" : "bg-[#050A14]/40"}`}>
                {isOnline ? "En ligne" : "Hors ligne (fonctions distantes indisponibles)"}
              </div>
            </div>
          </div>

          {tab === "generate" && (
            <div className="space-y-3">
              <label className="text-xs text-slate-400 space-y-1 block">
                Description (texte → image)
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="Décrivez l’image à créer (format, dimensions, style, variantes)…" className={`w-full px-3 py-2.5 rounded-xl border text-sm bg-transparent ${extremeDark ? "border-white/[0.1] text-slate-100" : "border-cyan-400/20 text-slate-100"}`} />
              </label>
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="px-2.5 py-1 rounded-lg border border-white/[0.08]">Formats/dimensions/styles : UI prête, exécution selon fournisseur disponible</span>
                <span className="px-2.5 py-1 rounded-lg border border-white/[0.08]">Variantes/modifications successives : selon capacité réelle</span>
              </div>
              <button type="button" disabled className="min-h-[42px] px-4 rounded-xl border border-white/[0.1] text-sm text-slate-400 inline-flex items-center gap-2 cursor-not-allowed opacity-70" title="Aucun fournisseur de génération d'images gratuit/opérationnel configuré">
                <Wand2 className="w-4 h-4" />Générer (indisponible sans fournisseur configuré)
              </button>
            </div>
          )}

          {tab === "edit" && (
            <div className="space-y-3">
              <label className={`inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl border text-sm cursor-pointer ${extremeDark ? "border-cyan-500/25 text-cyan-200" : "border-cyan-400/25 text-cyan-100"}`}>
                <Upload className="w-4 h-4" />Importer une image
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
              </label>
              {fileName && <p className="text-xs text-slate-300">Image sélectionnée : {fileName} (locale, non envoyée sans action explicite).</p>}
              <textarea rows={3} placeholder="Instructions de modification (fond, objets, couleurs, vêtements, éclairage, décor, recadrage, amélioration…)…" className={`w-full px-3 py-2.5 rounded-xl border text-sm bg-transparent ${extremeDark ? "border-white/[0.1] text-slate-100" : "border-cyan-400/20 text-slate-100"}`} />
              <p className="text-xs text-slate-400">Édition IA (suppression/remplacement arrière-plan, retouches sémantiques, upscaling) : <strong>non opérationnelle</strong> sans fournisseur compatible configuré. Recadrage/redimensionnement/conversion locaux peuvent être ajoutés de façon progressive sans faux backend.</p>
              <button type="button" disabled className="min-h-[42px] px-4 rounded-xl border border-white/[0.1] text-sm text-slate-400 cursor-not-allowed opacity-70">Appliquer les modifications IA (indisponible)</button>
            </div>
          )}

          {tab === "analyze" && (
            <div className="space-y-3">
              <label className={`inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl border text-sm cursor-pointer ${extremeDark ? "border-cyan-500/25 text-cyan-200" : "border-cyan-400/25 text-cyan-100"}`}>
                <Upload className="w-4 h-4" />Importer une image à analyser
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
              </label>
              <div className={`rounded-xl border p-3 text-sm flex gap-2 ${extremeDark ? "border-cyan-500/20 bg-cyan-950/10 text-slate-300" : "border-cyan-400/20 bg-cyan-500/5 text-slate-300"}`}>
                <Info className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
                <p>Analyse/description/lecture de texte (OCR selon capacités) et suggestions : disponibles via <strong>Analyse de fichiers</strong> ou le <strong>chat</strong> avec Gemini (vision) lorsque configuré. Un pipeline dédié « Analyser » multi-fournisseurs sera activé uniquement pour les fournisseurs réellement compatibles.</p>
              </div>
              <button type="button" disabled className="min-h-[42px] px-4 rounded-xl border border-white/[0.1] text-sm text-slate-400 cursor-not-allowed opacity-70">Analyser via Studio (nécessite intégration fournisseur compatible)</button>
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-2">
              <p className="text-sm text-slate-300">Historique des créations/modifications Studio Images.</p>
              <div className={`rounded-xl border p-4 text-sm text-slate-400 ${extremeDark ? "border-white/[0.06]" : "border-white/[0.08]"}`}>Aucune création enregistrée pour le moment. L’historique sera alimenté lorsque des opérations réelles seront disponibles et exécutées.</div>
              <div className="flex items-center gap-2 text-xs text-slate-500"><GitCompare className="w-4 h-4" />Comparaison des résultats : disponible lorsque plusieurs fournisseurs compatibles produisent des sorties réelles.</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
