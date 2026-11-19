import type { JarvisTone, SentimentAnalysis } from "../../shared/sentiment.ts";

export type AppView =
  | "home"
  | "conversations"
  | "memory"
  | "search"
  | "research"
  | "files"
  | "video"
  | "aiVideo"
  | "reels"
  | "settings"
  | "news"
  | "social"
  | "intelligence"
  | "projects"
  | "modes"
  | "controlCenter"
  | "aiHub"
  | "imageStudio"
  | "mobileAccess";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "thinking"
  | "offline"
  | "error";

export type MicPermissionState =
  | "unknown"
  | "granted"
  | "denied"
  | "unavailable";

export interface WebSource {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

export interface WebPageMetadataField {
  value: string | null;
  sources?: string[];
}

export interface WebPageMetadata {
  requestedUrl?: string | null;
  finalUrl?: string | null;
  pageTitle?: WebPageMetadataField;
  mainH1?: WebPageMetadataField;
  author?: WebPageMetadataField;
  publishedDate?: WebPageMetadataField;
  modifiedDate?: WebPageMetadataField;
  description?: WebPageMetadataField;
  siteName?: WebPageMetadataField;
  canonicalUrl?: WebPageMetadataField;
  language?: WebPageMetadataField;
  provenance?: Record<string, string[]>;
  issues?: string[];
}

export type WebArticleExtractionStatus = "success" | "partial" | "insufficient" | "impossible";

export interface WebArticleExtraction {
  status: WebArticleExtractionStatus;
  method?: "heuristic-main-content" | "legacy-naive-fallback" | "none";
  usedFallback?: boolean;
  isIncomplete?: boolean;
  charCount?: number;
  text?: string;
  title?: string | null;
  notes?: string[];
}

export type WebAnalysisConfidenceLevel = "élevée" | "moyenne" | "faible" | "indéterminée";

export interface WebStructuredAnalysisItem {
  text: string;
  category: string;
  evidence: string | null;
  sourceReference: string | null;
  confidence: WebAnalysisConfidenceLevel;
  limitations: string | null;
}

export interface WebStructuredAnalysisData {
  summary: string;
  mainTopic: string;
  keyPoints: WebStructuredAnalysisItem[];
  verifiedFacts: WebStructuredAnalysisItem[];
  unverifiedClaims: WebStructuredAnalysisItem[];
  hypotheses: WebStructuredAnalysisItem[];
  contradictions: WebStructuredAnalysisItem[];
  missingInformation: WebStructuredAnalysisItem[];
  reliabilityAssessment: WebStructuredAnalysisItem[];
  limitations: string[];
}

export interface WebStructuredAnalysis {
  status: "success" | "invalid" | "error" | "unavailable";
  model?: string;
  generatedAt?: number;
  data?: WebStructuredAnalysisData;
  validationErrors?: string[];
  error?: string;
  notes?: string[];
}

// Module 7.2.4 - Comparaison multi-sources (additif)
export type WebComparisonClaimType =
  | "accord_entre_sources"
  | "information_confirmée_par_preuve_identifiable"
  | "affirmation_non_verifiée"
  | "hypothèse"
  | "contradiction";

export interface WebComparisonSourceRef {
  sourceId: string;
  label: string;
  requestedUrl: string;
  finalUrl?: string | null;
  title?: string | null;
}

export interface WebComparisonClaim {
  text: string;
  claimType: WebComparisonClaimType;
  sourceIds: string[];
  sourceReferences: WebComparisonSourceRef[];
  evidence?: string | null;
  proofOrCitation?: string | null;
  limitations?: string | null;
}

export interface WebSourceReliabilityAssessment {
  sourceId: string;
  label: string;
  requestedUrl: string;
  finalUrl?: string | null;
  qualitativeAssessment: string;
  strengths?: string[];
  weaknesses?: string[];
  limits?: string[];
  confidence: "élevée" | "moyenne" | "faible" | "indéterminée";
}

export interface WebSourceComparisonData {
  generalSynthesis: string;
  convergences: WebComparisonClaim[];
  commonInformation: WebComparisonClaim[];
  contradictions: WebComparisonClaim[];
  uniqueBySource: Array<{
    sourceId: string;
    label: string;
    requestedUrl: string;
    finalUrl?: string | null;
    items: WebComparisonClaim[];
  }>;
  missingInformation: WebComparisonClaim[];
  limits: string[];
  reliabilityBySource: WebSourceReliabilityAssessment[];
  preciseReferences: WebComparisonSourceRef[];
}

export interface WebSourceComparisonSource {
  sourceId: string;
  label: string;
  requestedUrl: string;
  finalUrl?: string | null;
  status: "accessible" | "inaccessible" | "insufficient" | "error";
  analyzed: boolean;
  error?: string;
  errorCode?: string;
  issues?: string[];
  metadata?: WebPageMetadata;
  articleExtraction?: WebArticleExtraction;
  extractedCharCount?: number;
  contentIncludedInAnalysis?: boolean;
}

export interface WebSourceComparisonResult {
  status: "success" | "partial" | "invalid" | "error" | "unavailable";
  model?: string;
  generatedAt?: number;
  data?: WebSourceComparisonData;
  validationErrors?: string[];
  error?: string;
  notes?: string[];
}

// Module 7.3 — Recherche approfondie (additif)
export interface WebResearchPlan {
  question: string;
  subQuestions: string[];
  knownInformation: string[];
  limits: string[];
}

export interface WebResearchStep {
  index: number;
  query: string;
  sources: WebSource[];
  status: "success" | "partial" | "unavailable" | "error";
  note?: string;
}

export interface WebResearchClaim {
  text: string;
  sourceIds: string[];
  sourceUrls: string[];
  category: "fait_recoupe" | "affirmation_non_verifiee" | "contradiction" | "information_manquante";
  evidence?: string | null;
}

export interface WebResearchReport {
  executiveSummary: string;
  method: string[];
  sources: WebSource[];
  crossCheckedFacts: WebResearchClaim[];
  unverifiedClaims: WebResearchClaim[];
  contradictions: WebResearchClaim[];
  missingInformation: WebResearchClaim[];
  conclusion: string;
  confidence: "élevée" | "moyenne" | "faible" | "indéterminée";
  limits: string[];
}

export interface WebResearchResult {
  id: string;
  question: string;
  timestamp: number;
  model?: string;
  status: "success" | "partial" | "unavailable" | "error";
  plan?: WebResearchPlan;
  steps: WebResearchStep[];
  report?: WebResearchReport;
  error?: string;
  notes?: string[];
}

export type ChatAttachmentKind = "image" | "pdf" | "document" | "text" | "file";

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ChatAttachmentKind;
  /** Data URL (data:...) pour prévisualisation/envoi (images, petits fichiers). */
  dataUrl?: string;
  /** Contenu texte extrait/local pour documents texte. */
  textContent?: string;
  /** Aperçu réduit (image). */
  previewUrl?: string;
  /** Image générée par JARVIS (URL ou data URL). */
  generatedImageUrl?: string;
  /** Indique que l'analyse a été effectuée. */
  analyzed?: boolean;
  /** Erreur de traitement/validation. */
  error?: string;
}

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  source: "voice" | "text";
  isPartial?: boolean;
  sentiment?: SentimentAnalysis;
  tone?: JarvisTone;
  sources?: WebSource[];
  /** Pièces jointes (images/fichiers) associées au message. */
  attachments?: ChatAttachment[];
  /** Images générées et affichées dans la conversation. */
  generatedImages?: Array<{ id: string; url: string; prompt?: string; alt?: string }>;
  /** Modèle/fournisseur ayant produit la réponse (affichage informatif). */
  providerLabel?: string;
}

export interface ConversationSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: TranscriptMessage[];
}

export type MemoryCategory =
  | "identite"
  | "preference"
  | "projet"
  | "consigne"
  | "autre"
  // Module 6 — catégories évolutives
  | "profil_preferences"
  | "projets"
  | "objectifs"
  | "decisions"
  | "habitudes_travail"
  | "informations_importantes";

export type MemoryKnowledgeKind = "fact" | "hypothesis" | "uncertainty";

export interface MemoryItem {
  id: string;
  fact: string;
  category?: MemoryCategory;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
  modeId?: string; // undefined = mémoire centrale commune, sinon contexte propre au mode
  // Module 6 — mémoire évolutive
  kind?: MemoryKnowledgeKind;
  confidence?: number; // 0..1
  source?: "user" | "assistant" | "system" | "import";
  sensitive?: boolean;
  disabled?: boolean;
  lastAccessedAt?: number;
  note?: string;
}

// ---------- Module 6 — Intelligence, Personnalité, Projets ----------

export interface IntelligenceProfile {
  id: string; // singleton: "default"
  displayName?: string;
  baseTone: "elegant" | "friendly" | "direct" | "formal";
  humorLevel: number; // 0..1
  sarcasmLevel: number; // 0..1
  proactivityLevel: number; // 0..1 (suggestions uniquement)
  detailPreference: "concise" | "balanced" | "detailed";
  askWhenMissingInfo: boolean;
  memoryEnabled: boolean;
  autoSaveSensitive: boolean; // doit rester false par défaut
  updatedAt: number;
}

export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type ProjectTaskStatus = "todo" | "in_progress" | "blocked" | "done";

export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: ProjectTaskStatus;
  subtasks: ProjectTask[];
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectBlocker {
  id: string;
  description: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface ProjectItem {
  id: string;
  name: string;
  objective?: string;
  status: ProjectStatus;
  progress: number; // 0..100
  tasks: ProjectTask[];
  blockers: ProjectBlocker[];
  nextActions: string[];
  linkedConversationIds: string[];
  linkedConversationTitles: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface IntelligenceHistoryEvent {
  id: string;
  type:
    | "suggestion"
    | "decision"
    | "memory_update"
    | "project_update"
    | "reliability"
    | "error";
  title: string;
  detail?: string;
  relatedProjectId?: string;
  relatedConversationId?: string;
  createdAt: number;
  level?: "info" | "warning" | "success";
}

export interface WebSearchRecord {
  id: string;
  query: string;
  answer: string;
  sources: WebSource[];
  searchQueries?: string[];
  model?: string;
  timestamp: number;
  isUrlInspection?: boolean;
  metadata?: WebPageMetadata;
  articleExtraction?: WebArticleExtraction;
  structuredAnalysis?: WebStructuredAnalysis;
  // Module 7.2.4 - Comparaison multi-sources (additif, compatible sans migration)
  isComparison?: boolean;
  comparedUrls?: string[];
  comparisonSources?: WebSourceComparisonSource[];
  sourceComparison?: WebSourceComparisonResult;
  // Module 7.3 — Recherche approfondie (additif, compatible sans migration)
  isResearch?: boolean;
  research?: WebResearchResult;
}

export type StoredFileKind = "image" | "pdf" | "document" | "video";

export interface StoredFileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: StoredFileKind;
  base64Data?: string;
  textContent?: string;
  previewUrl?: string;
  analysis?: string;
  analyzedAt?: number;
  createdAt: number;
}

export interface VideoCapabilities {
  ffmpegAvailable: boolean;
  ffmpegVersion: string | null;
  ttsVoice: string;
}

export type CameraMotionType =
  | "zoom_in"
  | "zoom_out"
  | "pan_right"
  | "pan_left";

export type VisualSourceType =
  | "user_image"
  | "pollinations_ai"
  | "wikimedia_commons"
  | "local_holo_render";

export interface VideoScene {
  index: number;
  title?: string;
  durationSec: number;
  startTimeSec?: number;
  endTimeSec?: number;
  narration: string;
  visualCue: string;
  imagePrompt?: string;
  searchKeywords?: string;
  cameraMotion?: CameraMotionType;
  cameraInstruction?: string;
  visualSource?: VisualSourceType;
  previewUrl?: string;
}

export interface VideoValidationInfo {
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  width: number;
  height: number;
  durationSec: number;
  audioDurationSec?: number;
  frameCount: number;
  nonBlackVerified: boolean;
  meanLuma: number;
}

export interface VideoCreationResult {
  id: string;
  title: string;
  status: "rendered" | "assets_ready" | "script_ready";
  ffmpegAvailable: boolean;
  renderEngine?: "ffmpeg_wasm" | "server_ffmpeg";
  videoUrl?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  scenes: VideoScene[];
  narration: string;
  srt: string;
  ffmpegCommand: string;
  validation?: VideoValidationInfo;
  createdAt: number;
}

export interface ConnectionErrorInfo {
  title: string;
  detail: string;
  isMicError?: boolean;
}

export type NewsCategory = "sport" | "world";

export interface NewsArticle {
  id: string;
  category: NewsCategory;
  source: string;
  sourceName: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: number;
}

export interface NewsFeedInfo {
  source: string;
  sourceName: string;
  category: NewsCategory;
  count: number;
}

// ---------- Module 3 — Modes intelligents ----------

export type BuiltinModeId =
  | "education"
  | "religion"
  | "sport"
  | "cuisine"
  | "romantic"
  | "humor"
  | "history"
  | "science"
  | "classic";

export interface ModeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  personality: string;
  instructions: string;
  vocabulary: string;
  style: string;
  detailLevel: number;
  capabilities: string[];
  rules: string[];
  tone: JarvisTone;
  prosody: { rate: number; pitch: number; expressiveness: number };
  builtin: true;
}

export interface CustomMode {
  id: string;
  name: string;
  description: string;
  personality: string;
  instructions: string;
  voiceBehavior: { rate: number; pitch: number; expressiveness: number };
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface JarvisMode {
  id: string;
  source: "builtin" | "custom";
  name: string;
  description: string;
  personality: string;
  instructions: string;
  vocabulary: string;
  style: string;
  detailLevel: number;
  capabilities: string[];
  rules: string[];
  tone: JarvisTone;
  prosody: { rate: number; pitch: number; expressiveness: number };
}

// ---------- Module 4 — Video Studio IA ----------

export type VideoGenerationMode = "text" | "image" | "story";

export type VideoAspectRatio = "9:16" | "16:9" | "1:1";

export type VideoStyle =
  | "realistic"
  | "cinematic"
  | "horror"
  | "anime"
  | "documentary"
  | "football"
  | "fantasy"
  | "ad";

export type VideoCameraMotion =
  | "static"
  | "zoom_in"
  | "zoom_out"
  | "pan_right"
  | "pan_left"
  | "orbit";

export type VideoGenerationStatus =
  | "idle"
  | "storyboarding"
  | "generating"
  | "done"
  | "error";

export interface StoryboardScene {
  id: string;
  index: number;
  title: string;
  narration: string;
  visualDescription: string;
  imagePrompt: string;
  cameraMotion: VideoCameraMotion;
  durationSec: number;
  transition?: string;
}

export interface VideoGenerationRequest {
  mode: VideoGenerationMode;
  prompt: string;
  story?: string;
  imageBase64?: string;
  imageMimeType?: string;
  durationSec: number;
  aspectRatio: VideoAspectRatio;
  style: VideoStyle;
  cameraMotion: VideoCameraMotion;
  transitions: boolean;
  ambiance: string;
  voiceover: boolean;
  characters: string;
  scenes?: StoryboardScene[];
}

export interface VideoProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  requires: string[];
  notes: string;
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
}

export interface VideoGenerationResult {
  id: string;
  mode: VideoGenerationMode;
  title: string;
  provider: string;
  status: VideoGenerationStatus;
  videoUrl?: string;
  storyboard: StoryboardScene[];
  createdAt: number;
  error?: string;
  notes?: string;
}

// ---------- Module Voix — Émotions et Personnalités Vocales ----------

export type VocalEmotion =
  | "joyeux"
  | "triste"
  | "serieux"
  | "colerique"
  | "calme"
  | "enthousiaste"
  | "seducteur"
  | "sarcastique"
  | "mysterieux"
  | "rassurant"
  | "professionnel"
  | "drole";

export type VocalPersonality =
  | "classic"
  | "ironman"
  | "accomplice"
  | "gentleman"
  | "professor"
  | "strategist"
  | "comedien";

export interface ProsodySettings {
  rate: string;   // Edge TTS SSML: "+/-XX%" ou mot-clé
  pitch: string;  // Edge TTS SSML: "+/-XXHz" ou mot-clé
  volume: string; // Edge TTS SSML: "+/-XX%" ou mot-clé
  expressiveness: number; // 0..1, intensité de l'expression
}

export interface VocalStyle {
  emotion: VocalEmotion | null;
  personality: VocalPersonality;
  intensity: number; // 0..1, intensité émotionnelle appliquée
  auto: boolean;     // si true, une détection contextuelle choisit l'émotion
  expressiveness?: number; // 0..1, amplitude de la prosodie (optionnel, compatible anciens profils)
}

export interface VocalStyleConfig {
  id: string;
  emotion: VocalEmotion | null;
  personality: VocalPersonality;
  intensity: number;
  auto: boolean;
  updatedAt: number;
}

export interface VocalPreset {
  emotion: VocalEmotion | null;
  personality: VocalPersonality;
  prosody: ProsodySettings;
  geminiInstruction: string;
}

// ---------- Module 5 — JARVIS Social Hub ----------

export type SocialPlatform = "tiktok" | "instagram";

export type SocialConnectionStatus = "disconnected" | "configured" | "connected" | "error";

export interface SocialPermission {
  scope: string;
  granted: boolean;
  description?: string;
}

export interface SocialAccountPublic {
  platform: SocialPlatform;
  status: SocialConnectionStatus;
  accountId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  permissions: SocialPermission[];
  connectedAt?: number;
  lastSyncAt?: number;
  eligibilityNotes: string[];
  limitations: string[];
  error?: string;
}

export interface SocialOAuthConfigStatus {
  platform: SocialPlatform;
  configured: boolean;
  missingEnv: string[];
  redirectUri?: string;
  notes: string[];
}

export interface SocialMetricPoint {
  label: string;
  value: number | null;
  unavailableReason?: string;
}

export interface SocialPostPerformance {
  id: string;
  platform: SocialPlatform;
  title?: string;
  caption?: string;
  publishedAt?: number;
  permalink?: string;
  thumbnailUrl?: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves?: number | null;
  reach?: number | null;
  unavailableReason?: string;
}

export interface SocialDashboard {
  platform: SocialPlatform;
  accountId?: string;
  username?: string;
  fetchedAt: number;
  followers: number | null;
  metrics: {
    views: SocialMetricPoint;
    likes: SocialMetricPoint;
    comments: SocialMetricPoint;
    shares: SocialMetricPoint;
  };
  evolution: Array<{ date: string; followers?: number | null; views?: number | null; likes?: number | null }>;
  recentPosts: SocialPostPerformance[];
  limitations: string[];
  dataSource: "api" | "unavailable";
}

export interface SocialAnalysisRequest {
  platform?: SocialPlatform | "all";
  question?: string;
}

export interface SocialContentDraft {
  id: string;
  platform: SocialPlatform | "both";
  idea: string;
  hook: string;
  script: string;
  description: string;
  hashtags: string[];
  subtitles: string;
  title: string;
  sourceVideoId?: string;
  sourceVideoTitle?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SocialCalendarItem {
  id: string;
  platform: SocialPlatform | "both";
  title: string;
  notes: string;
  scheduledFor?: number;
  status: "idea" | "planned" | "ready" | "published" | "cancelled";
  draftId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SocialPublishRequest {
  platform: SocialPlatform;
  accountId?: string;
  videoSource: "ai_video_history" | "local_file" | "url";
  videoRef?: string;
  title?: string;
  description: string;
  hashtags: string[];
  scheduledAt?: number;
  confirmed: boolean;
}

export interface SocialPublishResult {
  ok: boolean;
  platform: SocialPlatform;
  published: boolean;
  scheduled: boolean;
  platformPostId?: string;
  permalink?: string;
  message: string;
  limitations: string[];
  performedAt: number;
}

export interface SocialPublicationHistoryItem {
  id: string;
  platform: SocialPlatform;
  status: "draft" | "pending_confirmation" | "published" | "scheduled" | "failed" | "not_supported";
  request: SocialPublishRequest;
  result?: SocialPublishResult;
  createdAt: number;
  updatedAt: number;
}

export interface SocialLinkAnalysis {
  url: string;
  platform: SocialPlatform | "unknown";
  accessible: boolean;
  extracted: {
    title?: string;
    author?: string;
    thumbnailUrl?: string;
    description?: string;
  };
  analysis?: {
    style?: string;
    montage?: string;
    hooks?: string;
    trends?: string;
    originalIdeas?: string[];
  };
  limitations: string[];
  analyzedAt: number;
}
