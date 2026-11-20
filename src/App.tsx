import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Mic, X } from "lucide-react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ControlDock } from "./components/ControlDock";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { JarvisOrb } from "./components/JarvisOrb";
import { NavShell } from "./components/NavShell";
import { TranscriptStream } from "./components/TranscriptStream";
import { ViewFallback } from "./components/ViewFallback";
import { ModeSelector } from "./components/ModeSelector";
import { HomeView } from "./components/views/HomeView";

/**
 * Phase 9 : chargement différé des vues. Le shell, le chat et l'accueil restent
 * immédiats ; les 26 autres vues — dont les plus lourdes (WebSearchView,
 * IntelligenceView, VideoView/FFmpeg) — ne sont téléchargées qu'à la demande.
 * Aucune fonctionnalité n'est supprimée.
 */
const FilesView = lazy(() => import("./components/views/FilesView").then((m) => ({ default: m.FilesView })));
const MemoryView = lazy(() => import("./components/views/MemoryView").then((m) => ({ default: m.MemoryView })));
const SettingsView = lazy(() => import("./components/views/SettingsView").then((m) => ({ default: m.SettingsView })));
const NewsView = lazy(() => import("./components/views/NewsView").then((m) => ({ default: m.NewsView })));
const SocialHubView = lazy(() => import("./components/views/SocialHubView").then((m) => ({ default: m.SocialHubView })));
const VideoView = lazy(() => import("./components/views/VideoView").then((m) => ({ default: m.VideoView })));
const AiVideoStudioView = lazy(() => import("./components/views/AiVideoStudioView").then((m) => ({ default: m.AiVideoStudioView })));
const RemotionStudioView = lazy(() => import("./components/views/RemotionStudioView").then((m) => ({ default: m.RemotionStudioView })));
const ReelStudioView = lazy(() => import("./components/views/ReelStudioView").then((m) => ({ default: m.ReelStudioView })));
const WebSearchView = lazy(() => import("./components/views/WebSearchView").then((m) => ({ default: m.WebSearchView })));
const IntelligenceView = lazy(() => import("./components/views/IntelligenceView").then((m) => ({ default: m.IntelligenceView })));
const ProjectsView = lazy(() => import("./components/views/ProjectsView").then((m) => ({ default: m.ProjectsView })));
const ModesView = lazy(() => import("./components/views/ModesView").then((m) => ({ default: m.ModesView })));
const ResearchView = lazy(() => import("./components/views/ResearchView").then((m) => ({ default: m.ResearchView })));
const ControlCenterView = lazy(() => import("./components/views/ControlCenterView").then((m) => ({ default: m.ControlCenterView })));
const AiHubView = lazy(() => import("./components/views/AiHubView").then((m) => ({ default: m.AiHubView })));
const ImageStudioView = lazy(() => import("./components/views/ImageStudioView").then((m) => ({ default: m.ImageStudioView })));
const MobileAccessView = lazy(() => import("./components/views/MobileAccessView").then((m) => ({ default: m.MobileAccessView })));
const MissionsView = lazy(() => import("./components/views/MissionsView").then((m) => ({ default: m.MissionsView })));
const SkillsView = lazy(() => import("./components/views/SkillsView").then((m) => ({ default: m.SkillsView })));
const AgentsView = lazy(() => import("./components/views/AgentsView").then((m) => ({ default: m.AgentsView })));
const SchedulerView = lazy(() => import("./components/views/SchedulerView").then((m) => ({ default: m.SchedulerView })));
const ToolsView = lazy(() => import("./components/views/ToolsView").then((m) => ({ default: m.ToolsView })));
const DevicesView = lazy(() => import("./components/views/DevicesView").then((m) => ({ default: m.DevicesView })));
const ContextMemoryView = lazy(() => import("./components/views/ContextMemoryView").then((m) => ({ default: m.ContextMemoryView })));
const CommandHubView = lazy(() => import("./components/views/CommandHubView").then((m) => ({ default: m.CommandHubView })));
import { buildBrainUnifiedContext } from "./services/brain/BrainContext";
import { AudioEngine } from "./services/audio/AudioEngine";
import {
  getDefaultVocalStyle,
  getVocalPreset,
  isVocalStyleActive,
  loadVocalStyle,
  saveVocalStyle,
  detectAutoEmotion,
} from "./services/audio/VocalStyleService";
import {
  clearStoredFiles,
  listStoredFiles,
} from "./services/files/FileVaultRepository";
import {
  hasStartupGreetingBeenSpoken,
  loadAppPreferences,
  markStartupGreetingSpoken,
  saveAppPreferences,
  type AppPreferences,
} from "./services/preferences/AppPreferences";
import { streamGeminiResponse, extractMemoryTags } from "./services/gemini/GeminiClient";
import { coreClient } from "./services/core/CoreClient";
import { analyzeImageWithOllama, chatWithOllama } from "./services/ai/AiProvidersClient";
import { getStoredAiSelection, loadAiProviderRegistry, selectAiProvider } from "./services/ai/AiProviderManager";
import { detectSensitiveMemory, memoryRepository } from "./services/memory/MemoryRepository";
import {
  getActiveModeId,
  setActiveModeId,
  listCustomModes,
  saveCustomMode,
  deleteCustomMode,
  setCustomModeActive,
  resolveMode,
  composeModeInstructions,
} from "./services/modes/ModeRepository";
import {
  executeOfflineCommand,
  useOnlineStatus,
} from "./services/offline/OfflineEngine";
import { SpeechInput } from "./services/speech/SpeechInput";
import {
  conversationRepository,
  deriveSessionTitle,
} from "./services/storage/ConversationRepository";
import { clearSavedSearches } from "./services/web/WebSearchClient";
import {
  addIntelligenceHistory,
  clearIntelligenceHistory,
  listIntelligenceHistory,
  loadIntelligenceProfile,
  saveIntelligenceProfile,
} from "./services/intelligence/IntelligenceRepository";
import {
  clearProjects,
  createProject,
  listProjects,
  removeProject,
  saveProject,
} from "./services/projects/ProjectRepository";
import {
  TONE_PROSODY_PROFILES,
  analyzeUserSentiment,
  normalizeTone,
} from "../shared/sentiment.ts";
import type { JarvisTone, SentimentAnalysis } from "../shared/sentiment.ts";
import type {
  AppView,
  ChatAttachment,
  ConnectionErrorInfo,
  ConversationSession,
  CustomMode,
  IntelligenceHistoryEvent,
  IntelligenceProfile,
  JarvisMode,
  MemoryCategory,
  MemoryItem,
  ProjectItem,
  StoredFileItem,
  TranscriptMessage,
  VocalStyle,
  VoiceState,
} from "./types/jarvis";

const EXTREME_DARK_STORAGE_KEY = "jarvis_extreme_dark_v1";

function prosodyToTts(p: { rate: number; pitch: number; expressiveness: number }): {
  rate: string;
  pitch: string;
  volume: string;
} {
  const ratePct = Math.round((p.rate - 1) * 100);
  const pitchHz = Math.round((p.pitch - 1) * 60);
  return {
    rate: `${ratePct >= 0 ? "+" : ""}${ratePct}%`,
    pitch: `${pitchHz >= 0 ? "+" : ""}${pitchHz}Hz`,
    volume: "+0%",
  };
}

/** Mobile-first : sur petit écran, l'application s'ouvre directement sur le chat. */
function getInitialView(): AppView {
  if (typeof window === "undefined") return "home";
  try {
    return window.matchMedia("(max-width: 1023px)").matches ? "conversations" : "home";
  } catch {
    return "home";
  }
}

const VALID_VIEWS: AppView[] = [
  "dashboard",
  "home",
  "conversations",
  "memory",
  "search",
  "research",
  "files",
  "video",
  "aiVideo",
  "remotionStudio",
  "reels",
  "settings",
  "news",
  "social",
  "intelligence",
  "projects",
  "modes",
  "controlCenter",
  "aiHub",
  "imageStudio",
  "mobileAccess",
  "missions",
  "skills",
  "agents",
  "scheduler",
  "tools",
  "devices",
  "contextMemory",
];

function createMsgId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const VOICE_STATUS_TEXT: Record<VoiceState, string> = {
  idle: "EN ATTENTE",
  connecting: "INITIALISATION",
  listening: "Ã‰COUTE",
  speaking: "PAROLE",
  thinking: "RÃ‰FLEXION",
  offline: "HORS LIGNE",
  error: "INCIDENT",
};

/**
 * Extracts completed sentences from a streaming buffer for low-latency progressive TTS.
 */
function popReadySentence(buffer: string): {
  sentence: string | null;
  rest: string;
} {
  const match = buffer.match(/^([\s\S]{18,}?[.!?â€¦\n]+)(?:\s+|$)([\s\S]*)$/);
  if (match) {
    return {
      sentence: match[1].trim(),
      rest: match[2],
    };
  }
  if (buffer.length > 140) {
    const clauseMatch = buffer.match(/^([\s\S]{60,}?[,;:])\s+([\s\S]*)$/);
    if (clauseMatch) {
      return {
        sentence: clauseMatch[1].trim(),
        rest: clauseMatch[2],
      };
    }
  }
  return { sentence: null, rest: buffer };
}

export default function App() {
  const isOnline = useOnlineStatus();

  const [activeView, setActiveView] = useState<AppView>(getInitialView);
  const [composerDraft, setComposerDraft] = useState("");
  const [sessions, setSessions] = useState<ConversationSession[]>(() => {
    const list = conversationRepository.listSessions();
    if (list.length > 0) return list;
    return [conversationRepository.createSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const savedId = conversationRepository.getActiveSessionId();
    const list = conversationRepository.listSessions();
    if (savedId && list.some((s) => s.id === savedId)) {
      return savedId;
    }
    return list[0]?.id ?? "";
  });

  const [memories, setMemories] = useState<MemoryItem[]>(() =>
    memoryRepository.listMemories()
  );
  const [storedFiles, setStoredFiles] = useState<StoredFileItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [intelligenceProfile, setIntelligenceProfile] = useState<IntelligenceProfile>(() =>
    loadIntelligenceProfile()
  );
  const [intelligenceHistory, setIntelligenceHistory] = useState<IntelligenceHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isSending, setIsSending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [geminiModel, setGeminiModel] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ConnectionErrorInfo | null>(null);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const [siriListenPending, setSiriListenPending] = useState(false);
  const [isExtremeDark, setIsExtremeDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(EXTREME_DARK_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [liveDraftText, setLiveDraftText] = useState("");
  const [activeTone, setActiveTone] = useState<JarvisTone>("neutral");

  const [activeModeId, setActiveModeIdState] = useState<string>(() => getActiveModeId());
  const [customModes, setCustomModes] = useState<CustomMode[]>([]);
  const [activeMode, setActiveMode] = useState<JarvisMode | null>(null);

  const [vocalStyle, setVocalStyle] = useState<VocalStyle>(() => loadVocalStyle());
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() => loadAppPreferences());
  const startupGreetingAttemptedRef = useRef(false);
  const skipStartupGreetingRef = useRef(false);

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const speechInputRef = useRef<SpeechInput | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const voiceStateRef = useRef<VoiceState>(voiceState);
  const activeSessionIdRef = useRef<string>(activeSessionId);
  const sessionsRef = useRef<ConversationSession[]>(sessions);
  const memoriesRef = useRef<MemoryItem[]>(memories);
  const projectsRef = useRef<ProjectItem[]>(projects);
  const intelligenceProfileRef = useRef<IntelligenceProfile>(intelligenceProfile);
  const activeModeRef = useRef<JarvisMode | null>(activeMode);
  const vocalStyleRef = useRef<VocalStyle>(vocalStyle);
  const storedFilesRef = useRef<StoredFileItem[]>(storedFiles);
  const isOnlineRef = useRef<boolean>(isOnline);
  const intentHandledRef = useRef(false);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    if (activeSessionId) {
      conversationRepository.setActiveSessionId(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    intelligenceProfileRef.current = intelligenceProfile;
    // garder la mÃ©moire globale synchronisÃ©e
    memoryRepository.setMemoryEnabled(intelligenceProfile.memoryEnabled);
  }, [intelligenceProfile]);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  useEffect(() => {
    vocalStyleRef.current = vocalStyle;
    saveVocalStyle(vocalStyle);
    const engine = audioEngineRef.current;
    if (!engine) return;
    if (isVocalStyleActive(vocalStyle)) {
      engine.setVocalStyle(vocalStyle);
    } else {
      // RÃ©initialiser vers le style neutre sans surcharger la prosodie des modes
      engine.setVocalStyle(getDefaultVocalStyle());
    }
  }, [vocalStyle]);

  useEffect(() => {
    storedFilesRef.current = storedFiles;
  }, [storedFiles]);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    saveAppPreferences(appPreferences);
  }, [appPreferences]);

  useEffect(() => {
    document.documentElement.classList.toggle("extreme-dark", isExtremeDark);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", isExtremeDark ? "#000000" : "#05080d");
    }
    try {
      localStorage.setItem(EXTREME_DARK_STORAGE_KEY, String(isExtremeDark));
    } catch {
      // Ignore storage quota errors
    }
  }, [isExtremeDark]);

  const reloadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const items = await listProjects();
      setProjects(items);
    } catch (e) {
      setProjectsError(
        e instanceof Error ? e.message : "Ã‰chec du chargement des projets (IndexedDB)."
      );
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const reloadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const items = await listIntelligenceHistory();
      setIntelligenceHistory(items);
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "Ã‰chec du chargement de l'historique (IndexedDB)."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Hydrate persistent memories, file vault, custom modes, projects & intelligence from storage on mount
  useEffect(() => {
    void memoryRepository.hydrateFromIndexedDb().then(setMemories);
    void listStoredFiles().then(setStoredFiles);
    void listCustomModes().then(setCustomModes);
    void reloadProjects();
    void reloadHistory();
  }, [reloadProjects, reloadHistory]);

  useEffect(() => {
    const mode = resolveMode(activeModeId, customModes);
    setActiveMode(mode);
  }, [activeModeId, customModes]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  // Initialize AudioEngine & SpeechInput singletons
  useEffect(() => {
    const engine = new AudioEngine();
    const speech = new SpeechInput();
    audioEngineRef.current = engine;
    speechInputRef.current = speech;

    // Appliquer le style vocal initial s'il est actif
    const initialVocal = loadVocalStyle();
    if (isVocalStyleActive(initialVocal)) {
      engine.setVocalStyle(initialVocal);
    }

    engine.setCallbacks({
      onSpeakingStart: () => {
        setVoiceState("speaking");
      },
      onSpeakingEnd: () => {
        if (voiceStateRef.current === "speaking") {
          setVoiceState("idle");
        }
      },
      onError: (msg) => {
        setErrorInfo({
          title: "SynthÃ¨se vocale",
          detail: msg,
        });
      },
    });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void engine.resumeIfInterrupted();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      requestAbortRef.current?.abort();
      speech.stop();
      engine.dispose();
    };
  }, []);

  // Verify Google Gemini backend readiness on mount / reconnect
  useEffect(() => {
    if (!isOnline) return;
    fetch("/api/health")
      .then((res) => res.json())
      .then(
        (data: {
          ok?: boolean;
          geminiConfigured?: boolean;
          model?: string | null;
          error?: string;
        }) => {
          if (data.model) {
            setGeminiModel(data.model);
          }
          if (data.geminiConfigured === false || data.ok === false) {
            setErrorInfo({
              title: "Configuration Gemini requise",
              detail:
                data.error ||
                "La clÃ© API GEMINI_API_KEY n'est pas configurÃ©e cÃ´tÃ© serveur.",
            });
          }
        }
      )
      .catch(() => {
        // Ignore transient offline or startup check
      });
  }, [isOnline]);

  const updateSessionMessages = useCallback(
    (
      sessionId: string,
      updater: (messages: TranscriptMessage[]) => TranscriptMessage[]
    ) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId) return session;
          const updatedMessages = updater(session.messages);
          const updatedSession: ConversationSession = {
            ...session,
            messages: updatedMessages,
            title:
              session.title === "Nouvelle session"
                ? deriveSessionTitle(updatedMessages)
                : session.title,
            updatedAt: Date.now(),
          };
          conversationRepository.saveSession(updatedSession);
          return updatedSession;
        })
      );
    },
    []
  );

  const stopAllActivity = useCallback(() => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    speechInputRef.current?.stop();
    audioEngineRef.current?.stopPlayback();
    audioEngineRef.current?.setSyntheticListeningEnergy(0);
    setInterimTranscript("");
    setIsSending(false);
    setVoiceState("idle");
  }, []);

  /** STOP GLOBAL : arrêt local + interruption des missions actives du noyau. */
  const stopGlobal = useCallback(() => {
    stopAllActivity();
    void coreClient.stopAll("STOP GLOBAL (interface)").catch((err) => {
      console.warn("[core] STOP GLOBAL indisponible :", err);
    });
  }, [stopAllActivity]);

  /** Phase 9 — handlers du tableau de bord : le Core reste la source de vérité. */
  const handleDashboardStop = useCallback(() => {
    stopAllActivity();
    return coreClient.stopAll("STOP GLOBAL (tableau de bord)").catch((err) => {
      console.warn("[core] STOP GLOBAL indisponible :", err);
    });
  }, [stopAllActivity]);

  const handleDashboardResume = useCallback(() =>
    coreClient.resumeCore("Reprise depuis le tableau de bord").catch((err) => {
      console.warn("[core] reprise indisponible :", err);
    }), []);

  const speakPlainText = useCallback((text: string) => {
    const trimmed = text.trim();
    const engine = audioEngineRef.current;
    if (!trimmed || !engine) return;
    // Le mute explicite de l'utilisateur doit rester respectÃ©, y compris depuis News/WebSearch.
    if (engine.getMuted()) return;
    engine.prepareOnUserGesture();
    const mode = activeModeRef.current;
    const vs = vocalStyleRef.current;
    const useVocal = isVocalStyleActive(vs);
    // En mode auto, l'Ã©motion est dÃ©tectÃ©e avant le tour vocal : elle influence donc bien la voix.
    const speechVs =
      useVocal && vs.auto
        ? { ...vs, emotion: detectAutoEmotion(trimmed, mode?.tone ?? "neutral") }
        : vs;
    const genId = engine.beginSpeechTurn(
      mode?.tone ?? "neutral",
      mode && !useVocal ? prosodyToTts(mode.prosody) : null,
      useVocal ? speechVs : null
    );
    let buffer = trimmed;
    let extracted = popReadySentence(buffer);
    while (extracted.sentence) {
      engine.enqueueSentence(extracted.sentence, genId);
      buffer = extracted.rest;
      extracted = popReadySentence(buffer);
    }
    if (buffer.trim()) {
      engine.enqueueSentence(buffer.trim(), genId);
    }
    engine.markStreamComplete(genId);
  }, []);

  const handleNewSession = useCallback(() => {
    stopAllActivity();
    const created = conversationRepository.createSession();
    setSessions(conversationRepository.listSessions());
    setActiveSessionId(created.id);
    setActiveView("conversations");
    setErrorInfo(null);
  }, [stopAllActivity]);

  const submitToGemini = useCallback(
    async (text: string, source: "voice" | "text", attachments?: ChatAttachment[]) => {
      const trimmed = text.trim();
      const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 8) : [];
      const hasAttachments = safeAttachments.length > 0;
      if (!trimmed && !hasAttachments) return;

      requestAbortRef.current?.abort();
      audioEngineRef.current?.stopPlayback();
      setErrorInfo(null);

      const sessionId = activeSessionIdRef.current;
      const priorMessages =
        sessionsRef.current.find((s) => s.id === sessionId)?.messages ?? [];
      const recentUserTexts = priorMessages
        .filter((m) => m.role === "user")
        .map((m) => m.text);
      const instantSentiment = analyzeUserSentiment(trimmed || "pièces jointes", recentUserTexts);

      const userMsg: TranscriptMessage = {
        id: createMsgId(),
        role: "user",
        text: trimmed,
        timestamp: Date.now(),
        source,
        sentiment: instantSentiment,
        attachments: hasAttachments ? safeAttachments : undefined,
      };
      const assistantMsgId = createMsgId();

      updateSessionMessages(sessionId, (msgs) => [...msgs, userMsg]);

      const detectImageGenerationIntent = (msg: string, atts: ChatAttachment[]) => {
        const t = (msg || "").toLowerCase();
        const hasInputImages = atts.some((a) => a.kind === "image" || (a.mimeType || "").startsWith("image/"));
        const genVerbs = /(g[eé]n[eè]re|g[eé]n[eé]rer|cr[eé]e|cr[eé]er|dessine|dessiner|fabrique|produis|fais[- ]moi|peins|illustre)/i;
        const imageNoun = /(image|illustration|visuel|logo|affiche|dessin|photo|wallpaper|fond d['’]?[eé]cran)/i;
        const explicit = /\/image\b|!image\b/i.test(msg || "");
        const asksModify = /(modifie|modifier|change|changer|am[eé]liore|retravaille|variation|autre version|refais)/i.test(msg || "");
        const wantsNewImage = explicit || (genVerbs.test(t) && imageNoun.test(t));
        // Si des images sont jointes, on privilégie l'analyse/modification par IA sauf demande explicite de génération nouvelle.
        if (hasInputImages && !explicit && !(/\bnouvelle image\b|\bune autre image\b|\bg[eé]n[eè]re une image\b/i.test(msg || ""))) {
          return { isGen: false, prompt: msg, wantsModify: asksModify };
        }
        return { isGen: wantsNewImage, prompt: msg, wantsModify: asksModify && wantsNewImage };
      };

      const genIntent = detectImageGenerationIntent(trimmed, safeAttachments);

      // Honest Offline Mode: execute local commands, never pretend Gemini works offline
      if (!isOnlineRef.current) {
        if (genIntent.isGen) {
          updateSessionMessages(sessionId, (msgs) => [
            ...msgs,
            {
              id: assistantMsgId,
              role: "assistant",
              text: "La génération d'images nécessite une connexion réseau (service Pollinations.ai gratuit). Réessayez lorsque vous serez en ligne.",
              timestamp: Date.now(),
              source: "text",
              tone: "calm",
            },
          ]);
          return;
        }
        const offlineResult = executeOfflineCommand(trimmed || "pièces jointes", {
          memories: memoriesRef.current,
          sessions: sessionsRef.current,
          files: storedFilesRef.current,
          onToggleExtremeDark: (force) =>
            setIsExtremeDark((prev) => (typeof force === "boolean" ? force : !prev)),
          onNewSession: handleNewSession,
        });
        const attachNote = hasAttachments ? "\n\n[Pièces jointes reçues mais non analysées : l'analyse d'images/fichiers par IA est indisponible hors ligne.]" : "";
        updateSessionMessages(sessionId, (msgs) => [
          ...msgs,
          {
            id: assistantMsgId,
            role: "assistant",
            text: (offlineResult.reply || "Mode hors ligne.") + attachNote,
            timestamp: Date.now(),
            source: "text",
            tone: "calm",
          },
        ]);

        const engine = audioEngineRef.current;
        if (engine && !engine.getMuted()) {
          const genId = engine.beginSpeechTurn("calm");
          engine.enqueueSentence((offlineResult.reply || "Mode hors ligne.").slice(0, 300), genId);
          engine.markStreamComplete(genId);
        }
        return;
      }

      // Génération d'images réelle (Pollinations.ai, 0€) si demandée explicitement
      if (genIntent.isGen) {
        setIsSending(true);
        setVoiceState("thinking");
        try {
          const prompt = (trimmed || "").replace(/^\/image\s*/i, "").replace(/^!image\s*/i, "").trim() || "image créative";
          const style = /futur/i.test(prompt) ? "futuristic" : /r[eé]al/i.test(prompt) ? "realistic" : /artist|peint/i.test(prompt) ? "artistic" : /pro|corpor/i.test(prompt) ? "professional" : undefined;
          const resp = await fetch("/api/images/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, style }),
          });
          const data = await resp.json().catch(() => ({} as any));
          if (!resp.ok || !data?.ok || !data?.url) {
            const errMsg = (data && (data.error || data.message)) || `Échec de génération (${resp.status}).`;
            updateSessionMessages(sessionId, (msgs) => [
              ...msgs,
              { id: assistantMsgId, role: "assistant", text: `Génération d'image impossible : ${errMsg}`, timestamp: Date.now(), source: "text", tone: "calm" },
            ]);
            return;
          }
          const imgUrl = String(data.url);
          const reply = `Image générée à partir de votre demande${data.style ? ` (style ${data.style})` : ""} via Pollinations.ai (0€). Vous pouvez la télécharger ou me demander une modification (nouvelle version générée avec un prompt ajusté).`;
          updateSessionMessages(sessionId, (msgs) => [
            ...msgs,
            {
              id: assistantMsgId,
              role: "assistant",
              text: reply,
              timestamp: Date.now(),
              source: "text",
              tone: "calm",
              generatedImages: [{ id: createMsgId(), url: imgUrl, prompt: String(data.finalPrompt || data.prompt || prompt) }],
              providerLabel: "Pollinations.ai (0€)",
            },
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erreur inconnue lors de la génération.";
          updateSessionMessages(sessionId, (msgs) => [
            ...msgs,
            { id: assistantMsgId, role: "assistant", text: `Génération d'image échouée : ${msg}`, timestamp: Date.now(), source: "text", tone: "calm" },
          ]);
        } finally {
          setIsSending(false);
          if (voiceStateRef.current === "thinking") setVoiceState("idle");
        }
        return;
      }

      const controller = new AbortController();
      requestAbortRef.current = controller;

      setIsSending(true);
      setVoiceState("thinking");
      setActiveTone(instantSentiment.tone);

      const engine = audioEngineRef.current;
      const activeModeForSpeech = activeModeRef.current;
      const vs = vocalStyleRef.current;
      const useVocal = isVocalStyleActive(vs);
      const speechVs =
        useVocal && vs.auto
          ? {
              ...vs,
              emotion: detectAutoEmotion(trimmed, instantSentiment.tone),
            }
          : vs;
      const vocalPreset = useVocal ? getVocalPreset(speechVs) : null;
      const speechGenId = engine
        ? engine.beginSpeechTurn(
            activeModeForSpeech?.tone ?? instantSentiment.tone,
            activeModeForSpeech && !useVocal
              ? prosodyToTts(activeModeForSpeech.prosody)
              : null,
            useVocal ? speechVs : null
          )
        : 0;
      let resolvedTurnTone: JarvisTone = instantSentiment.tone;
      let ttsSentenceBuffer = "";
      let assistantCreated = false;

      const applyExtractedMemories = (extractedMemories: string[]) => {
        if (!extractedMemories || extractedMemories.length === 0) return;
        const profile = intelligenceProfileRef.current;
        if (!profile.memoryEnabled) {
          setMemoryToast("MǸmoire dǸsactivǸe : rien n'a ǸtǸ enregistrǸ.");
          setTimeout(() => setMemoryToast(null), 4000);
          return;
        }
        let savedCount = 0;
        let blockedSensitive = 0;
        for (const fact of extractedMemories) {
          const sensitive = detectSensitiveMemory(fact);
          if (sensitive && !profile.autoSaveSensitive) {
            blockedSensitive += 1;
            void addIntelligenceHistory({
              type: "memory_update",
              title: "MǸmoire sensible non enregistrǸe automatiquement",
              detail: "Une information potentiellement sensible a ǸtǸ dǸtectǸe dans une demande de mǸmorisation et n'a pas ǸtǸ enregistrǸe sans autorisation explicite.",
              level: "warning",
              relatedConversationId: sessionId,
            }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("�%vǸnement historique non enregistrǸ:", e));
            continue;
          }
          const added = memoryRepository.addMemory(
            fact,
            undefined,
            activeModeRef.current?.id,
            { source: "assistant", kind: "fact", sensitive }
          );
          if (added) {
            savedCount += 1;
            void addIntelligenceHistory({
              type: "memory_update",
              title: "Souvenir enregistrǸ",
              detail: added.fact,
              level: "info",
              relatedConversationId: sessionId,
            }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("�%vǸnement historique non enregistrǸ:", e));
          }
        }
        if (savedCount > 0 || blockedSensitive > 0) {
          setMemories(memoryRepository.listMemories());
        }
        if (blockedSensitive > 0) {
          setMemoryToast("Information sensible dǸtectǸe : mǸmorisation automatique bloquǸe (autorisation requise).");
        } else if (savedCount > 0) {
          setMemoryToast(savedCount === 1 ? "Souvenir enregistrǸ." : `${savedCount} souvenirs enregistrǸs.`);
        }
        if (savedCount > 0 || blockedSensitive > 0) {
          setTimeout(() => setMemoryToast(null), 4500);
        }
      };

      const finalizeAssistantReply = (reply: string, tone: JarvisTone, modelName: string | null, extractedMemories: string[], providerLabel?: string) => {
        const finalTone = tone || resolvedTurnTone;
        resolvedTurnTone = finalTone;
        setActiveTone(finalTone);
        if (modelName) setGeminiModel(modelName);
        engine?.setTurnTone(finalTone, speechGenId);

        if (!assistantCreated) {
          assistantCreated = true;
          setIsSending(false);
          updateSessionMessages(sessionId, (msgs) => [
            ...msgs,
            {
              id: assistantMsgId,
              role: "assistant",
              text: reply,
              timestamp: Date.now(),
              source: engine && !engine.getMuted() ? "voice" : "text",
              isPartial: false,
              tone: finalTone,
              providerLabel: providerLabel || (modelName ? String(modelName) : undefined),
            },
          ]);
        } else {
          setIsSending(false);
          updateSessionMessages(sessionId, (msgs) =>
            msgs.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    text: reply,
                    isPartial: false,
                    tone: finalTone,
                    providerLabel: providerLabel || m.providerLabel || (modelName ? String(modelName) : undefined),
                  }
                : m
            )
          );
        }

        if (engine && !engine.getMuted()) {
          const remainder = ttsSentenceBuffer.trim();
          if (remainder.length > 0) {
            engine.enqueueSentence(remainder, speechGenId);
          } else if (reply) {
            let buf = reply;
            let extracted = popReadySentence(buf);
            let sentAny = false;
            while (extracted.sentence) {
              engine.enqueueSentence(extracted.sentence, speechGenId);
              buf = extracted.rest;
              extracted = popReadySentence(buf);
              sentAny = true;
            }
            if (buf.trim()) {
              engine.enqueueSentence(buf.trim(), speechGenId);
              sentAny = true;
            }
            if (!sentAny && reply.trim()) {
              engine.enqueueSentence(reply.trim(), speechGenId);
            }
          }
          engine.markStreamComplete(speechGenId);
        }

        applyExtractedMemories(extractedMemories);
        if (voiceStateRef.current === "thinking") {
          setVoiceState("idle");
        }
      };

      const runOllamaChat = async (brainCtx: any, ollamaModelName: string, displayLabel?: string, providersList?: any[]) => {
        let messageForModel = brainCtx.message as string;
        const imageAtts = hasAttachments ? safeAttachments.filter((a) => a.kind === "image" || (a.mimeType || "").startsWith("image/")) : [];
        const nonImageAtts = hasAttachments ? safeAttachments.filter((a) => !(a.kind === "image" || (a.mimeType || "").startsWith("image/"))) : [];

        if (imageAtts.length > 0) {
          const plist = Array.isArray(providersList) ? providersList : [];
          const moondream = plist.find((p: any) => (String(p.id).includes("moondream") || String(p.ollamaName || "").includes("moondream")) && p.status === "available" && p.capabilities?.vision);
          if (moondream) {
            const analyses: string[] = [];
            for (let i = 0; i < Math.min(imageAtts.length, 4); i++) {
              const img = imageAtts[i];
              const dataUrl = img.dataUrl || img.previewUrl;
              if (!dataUrl) continue;
              try {
                const prompt = trimmed
                  ? `Analyse cette image en lien avec la demande suivante : "${trimmed}". Décris le contenu, les objets/scènes/éléments visibles, lis le texte présent (OCR) si pertinent, et réponds précisément.`
                  : "Décris en détail cette image : contenu, objets, scènes, éléments visibles et texte lisible (OCR) si présent.";
                const vision = await analyzeImageWithOllama({ model: moondream.ollamaName || moondream.model || "moondream:latest", prompt, imageBase64: dataUrl });
                analyses.push(`Image ${i + 1} (${img.name || "image"}) — analyse Moondream locale:\n${String(vision.reply || "").trim() || "(réponse vide)"}`);
              } catch (e) {
                const msg = e instanceof Error ? e.message : "erreur vision";
                analyses.push(`Image ${i + 1} (${img.name || "image"}) — analyse Moondream échouée: ${msg}`);
              }
            }
            if (analyses.length > 0) {
              messageForModel = `${messageForModel}\n\n[Analyses d'images réelles effectuées par Moondream (Ollama local)]\n${analyses.join("\n\n")}\n\nUtilise ces analyses pour répondre à la demande. N'invente pas de détails non présents dans les analyses.`;
            } else {
              messageForModel = `${messageForModel}\n\n[Images jointes mais aucune analyse vision n'a pu être produite. Réponds honnêtement sur cette limite.]`;
            }
          } else {
            messageForModel = `${messageForModel}\n\n[Images jointes : aucun modèle vision opérationnel disponible en secours (Moondream/Ollama indisponible) et Gemini Vision non utilisé pour cette réponse. Je ne peux pas analyser le contenu visuel sans traitement réel. Explique cette limite honnêtement et propose d'utiliser Gemini (si configuré/disponible) ou de démarrer Ollama avec Moondream pour l'analyse d'images.]`;
          }
        }

        if (nonImageAtts.length > 0) {
          const parts: string[] = [];
          for (const att of nonImageAtts.slice(0, 6)) {
            if (att.textContent && att.textContent.trim()) {
              parts.push(`Fichier ${att.name} (${att.mimeType || att.kind}):\n${att.textContent.slice(0, 12000)}`);
            } else if ((att.mimeType || "").toLowerCase().includes("pdf") || att.kind === "pdf") {
              parts.push(`Fichier ${att.name} (PDF) joint sans texte extrait côté client : analyse du contenu binaire non disponible via ce modèle local. Demande à l'utilisateur d'utiliser Gemini (si disponible) pour l'analyse PDF ou de fournir le texte extrait.`);
            } else {
              parts.push(`Fichier ${att.name} (${att.mimeType || att.kind}) joint sans contenu textuel exploitable pour ce modèle local.`);
            }
          }
          if (parts.length) messageForModel = `${messageForModel}\n\n[Pièces jointes non-image]\n${parts.join("\n\n")}`;
        }

        const historyForApi = (brainCtx.history || [])
          .filter((m: any) => !m.isPartial && m.text && String(m.text).trim().length > 0)
          .slice(-14)
          .map((m: any) => ({ role: m.role, text: m.text }));
        const resp = await chatWithOllama({
          model: ollamaModelName,
          message: messageForModel,
          history: historyForApi,
          memories: brainCtx.memories,
          mode: brainCtx.mode,
          vocalStyle: brainCtx.vocalStyle,
          intelligenceProfile: brainCtx.intelligenceProfile,
          projects: (brainCtx.projects || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            objective: p.objective,
            status: p.status,
            progress: p.progress,
            nextActions: p.nextActions || [],
            blockers: p.blockers || [],
          })),
          userTimeZone: brainCtx.userTimeZone,
        });
        if (controller.signal.aborted) return { aborted: true as const };
        const raw = String(resp.reply || "");
        let tone: JarvisTone = resolvedTurnTone;
        let withoutTone = raw;
        const toneMatch = raw.match(/^\s*\[\[TON:\s*([^\]]+)\]\]\s*/i);
        if (toneMatch) {
          try {
            tone = normalizeTone(toneMatch[1]);
          } catch {
            tone = resolvedTurnTone;
          }
          withoutTone = raw.replace(/^\s*\[\[TON:\s*[^\]]+\]\]\s*/i, "");
        }
        const { cleanText, memories: extractedMemories } = extractMemoryTags(withoutTone);
        const label = displayLabel || resp.model || ollamaModelName;
        const visionUsed = imageAtts.length > 0 && Array.isArray(providersList) && providersList.some((p: any) => (String(p.id).includes("moondream") || String(p.ollamaName || "").includes("moondream")) && p.status === "available" && p.capabilities?.vision);
        finalizeAssistantReply(
          cleanText || "(Réponse vide du modèle)",
          tone,
          visionUsed ? `${label} (+ Moondream vision)` : `ollama:${label}`,
          extractedMemories || [],
          visionUsed ? `${label} + Moondream (vision locale)` : label
        );
        return { aborted: false as const };
      };

      const shouldFallbackToOllama = (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err || "");
        return /503|indisponible|not configured|non configur|GEMINI_API_KEY|Failed to fetch|Network|ECONN|fetch/i.test(msg);
      };

      try {
        const profile = intelligenceProfileRef.current;
        const brainCtx = buildBrainUnifiedContext({
          message: trimmed,
          history: priorMessages,
          activeMode: activeModeRef.current,
          intelligenceProfile: profile,
          projects: projectsRef.current,
          vocalStyle: useVocal
            ? {
                emotion: vs.emotion,
                personality: vs.personality,
                intensity: vs.intensity,
                auto: vs.auto,
                geminiInstruction: vocalPreset?.geminiInstruction,
              }
            : null,
        });

        const runGeminiStreaming = async () => {
          const result = await streamGeminiResponse({
            message: brainCtx.message,
            history: brainCtx.history,
            memories: brainCtx.memories,
            mode: brainCtx.mode,
            vocalStyle: brainCtx.vocalStyle as any,
            intelligenceProfile: brainCtx.intelligenceProfile,
            projects: brainCtx.projects,
            userTimeZone: brainCtx.userTimeZone,
            attachments: hasAttachments ? safeAttachments : undefined,
            signal: controller.signal,
            onMeta: (model, serverSentiment) => {
              if (model) setGeminiModel(model);
              if (serverSentiment) {
                resolvedTurnTone = serverSentiment.tone;
                setActiveTone(serverSentiment.tone);
                engine?.setTurnTone(serverSentiment.tone, speechGenId);
              }
            },
            onTone: (tone) => {
              resolvedTurnTone = tone;
              setActiveTone(tone);
              engine?.setTurnTone(tone, speechGenId);
              if (assistantCreated) {
                updateSessionMessages(sessionId, (msgs) =>
                  msgs.map((m) =>
                    m.id === assistantMsgId ? { ...m, tone } : m
                  )
                );
              }
            },
            onDelta: (cleanAccumulated, newChunk) => {
              if (!assistantCreated) {
                assistantCreated = true;
                setIsSending(false);
                updateSessionMessages(sessionId, (msgs) => [
                  ...msgs,
                  {
                    id: assistantMsgId,
                    role: "assistant",
                    text: cleanAccumulated,
                    timestamp: Date.now(),
                    source: engine && !engine.getMuted() ? "voice" : "text",
                    isPartial: true,
                    tone: resolvedTurnTone,
                  },
                ]);
              } else {
                updateSessionMessages(sessionId, (msgs) =>
                  msgs.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: cleanAccumulated, tone: resolvedTurnTone }
                      : m
                  )
                );
              }

              if (engine && !engine.getMuted()) {
                ttsSentenceBuffer += newChunk;
                let extracted = popReadySentence(ttsSentenceBuffer);
                while (extracted.sentence) {
                  engine.enqueueSentence(extracted.sentence, speechGenId);
                  ttsSentenceBuffer = extracted.rest;
                  extracted = popReadySentence(ttsSentenceBuffer);
                }
              }
            },
          });

          if (controller.signal.aborted) return { aborted: true as const };
          finalizeAssistantReply(result.reply, result.tone || resolvedTurnTone, result.model, result.extractedMemories || [], result.model ? `Gemini (${result.model})` : "Gemini");
          return { aborted: false as const };
        };

        // Résolution du fournisseur (sélection AI Hub auto/manuelle) avec fallback réel.
        let providers: any[] = [];
        let selection: any = null;
        try {
          const storedSel = getStoredAiSelection();
          providers = await loadAiProviderRegistry();
          selection = selectAiProvider(providers, {
            mode: storedSel.mode,
            preferredProvider: storedSel.preferredProvider,
            capability: "chat",
          });
        } catch {
          providers = [];
          selection = null;
        }

        const resolved = selection?.resolvedProvider || null;
        const isOllamaChat =
          !!resolved &&
          (String(resolved.id).startsWith("ollama:") || resolved.providerFamily === "ollama") &&
          !!resolved.capabilities?.chat &&
          resolved.status === "available";

        if (isOllamaChat) {
          const out = await runOllamaChat(brainCtx, resolved.ollamaName || resolved.model || String(resolved.id), resolved.name || resolved.ollamaName, providers);
          if ((out as any)?.aborted) return;
        } else {
          try {
            const out = await runGeminiStreaming();
            if ((out as any)?.aborted) return;
          } catch (geminiErr) {
            if (controller.signal.aborted) return;
            const canFallback = shouldFallbackToOllama(geminiErr);
            if (providers.length === 0) {
              try { providers = await loadAiProviderRegistry(); } catch { providers = []; }
            }
            const ollamaAlt = providers.find((p: any) =>
              (String(p.id).startsWith("ollama:") || p.providerFamily === "ollama") &&
              p.status === "available" &&
              p.capabilities?.chat
            ) || null;
            if (canFallback && ollamaAlt) {
              // Repli réel vers Qwen/Ollama local si Gemini indisponible.
              ttsSentenceBuffer = "";
              if (assistantCreated) {
                updateSessionMessages(sessionId, (msgs) =>
                  msgs.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: "Repli vers un modèle local Ollama…", isPartial: true, tone: resolvedTurnTone }
                      : m
                  )
                );
              }
              const out = await runOllamaChat(brainCtx, ollamaAlt.ollamaName || ollamaAlt.model || String(ollamaAlt.id), ollamaAlt.name || ollamaAlt.ollamaName, providers);
              if ((out as any)?.aborted) return;
            } else {
              throw geminiErr;
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        engine?.stopPlayback();
        setVoiceState("error");
        const detail =
          err instanceof Error
            ? err.message
            : "Impossible d'obtenir une réponse de l'IA (Gemini/Ollama).";
        setErrorInfo({
          title: "Erreur de communication IA",
          detail,
        });
        void addIntelligenceHistory({
          type: "error",
          title: "Erreur IA / réseau",
          detail,
          level: "warning",
          relatedConversationId: sessionId,
        }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
      } finally {
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
        setIsSending(false);
      }
    },
    [handleNewSession, updateSessionMessages]
  );

  const startMicrophoneListening = useCallback(() => {
    const engine = audioEngineRef.current;
    const speech = speechInputRef.current;
    if (!engine || !speech) return;

    engine.prepareOnUserGesture();

    setSiriListenPending(false);
    requestAbortRef.current?.abort();
    engine.stopPlayback();
    setErrorInfo(null);
    setInterimTranscript("");

    const started = speech.start({
      onStart: () => {
        setVoiceState("listening");
        engine.setSyntheticListeningEnergy(0.18);
      },
      onInterim: (text) => {
        setInterimTranscript(text);
        engine.setSyntheticListeningEnergy(0.45 + (text.length % 5) * 0.08);
      },
      onFinal: (finalText) => {
        setInterimTranscript("");
        engine.setSyntheticListeningEnergy(0);
        void submitToGemini(finalText, "voice");
      },
      onVoiceCommand: (command) => {
        setInterimTranscript("");
        engine.setSyntheticListeningEnergy(0);
        if (command === "stop_speech") {
          stopAllActivity();
        } else if (command === "new_session") {
          handleNewSession();
        }
      },
      onError: (title, detail) => {
        setInterimTranscript("");
        engine.setSyntheticListeningEnergy(0);
        setVoiceState("error");
        setErrorInfo({ title, detail, isMicError: true });
      },
      onEnd: () => {
        engine.setSyntheticListeningEnergy(0);
        setInterimTranscript("");
        if (voiceStateRef.current === "listening") {
          setVoiceState("idle");
        }
      },
    });

    if (!started) {
      engine.setSyntheticListeningEnergy(0);
    }
  }, [handleNewSession, stopAllActivity, submitToGemini]);

  const handleToggleMic = useCallback(() => {
    audioEngineRef.current?.prepareOnUserGesture();
    if (voiceStateRef.current === "listening") {
      speechInputRef.current?.stop();
      audioEngineRef.current?.setSyntheticListeningEnergy(0);
      setInterimTranscript("");
      setVoiceState("idle");
    } else {
      startMicrophoneListening();
    }
  }, [startMicrophoneListening]);

  const handleToggleMute = useCallback(() => {
    audioEngineRef.current?.prepareOnUserGesture();
    setIsMuted((prev) => {
      const next = !prev;
      audioEngineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleOrbClick = useCallback(() => {
    audioEngineRef.current?.prepareOnUserGesture();
    if (
      voiceStateRef.current === "speaking" ||
      voiceStateRef.current === "thinking"
    ) {
      stopAllActivity();
    } else {
      handleToggleMic();
    }
  }, [handleToggleMic, stopAllActivity]);

  const handleSendText = useCallback(
    (text: string, attachments?: ChatAttachment[]) => {
      audioEngineRef.current?.prepareOnUserGesture();
      speechInputRef.current?.stop();
      setInterimTranscript("");
      setSiriListenPending(false);
      void submitToGemini(text, "text", attachments);
    },
    [submitToGemini]
  );

  // Handle iOS Siri Shortcuts / PWA Shortcuts URL Navigation Intents on mount
  useEffect(() => {
    if (intentHandledRef.current) return;
    intentHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action")?.toLowerCase();
    const viewParamRaw = params.get("view");
    const viewParam = viewParamRaw
      ? (VALID_VIEWS.find((v) => v.toLowerCase() === viewParamRaw.toLowerCase()) ?? undefined)
      : undefined;
    const query = (params.get("q") || params.get("prompt") || "").trim();
    const wantNew = params.get("new") === "1" || action === "new";
    const wantMute = params.get("mute") === "1";

    if (!action && !viewParam && !query && !wantNew && !wantMute) {
      return;
    }

    if (query || action === "listen") {
      skipStartupGreetingRef.current = true;
    }

    if (viewParam) {
      setActiveView(viewParam);
    }

    if (wantMute) {
      setIsMuted(true);
      audioEngineRef.current?.setMuted(true);
    }

    if (wantNew) {
      const created = conversationRepository.createSession();
      setSessions(conversationRepository.listSessions());
      setActiveSessionId(created.id);
      activeSessionIdRef.current = created.id;
    }

    window.history.replaceState({}, "", window.location.pathname);

    if (query) {
      setActiveView("conversations");
      void submitToGemini(query, "voice");
    } else if (action === "listen") {
      setActiveView("conversations");
      setSiriListenPending(true);
    }
  }, [submitToGemini]);

  useEffect(() => {
    if (startupGreetingAttemptedRef.current) return;
    if (skipStartupGreetingRef.current) return;
    if (!appPreferences.startupGreetingSpokenEnabled) return;
    if (hasStartupGreetingBeenSpoken()) {
      startupGreetingAttemptedRef.current = true;
      return;
    }

    startupGreetingAttemptedRef.current = true;
    markStartupGreetingSpoken();
    speakPlainText("Salut, je suis JARVIS. Comment pourrais-je vous aider ?");
  }, [appPreferences.startupGreetingSpokenEnabled, speakPlainText]);

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === activeSessionIdRef.current) return;
      stopAllActivity();
      setActiveSessionId(id);
      setActiveView("conversations");
      setErrorInfo(null);
    },
    [stopAllActivity]
  );

  const handleDeleteSession = useCallback((id: string) => {
    conversationRepository.deleteSession(id);
    let updated = conversationRepository.listSessions();
    if (updated.length === 0) {
      const fresh = conversationRepository.createSession();
      updated = [fresh];
    }
    setSessions(updated);
    if (activeSessionIdRef.current === id) {
      setActiveSessionId(updated[0].id);
    }
  }, []);

  const handleRenameSession = useCallback((id: string, title: string) => {
    const clean = String(title || "").trim();
    if (!clean) return;
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === id ? { ...s, title: clean, updatedAt: Date.now() } : s
      );
      const target = next.find((s) => s.id === id);
      if (target) conversationRepository.saveSession(target);
      return next;
    });
  }, []);

  const handleRegenerate = useCallback(
    (assistantMessageId: string) => {
      const msgs = activeSession?.messages ?? [];
      const index = msgs.findIndex((m) => m.id === assistantMessageId);
      for (let i = index - 1; i >= 0; i -= 1) {
        if (msgs[i].role === "user") {
          handleSendText(msgs[i].text);
          return;
        }
      }
    },
    [activeSession, handleSendText]
  );

  const handleAddMemory = useCallback(
    (fact: string, category: MemoryCategory = "autre") => {
      const added = memoryRepository.addMemory(fact, category, undefined, {
        source: "user",
        kind: "fact",
      });
      if (added) {
        setMemories(memoryRepository.listMemories());
        void addIntelligenceHistory({
          type: "memory_update",
          title: "Souvenir ajoutÃ© manuellement",
          detail: added.fact,
          level: "info",
        }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Ã‰vÃ©nement historique non enregistrÃ©:", e));
      }
    },
    []
  );

  const handleUpdateMemory = useCallback(
    (id: string, fact: string, category: MemoryCategory) => {
      const updated = memoryRepository.updateMemory(id, fact, category);
      if (updated) {
        setMemories(memoryRepository.listMemories());
        void addIntelligenceHistory({
          type: "memory_update",
          title: "Souvenir modifiÃ©",
          detail: updated.fact,
          level: "info",
        }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Ã‰vÃ©nement historique non enregistrÃ©:", e));
      }
    },
    []
  );

  const handleTogglePinMemory = useCallback((id: string) => {
    const updated = memoryRepository.togglePinMemory(id);
    if (updated) {
      setMemories(memoryRepository.listMemories());
    }
  }, []);

  const handleToggleDisableMemory = useCallback((id: string) => {
    const updated = memoryRepository.toggleDisableMemory(id);
    if (updated) {
      setMemories(memoryRepository.listMemories());
      void addIntelligenceHistory({
        type: "memory_update",
        title: updated.disabled ? "Souvenir dÃ©sactivÃ©" : "Souvenir rÃ©activÃ©",
        detail: updated.fact,
        level: "info",
      }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Ã‰vÃ©nement historique non enregistrÃ©:", e));
    }
  }, []);

  const handleRemoveMemory = useCallback((id: string) => {
    memoryRepository.removeMemory(id);
    setMemories(memoryRepository.listMemories());
    void addIntelligenceHistory({
      type: "memory_update",
      title: "Souvenir supprimÃ©",
      level: "warning",
    }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Ã‰vÃ©nement historique non enregistrÃ©:", e));
  }, []);

  const handleSetMemoryEnabled = useCallback((enabled: boolean) => {
    memoryRepository.setMemoryEnabled(enabled);
    setIntelligenceProfile((prev) => {
      const next = saveIntelligenceProfile({ ...prev, memoryEnabled: enabled });
      return next;
    });
    void addIntelligenceHistory({
      type: "memory_update",
      title: enabled ? "MÃ©moire activÃ©e" : "MÃ©moire dÃ©sactivÃ©e",
      level: "info",
    }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Ã‰vÃ©nement historique non enregistrÃ©:", e));
  }, []);

  const handleUpdateIntelligenceProfile = useCallback((patch: Partial<IntelligenceProfile>) => {
    setIntelligenceProfile((prev) => saveIntelligenceProfile({ ...prev, ...patch }));
  }, []);

  const handleToggleExtremeDark = useCallback(() => {
    setIsExtremeDark((prev) => !prev);
  }, []);

  const handleSelectMode = useCallback((id: string) => {
    setActiveModeIdState(id);
    setActiveModeId(id);
  }, []);

  const handleSaveCustomMode = useCallback(
    async (draft: {
      name: string;
      description: string;
      personality: string;
      instructions: string;
      voiceBehavior: { rate: number; pitch: number; expressiveness: number };
      active?: boolean;
      id?: string;
    }) => {
      const saved = await saveCustomMode({ ...draft, active: draft.active ?? true });
      setCustomModes(await listCustomModes());
      setActiveModeIdState(saved.id);
      setActiveModeId(saved.id);
    },
    []
  );

  const handleDeleteCustomMode = useCallback(
    async (id: string) => {
      await deleteCustomMode(id);
      // Les souvenirs contextuels sont dÃ©tachÃ©s (contenu et identifiants prÃ©servÃ©s).
      memoryRepository.removeModeReferences(id);
      setMemories(memoryRepository.listMemories());
      setCustomModes(await listCustomModes());
      if (activeModeId === id) {
        setActiveModeIdState("classic");
        setActiveModeId("classic");
      }
    },
    [activeModeId]
  );

  const handleToggleCustomMode = useCallback(async (id: string, active: boolean) => {
    await setCustomModeActive(id, active);
    setCustomModes(await listCustomModes());
  }, []);

  const handleClearAllLocalData = useCallback(async () => {
    stopAllActivity();
    conversationRepository.clearAll();
    const fresh = conversationRepository.createSession();
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    memoryRepository.clearMemories();
    setMemories([]);

    const errors: string[] = [];
    try {
      await clearProjects();
      setProjects([]);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Ã‰chec de suppression des projets.");
    }
    try {
      await clearIntelligenceHistory();
      setIntelligenceHistory([]);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Ã‰chec de suppression de l'historique.");
    }

    await clearStoredFiles();
    setStoredFiles([]);
    await clearSavedSearches();
    setProjectsError(null);
    setHistoryError(null);

    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
  }, [stopAllActivity]);

  const getInputLevel = useCallback(
    () => audioEngineRef.current?.getInputLevel() ?? 0,
    []
  );
  const getOutputLevel = useCallback(
    () => audioEngineRef.current?.getOutputLevel() ?? 0,
    []
  );

  const effectiveVoiceState: VoiceState =
    !isOnline && voiceState === "idle" ? "offline" : voiceState;
  const statusText = VOICE_STATUS_TEXT[effectiveVoiceState];

  const liveInputText = interimTranscript || liveDraftText;
  const liveSentiment: SentimentAnalysis | null = liveInputText.trim()
    ? analyzeUserSentiment(
        liveInputText,
        (activeSession?.messages ?? [])
          .filter((m) => m.role === "user")
          .map((m) => m.text)
      )
    : null;
  const activeToneLabel = TONE_PROSODY_PROFILES[activeTone].label;

  return (
    <NavShell
      activeView={activeView}
      onSelectView={setActiveView}
      voiceState={effectiveVoiceState}
      statusText={statusText}
      isOnline={isOnline}
      geminiModel={geminiModel}
      extremeDark={isExtremeDark}
      onToggleExtremeDark={handleToggleExtremeDark}
      onNewSession={handleNewSession}
      onOpenHistory={() => setIsDrawerOpen(true)}
      sidebarSlot={
        <ChatSidebar
          extremeDark={isExtremeDark}
          activeView={activeView}
          onSelectView={setActiveView}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          onOpenHistory={() => setIsDrawerOpen(true)}
        />
      }
      mobileSidebarSlot={(onClose) => (
        <ChatSidebar
          compact
          onClose={onClose}
          extremeDark={isExtremeDark}
          activeView={activeView}
          onSelectView={setActiveView}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          onOpenHistory={() => {
            onClose();
            setIsDrawerOpen(true);
          }}
        />
      )}
    >
      {/* Global Banners */}
      {errorInfo && (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <div
            className={`max-w-3xl mx-auto rounded-xl border px-4 py-3 flex items-start gap-3 ${
              isExtremeDark
                ? "bg-red-950/20 border-red-500/20"
                : "bg-red-950/40 border-red-400/30 backdrop-blur-md"
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                isExtremeDark ? "text-red-400/80" : "text-red-300"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium ${
                  isExtremeDark ? "text-red-200/90" : "text-red-100"
                }`}
              >
                {errorInfo.title}
              </p>
              <p
                className={`text-xs mt-0.5 leading-relaxed ${
                  isExtremeDark ? "text-red-200/65" : "text-red-200/80"
                }`}
              >
                {errorInfo.detail}
              </p>
              {errorInfo.isMicError && (
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className="mt-2 text-xs font-medium text-cyan-300 hover:text-cyan-200 py-1 cursor-pointer"
                >
                  RÃ©essayer le microphone
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setErrorInfo(null)}
              aria-label="Fermer l'alerte"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-red-200/70 hover:text-red-100 hover:bg-white/[0.05] shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {memoryToast && (
        <div className="shrink-0 px-4 pt-2.5 sm:px-6">
          <div
            className={`max-w-md mx-auto rounded-xl border px-3.5 py-2 flex items-center gap-2 text-xs ${
              isExtremeDark
                ? "bg-cyan-950/20 border-cyan-500/15 text-cyan-300/80"
                : "jarvis-glass border-cyan-400/25 text-cyan-200"
            }`}
          >
            <Check className="w-4 h-4 text-cyan-300 shrink-0" />
            <span className="truncate">MÃ©morisÃ© : {memoryToast}</span>
          </div>
        </div>
      )}

      {siriListenPending && (
        <div className="shrink-0 px-4 pt-2.5 sm:px-6">
          <div
            className={`max-w-md mx-auto rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 ${
              isExtremeDark
                ? "bg-cyan-950/25 border-cyan-500/25"
                : "jarvis-glass border-cyan-400/35"
            }`}
          >
            <span
              className={`text-xs ${
                isExtremeDark ? "text-cyan-200/85" : "text-cyan-100"
              }`}
            >
              Raccourci Siri prÃªt â€” touchez pour activer le micro.
            </span>
            <button
              type="button"
              onClick={handleToggleMic}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                isExtremeDark
                  ? "bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-200 border border-cyan-500/35"
                  : "bg-cyan-400 hover:bg-cyan-300 text-slate-950"
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Ã‰couter</span>
            </button>
          </div>
        </div>
      )}

      {/* Mode Selector (Module 3) */}
      <div className="shrink-0 px-3 sm:px-6 pt-2">
        <div className="max-w-4xl mx-auto">
          <ModeSelector
            extremeDark={isExtremeDark}
            activeModeId={activeModeId}
            customModes={customModes}
            onSelectMode={handleSelectMode}
            onSaveCustomMode={handleSaveCustomMode}
            onDeleteCustomMode={handleDeleteCustomMode}
            onToggleCustomMode={handleToggleCustomMode}
          />
        </div>
      </div>

      {/* Active View Router — Phase 9 : vues différées chargées à la demande. */}
      <Suspense fallback={<ViewFallback label="Chargement du module" />}>
      {activeView === "dashboard" && (
        <CommandHubView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSelectView={setActiveView}
          onStop={handleDashboardStop}
          onResume={handleDashboardResume}
        />
      )}

      {activeView === "home" && (
        <HomeView
          extremeDark={isExtremeDark}
          isOnline={isOnline}
          geminiModel={geminiModel}
          sessions={sessions}
          projects={projects}
          onSelectView={setActiveView}
          onNewSession={handleNewSession}
          onSuggestion={(text) => {
            setComposerDraft(text);
            setActiveView("conversations");
          }}
          onSpeakText={speakPlainText}
          voiceState={effectiveVoiceState}
          getInputLevel={getInputLevel}
          getOutputLevel={getOutputLevel}
          onOrbClick={handleOrbClick}
          showDailyQuote={appPreferences.showDailyQuote}
        />
      )}

      {activeView === "conversations" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className={`flex-1 min-h-0 flex flex-col ${isExtremeDark ? "bg-black" : "bg-[#020611]"}`}>
            <TranscriptStream
              messages={activeSession?.messages ?? []}
              interimTranscript={interimTranscript}
              interimSentiment={interimTranscript ? liveSentiment : null}
              isThinking={isSending}
              extremeDark={isExtremeDark}
              onQuickPrompt={handleSendText}
              onRegenerate={handleRegenerate}
            />
          </div>
          <ControlDock
            voiceState={effectiveVoiceState}
            isMuted={isMuted}
            isSending={isSending}
            isOffline={!isOnline}
            extremeDark={isExtremeDark}
            onToggleMic={handleToggleMic}
            onStopAll={stopGlobal}
            onToggleMute={handleToggleMute}
            onSendText={handleSendText}
            onDraftChange={(text) => {
              setLiveDraftText(text);
              if (!text) setComposerDraft("");
            }}
            initialDraft={composerDraft}
          />
        </div>
      )}
{activeView === "memory" && (
        <MemoryView
          memories={memories}
          extremeDark={isExtremeDark}
          memoryEnabled={intelligenceProfile.memoryEnabled}
          onAddMemory={handleAddMemory}
          onUpdateMemory={handleUpdateMemory}
          onTogglePinMemory={handleTogglePinMemory}
          onToggleDisableMemory={handleToggleDisableMemory}
          onRemoveMemory={handleRemoveMemory}
          onSetMemoryEnabled={handleSetMemoryEnabled}
          onReloadMemories={() => setMemories(memoryRepository.listMemories())}
        />
      )}

      {activeView === "search" && (
        <WebSearchView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSpeakText={speakPlainText}
          initialMode="search"
        />
      )}

      {activeView === "research" && (
        <ResearchView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSpeakText={speakPlainText}
        />
      )}

      {activeView === "files" && (
        <FilesView
          files={storedFiles}
          onFilesChange={setStoredFiles}
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSpeakText={speakPlainText}
        />
      )}

      {activeView === "video" && (
        <VideoView
          files={storedFiles}
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSpeakText={speakPlainText}
        />
      )}

      {activeView === "aiVideo" && (
        <AiVideoStudioView isOnline={isOnline} extremeDark={isExtremeDark} />
      )}

      {activeView === "remotionStudio" && (
        <RemotionStudioView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onNavigate={setActiveView}
        />
      )}

      {activeView === "reels" && (
        <ReelStudioView isOnline={isOnline} extremeDark={isExtremeDark} />
      )}

      {activeView === "projects" && (
        <ProjectsView
          extremeDark={isExtremeDark}
          profile={intelligenceProfile}
          onUpdateProfile={handleUpdateIntelligenceProfile}
          memories={memories}
          memoryEnabled={intelligenceProfile.memoryEnabled}
          onAddMemory={handleAddMemory}
          onUpdateMemory={handleUpdateMemory}
          onTogglePinMemory={handleTogglePinMemory}
          onToggleDisableMemory={handleToggleDisableMemory}
          onRemoveMemory={handleRemoveMemory}
          onSetMemoryEnabled={handleSetMemoryEnabled}
          onReloadMemories={() => setMemories(memoryRepository.listMemories())}
          projects={projects}
          projectsLoading={projectsLoading}
          projectsError={projectsError}
          onReloadProjects={reloadProjects}
          onCreateProject={async (name, objective) => {
            try {
              const p = await createProject(name, objective);
              await reloadProjects();
              void addIntelligenceHistory({ type: "project_update", title: "Projet crÃ©Ã©", detail: p.name, level: "success", relatedProjectId: p.id }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch(() => {});
              return p;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec de crÃ©ation du projet.";
              setProjectsError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          onSaveProject={async (project) => {
            try {
              const saved = await saveProject(project);
              await reloadProjects();
              void addIntelligenceHistory({ type: "project_update", title: "Projet mis Ã  jour", detail: saved.name, level: "info", relatedProjectId: saved.id }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch(() => {});
              return saved;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec d'enregistrement du projet.";
              setProjectsError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          onRemoveProject={async (id) => {
            try {
              await removeProject(id);
              await reloadProjects();
              void addIntelligenceHistory({ type: "project_update", title: "Projet supprimÃ©", level: "warning", relatedProjectId: id }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch(() => {});
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec de suppression du projet.";
              setProjectsError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          history={intelligenceHistory}
          historyLoading={historyLoading}
          historyError={historyError}
          onReloadHistory={reloadHistory}
          onAddHistory={async (event) => {
            try {
              const ev = await addIntelligenceHistory(event);
              setIntelligenceHistory((prev) => [ev, ...prev]);
              setHistoryError(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec d'enregistrement de l'historique.";
              setHistoryError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          onClearHistory={async () => {
            try {
              await clearIntelligenceHistory();
              setIntelligenceHistory([]);
              setHistoryError(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec d'effacement de l'historique.";
              setHistoryError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          sessions={sessions}
        />
      )}

      {activeView === "modes" && (
        <ModesView
          extremeDark={isExtremeDark}
          activeModeId={activeModeId}
          customModes={customModes}
          onSelectMode={(id) => {
            setActiveModeIdState(id);
            setActiveModeId(id);
          }}
          onSaveCustomMode={(mode) => {
            void (async () => {
              await saveCustomMode({
                id: mode.id,
                name: mode.name,
                description: mode.description,
                personality: mode.personality,
                instructions: mode.instructions,
                voiceBehavior: mode.voiceBehavior,
                active: mode.active ?? true,
              });
              const refreshed = await listCustomModes();
              setCustomModes(refreshed);
            })();
          }}
          onDeleteCustomMode={(id) => {
            void (async () => {
              await deleteCustomMode(id);
              const refreshed = await listCustomModes();
              setCustomModes(refreshed);
              if (activeModeId === id) {
                setActiveModeIdState("classic");
                setActiveModeId("classic");
              }
            })();
          }}
          onToggleCustomMode={(id, active) => {
            void (async () => {
              await setCustomModeActive(id, active);
              const refreshed = await listCustomModes();
              setCustomModes(refreshed);
            })();
          }}
          activeMode={activeMode}
        />
      )}

      {activeView === "controlCenter" && (
        <ControlCenterView
          extremeDark={isExtremeDark}
          isOnline={isOnline}
          projects={projects}
          geminiModel={geminiModel}
          onSelectView={setActiveView}
          activeModeName={activeMode?.name || null}
          memoryCount={memoryRepository.getContextMemories(activeMode?.id).length}
          memoryEnabled={intelligenceProfile.memoryEnabled}
        />
      )}

      {activeView === "aiHub" && (
        <AiHubView extremeDark={isExtremeDark} isOnline={isOnline} />
      )}

      {activeView === "imageStudio" && (
        <ImageStudioView extremeDark={isExtremeDark} isOnline={isOnline} />
      )}

      {activeView === "mobileAccess" && (
        <MobileAccessView extremeDark={isExtremeDark} isOnline={isOnline} />
      )}

      {activeView === "missions" && (
        <MissionsView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onNavigate={setActiveView}
        />
      )}

      {activeView === "skills" && (
        <SkillsView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onNavigate={setActiveView}
        />
      )}

      {activeView === "agents" && (
        <AgentsView isOnline={isOnline} extremeDark={isExtremeDark} />
      )}

      {activeView === "scheduler" && (
        <SchedulerView isOnline={isOnline} extremeDark={isExtremeDark} />
      )}

      {activeView === "tools" && (
        <ToolsView isOnline={isOnline} extremeDark={isExtremeDark} />
      )}

      {activeView === "devices" && (
        <DevicesView isOnline={isOnline} extremeDark={isExtremeDark} />
      )}

      {activeView === "contextMemory" && (
        <ContextMemoryView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          memories={memories}
          sessions={sessions}
        />
      )}

      {activeView === "intelligence" && (
        <IntelligenceView
          extremeDark={isExtremeDark}
          profile={intelligenceProfile}
          onUpdateProfile={handleUpdateIntelligenceProfile}
          memories={memories}
          memoryEnabled={intelligenceProfile.memoryEnabled}
          onAddMemory={handleAddMemory}
          onUpdateMemory={handleUpdateMemory}
          onTogglePinMemory={handleTogglePinMemory}
          onToggleDisableMemory={handleToggleDisableMemory}
          onRemoveMemory={handleRemoveMemory}
          onSetMemoryEnabled={handleSetMemoryEnabled}
          onReloadMemories={() => setMemories(memoryRepository.listMemories())}
          projects={projects}
          projectsLoading={projectsLoading}
          projectsError={projectsError}
          onReloadProjects={reloadProjects}
          onCreateProject={async (name, objective) => {
            try {
              const p = await createProject(name, objective);
              await reloadProjects();
              void addIntelligenceHistory({ type: "project_update", title: "Projet crÃ©Ã©", detail: p.name, level: "success", relatedProjectId: p.id }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Ã‰vÃ©nement historique non enregistrÃ©:", e));
              return p;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec de crÃ©ation du projet.";
              setProjectsError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          onSaveProject={async (project) => {
            try {
              const saved = await saveProject(project);
              await reloadProjects();
              void addIntelligenceHistory({ type: "project_update", title: "Projet mis Ã  jour", detail: saved.name, level: "info", relatedProjectId: saved.id }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Ã‰vÃ©nement historique non enregistrÃ©:", e));
              return saved;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec d'enregistrement du projet.";
              setProjectsError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          onRemoveProject={async (id) => {
            try {
              await removeProject(id);
              await reloadProjects();
              void addIntelligenceHistory({ type: "project_update", title: "Projet supprimÃ©", level: "warning", relatedProjectId: id }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Ã‰vÃ©nement historique non enregistrÃ©:", e));
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec de suppression du projet.";
              setProjectsError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          history={intelligenceHistory}
          historyLoading={historyLoading}
          historyError={historyError}
          onReloadHistory={reloadHistory}
          onAddHistory={async (event) => {
            try {
              const ev = await addIntelligenceHistory(event);
              setIntelligenceHistory((prev) => [ev, ...prev]);
              setHistoryError(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec d'enregistrement de l'historique.";
              setHistoryError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          onClearHistory={async () => {
            try {
              await clearIntelligenceHistory();
              setIntelligenceHistory([]);
              setHistoryError(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Ã‰chec d'effacement de l'historique.";
              setHistoryError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          sessions={sessions}
        />
      )}

      {activeView === "settings" && (
        <SettingsView
          extremeDark={isExtremeDark}
          onToggleExtremeDark={handleToggleExtremeDark}
          isOnline={isOnline}
          geminiModel={geminiModel}
          sessions={sessions}
          memories={memories}
          files={storedFiles}
          onClearAllLocalData={handleClearAllLocalData}
          vocalStyle={vocalStyle}
          onChangeVocalStyle={setVocalStyle}
          startupGreetingSpokenEnabled={appPreferences.startupGreetingSpokenEnabled}
          onChangeStartupGreetingSpokenEnabled={(enabled) =>
            setAppPreferences((prev) => ({ ...prev, startupGreetingSpokenEnabled: enabled }))
          }
          showDailyQuote={appPreferences.showDailyQuote}
          onChangeShowDailyQuote={(enabled) =>
            setAppPreferences((prev) => ({ ...prev, showDailyQuote: enabled }))
          }
        />
      )}

      {activeView === "news" && (
        <NewsView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSpeakText={speakPlainText}
        />
      )}

      {activeView === "social" && (
        <SocialHubView isOnline={isOnline} extremeDark={isExtremeDark} />
      )}
      </Suspense>

      {/* Session Switcher & Quick Archives Drawer */}
      <HistoryDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        sessions={sessions}
        activeSessionId={activeSession?.id ?? ""}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        memories={memories}
        onAddMemory={(fact) => handleAddMemory(fact, "autre")}
        onRemoveMemory={handleRemoveMemory}
        extremeDark={isExtremeDark}
        onToggleExtremeDark={handleToggleExtremeDark}
      />
    </NavShell>
  );
}


