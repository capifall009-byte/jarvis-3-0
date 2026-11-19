import { useState } from "react";
import {
  AudioLines,
  Check,
  Copy,
  Download,
  HardDrive,
  MessageSquareQuote,
  Moon,
  Quote,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  User,
  Volume2,
  Wifi,
  WifiOff,
  Wand2,
} from "lucide-react";
import { usePWAInstall } from "../../services/offline/usePWAInstall";
import {
  getAllEmotions,
  getAllPersonalities,
} from "../../services/audio/VocalStyleService";
import type {
  ConversationSession,
  MemoryItem,
  StoredFileItem,
  VocalEmotion,
  VocalPersonality,
  VocalStyle,
} from "../../types/jarvis";

interface SettingsViewProps {
  extremeDark: boolean;
  onToggleExtremeDark: () => void;
  isOnline: boolean;
  geminiModel: string | null;
  sessions: ConversationSession[];
  memories: MemoryItem[];
  files: StoredFileItem[];
  onClearAllLocalData: () => Promise<void>;
  vocalStyle: VocalStyle;
  onChangeVocalStyle: (style: VocalStyle) => void;
  startupGreetingSpokenEnabled: boolean;
  onChangeStartupGreetingSpokenEnabled: (enabled: boolean) => void;
  showDailyQuote: boolean;
  onChangeShowDailyQuote: (enabled: boolean) => void;
}

export function SettingsView({
  extremeDark,
  onToggleExtremeDark,
  isOnline,
  geminiModel,
  sessions,
  memories,
  files,
  onClearAllLocalData,
  vocalStyle,
  onChangeVocalStyle,
  startupGreetingSpokenEnabled,
  onChangeStartupGreetingSpokenEnabled,
  showDailyQuote,
  onChangeShowDailyQuote,
}: SettingsViewProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://votre-app";
  const listenUrl = `${origin}/?action=listen&new=1`;
  const queryUrl = `${origin}/?q=Bonjour%20Jarvis&new=1`;
  const siriApiUrl = `${origin}/api/siri`;

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const emotions = getAllEmotions();
  const personalities = getAllPersonalities();

  const handleExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: "3.0.0",
      memories,
      sessions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jarvis-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateVocal = (patch: Partial<VocalStyle>) => {
    onChangeVocalStyle({ ...vocalStyle, ...patch });
  };

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1
            className={`font-display text-xl sm:text-2xl font-medium ${
              extremeDark ? "text-slate-200" : "text-cyan-50"
            }`}
          >
            Paramètres, Sécurité &amp; iOS
          </h1>
          <p
            className={`text-sm leading-relaxed ${
              extremeDark ? "text-slate-500" : "text-slate-400"
            }`}
          >
            Affichage OLED, installation PWA, mode hors ligne, sauvegarde locale
            et intégration Raccourcis Siri.
          </p>
          <p className={`text-[11px] ${extremeDark ? "text-cyan-400/75" : "text-cyan-300"}`}>
            JARVIS 3.0 · Créé par Abdourahmane Fall, alias Capzo (Capzo IA).
          </p>
        </header>

        {/* Display & Battery */}
        <section
          className={`rounded-2xl border p-4 flex items-center justify-between gap-4 ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-medium text-slate-100">
              Mode sombre extrême (OLED)
            </p>
            <p className="text-xs text-slate-400">
              Fond noir pur #000000 et atténuation lumineuse pour économiser la
              batterie sur iPhone 11.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleExtremeDark}
            aria-pressed={extremeDark}
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
              extremeDark
                ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-200"
                : "border-white/[0.08] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>{extremeDark ? "Activé" : "Désactivé"}</span>
          </button>
        </section>

        {/* Vocal Control Panel */}
        <section
          className={`rounded-2xl border p-4 space-y-5 ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl border ${
                  extremeDark
                    ? "bg-cyan-950/30 border-cyan-500/20"
                    : "bg-cyan-500/10 border-cyan-400/20"
                }`}
              >
                <AudioLines className="w-5 h-5 text-cyan-300" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-medium text-slate-100">
                  Contrôle vocal — Émotions &amp; Personnalités
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ajuste la manière dont JARVIS parle (voix{" "}
                  <span className="text-cyan-300">fr-FR-HenriNeural</span>{" "}
                  conservée). Les paramètres de prosodie réellement supportés par
                  le moteur sont appliqués ; les émotions impossibles ne sont pas
                  simulées.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateVocal({ auto: !vocalStyle.auto })}
              aria-pressed={vocalStyle.auto}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                vocalStyle.auto
                  ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-100"
                  : "border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
              }`}
            >
              <Wand2 className="w-4 h-4" />
              <span>Auto {vocalStyle.auto ? "ON" : "OFF"}</span>
            </button>
          </div>

          {/* Personality */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
              <User className="w-3.5 h-3.5" />
              <span>Personnalité vocale</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {personalities.map((p) => {
                const active = vocalStyle.personality === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      updateVocal({ personality: p.id as VocalPersonality })
                    }
                    className={`text-left rounded-xl border px-3 py-2.5 transition-colors cursor-pointer ${
                      active
                        ? "border-cyan-400/40 bg-cyan-500/10"
                        : extremeDark
                        ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                        : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <p
                      className={`text-xs font-medium ${
                        active ? "text-cyan-100" : "text-slate-200"
                      }`}
                    >
                      {p.label}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {p.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Emotion */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Émotion</span>
              </div>
              <button
                type="button"
                onClick={() => updateVocal({ emotion: null })}
                className={`text-[11px] px-2.5 py-1 rounded-lg border cursor-pointer ${
                  vocalStyle.emotion === null
                    ? "border-cyan-400/35 text-cyan-200 bg-cyan-500/10"
                    : "border-white/[0.08] text-slate-400 hover:text-slate-200"
                }`}
              >
                Neutre
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {emotions.map((e) => {
                const active = vocalStyle.emotion === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() =>
                      updateVocal({ emotion: e.id as VocalEmotion })
                    }
                    className={`min-h-[36px] px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                        : extremeDark
                        ? "border-white/[0.06] bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]"
                        : "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
            {vocalStyle.auto && (
              <p className="text-[11px] text-cyan-300/80">
                Mode auto activé : une détection contextuelle locale choisit
                l&apos;émotion parmi les 12 disponibles avant la synthèse vocale,
                module l&apos;amplitude de la prosodie selon l&apos;expressivité,
                et le ton analysé sert de repli. Le moteur Edge TTS applique
                rythme/hauteur/volume : il ne s&apos;agit pas d&apos;une synthèse
                émotionnelle native.
              </p>
            )}
          </div>

          {/* Intensity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
                <Volume2 className="w-3.5 h-3.5" />
                <span>Intensité émotionnelle</span>
              </div>
              <span className="text-xs font-mono-tabular text-slate-300">
                {Math.round(vocalStyle.intensity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(vocalStyle.intensity * 100)}
              onChange={(e) =>
                updateVocal({ intensity: Number(e.target.value) / 100 })
              }
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-cyan-400 bg-white/[0.08]"
              aria-label="Intensité émotionnelle"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Subtil</span>
              <span>Marqué</span>
            </div>
          </div>
        </section>

        {/* Home Experience */}
        <section
          className={`rounded-2xl border p-4 space-y-4 ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl border ${
                extremeDark ? "bg-cyan-950/30 border-cyan-500/20" : "bg-cyan-500/10 border-cyan-400/20"
              }`}
            >
              <MessageSquareQuote className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-slate-100">Accueil</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Personnalisez le message d&apos;accueil et la citation quotidienne affichée sur l&apos;écran d&apos;accueil.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-medium text-slate-100 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-cyan-300" />
                  Message vocal d&apos;accueil au démarrage
                </p>
                <p className="text-xs text-slate-400">
                  Prononce « Salut, je suis JARVIS. Comment pourrais-je vous aider ? » une seule fois au démarrage (voix fr-FR-HenriNeural, paramètres vocaux actuels). Non répété à la navigation ou à l&apos;actualisation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChangeStartupGreetingSpokenEnabled(!startupGreetingSpokenEnabled)}
                aria-pressed={startupGreetingSpokenEnabled}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  startupGreetingSpokenEnabled
                    ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-100"
                    : "border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                }`}
              >
                <span>{startupGreetingSpokenEnabled ? "Activé" : "Désactivé"}</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-medium text-slate-100 flex items-center gap-2">
                  <Quote className="w-4 h-4 text-cyan-300" />
                  Citation du jour
                </p>
                <p className="text-xs text-slate-400">
                  Affiche une citation (auteur indiqué lorsqu&apos;il est connu) renouvelée automatiquement chaque nouveau jour local, sans changer à chaque actualisation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChangeShowDailyQuote(!showDailyQuote)}
                aria-pressed={showDailyQuote}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  showDailyQuote
                    ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-100"
                    : "border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                }`}
              >
                <span>{showDailyQuote ? "Affichée" : "Masquée"}</span>
              </button>
            </div>
          </div>
        </section>

        {/* PWA Install & Offline Status */}
        <section
          className={`rounded-2xl border p-4 space-y-4 ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {isOnline ? (
                <Wifi className="w-5 h-5 text-cyan-300 shrink-0" />
              ) : (
                <WifiOff className="w-5 h-5 text-amber-300 shrink-0" />
              )}
              <div>
                <h2 className="text-sm font-medium text-slate-100">
                  État réseau &amp; Application installable (PWA)
                </h2>
                <p className="text-xs text-slate-400">
                  {isOnline
                    ? `Connecté · Moteur ${geminiModel || "Gemini Flash"}`
                    : "Hors ligne · Souvenirs, historique et coffre local disponibles"}
                </p>
              </div>
            </div>

            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={() => void install()}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Installer JARVIS</span>
              </button>
            )}
          </div>

          {isInstalled ? (
            <p className="text-xs text-cyan-300">
              JARVIS 3.0 est installé comme application autonome sur cet appareil.
            </p>
          ) : isIOS ? (
            <p className="text-xs text-slate-300 leading-relaxed">
              Sur Safari iPhone : touchez le bouton Partager en bas de l&apos;écran,
              puis « Sur l&apos;écran d&apos;accueil » pour obtenir une icône
              JARVIS plein écran.
            </p>
          ) : (
            !isInstallable && (
              <p className="text-xs text-slate-400">
                Sur Windows (Edge ou Chrome), utilisez l&apos;icône d&apos;installation
                dans la barre d&apos;adresse pour épingler JARVIS 3.0.
              </p>
            )
          )}

          <div className="pt-3 border-t border-white/[0.07] text-xs text-slate-400 space-y-1">
            <p className="font-medium text-slate-300">
              Commandes disponibles sans Internet :
            </p>
            <p>
              « Quelle heure est-il ? », « Mes souvenirs », « Mes fichiers »,
              « Mode sombre extrême », « Nouvelle session ».
            </p>
          </div>
        </section>

        {/* Security & Local Data */}
        <section
          className={`rounded-2xl border p-4 space-y-4 ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-slate-100">
                Sécurité &amp; Données personnelles
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Votre clé GEMINI_API_KEY reste strictement côté serveur et
                n&apos;est jamais transmise au navigateur. Vos souvenirs,
                conversations et fichiers restent stockés localement sur cet
                appareil.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono-tabular text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-300" />
              {memories.length} souvenir(s)
            </span>
            <span aria-hidden="true">·</span>
            <span>{sessions.length} conversation(s)</span>
            <span aria-hidden="true">·</span>
            <span>{files.length} fichier(s)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-cyan-400/25 bg-cyan-500/12 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exporter sauvegarde JSON</span>
            </button>

            {!confirmPurge ? (
              <button
                type="button"
                onClick={() => setConfirmPurge(true)}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-red-400/25 bg-red-500/10 text-xs font-medium text-red-200 hover:bg-red-500/20 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Effacer les données locales</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void onClearAllLocalData();
                    setConfirmPurge(false);
                  }}
                  className="min-h-[44px] px-3.5 rounded-xl bg-red-500/25 border border-red-400/45 text-xs font-medium text-red-100 cursor-pointer"
                >
                  Confirmer la suppression
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPurge(false)}
                  className="min-h-[44px] px-3 rounded-xl border border-white/[0.08] text-xs text-slate-300 cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Siri Shortcuts & Native iOS Architecture */}
        <section
          className={`rounded-2xl border p-4 space-y-4 ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-slate-100">
                Raccourcis Siri &amp; Évolution iOS native (App Intents)
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Déclenchez JARVIS depuis Apple Raccourcis dès aujourd&apos;hui
                via Safari ou l&apos;API mains libres. Une future application
                native iOS (Swift / App Intents) pourra réutiliser directement
                ces mêmes points d&apos;accès sécurisés.
              </p>
            </div>
          </div>

          {[
            { id: "listen", label: "Ouvrir prêt à écouter", value: listenUrl },
            { id: "query", label: "Envoyer une question (?q=)", value: queryUrl },
            { id: "api", label: "Endpoint Siri mains libres (POST)", value: siriApiUrl },
          ].map((entry) => (
            <div key={entry.id} className="space-y-1">
              <p className="text-xs font-medium text-cyan-300">{entry.label}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono-tabular border border-white/[0.08] bg-black/50 rounded-xl px-3 py-2.5 truncate text-slate-300">
                  {entry.value}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy(entry.id, entry.value)}
                  aria-label={`Copier ${entry.label}`}
                  className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-white/[0.08] bg-white/[0.04] text-cyan-300 hover:bg-cyan-500/20 shrink-0 cursor-pointer"
                >
                  {copiedId === entry.id ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
