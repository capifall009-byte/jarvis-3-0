import { useRef, useState } from "react";
import {
  FileText,
  Film,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  WifiOff,
} from "lucide-react";
import {
  analyzeStoredFileWithGemini,
  importLocalFile,
  removeStoredFile,
} from "../../services/files/FileVaultRepository";
import type { StoredFileItem } from "../../types/jarvis";

interface FilesViewProps {
  files: StoredFileItem[];
  onFilesChange: (next: StoredFileItem[]) => void;
  isOnline: boolean;
  extremeDark: boolean;
  onSpeakText: (text: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function FilesView({
  files,
  onFilesChange,
  isOnline,
  extremeDark,
  onSpeakText,
}: FilesViewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [question, setQuestion] = useState("");
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImport = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg(null);
    const added: StoredFileItem[] = [];
    for (const file of Array.from(fileList)) {
      try {
        const stored = await importLocalFile(file);
        added.push(stored);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Erreur lors de l'importation."
        );
      }
    }
    if (added.length > 0) {
      onFilesChange([...added, ...files]);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAnalyze = async (item: StoredFileItem) => {
    if (!isOnline) {
      setErrorMsg(
        "L'analyse par Gemini nécessite une connexion Internet. Vos fichiers restent consultables localement."
      );
      return;
    }
    setErrorMsg(null);
    setAnalyzingId(item.id);
    try {
      const updated = await analyzeStoredFileWithGemini(
        item,
        question.trim() || undefined
      );
      onFilesChange(files.map((f) => (f.id === item.id ? updated : f)));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erreur d'analyse Gemini."
      );
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await removeStoredFile(id);
    onFilesChange(files.filter((f) => f.id !== id));
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
            Fichiers, Photos &amp; Documents
          </h1>
          <p
            className={`text-sm leading-relaxed ${
              extremeDark ? "text-slate-500" : "text-slate-400"
            }`}
          >
            Coffre local IndexedDB accessible hors ligne, avec analyse multimodale
            par Gemini dès que vous êtes connecté.
          </p>
        </header>

        {!isOnline && (
          <div
            className={`rounded-2xl border p-4 flex items-center gap-3 text-sm ${
              extremeDark
                ? "bg-amber-950/20 border-amber-500/25 text-amber-200/85"
                : "bg-amber-950/35 border-amber-400/30 text-amber-100"
            }`}
          >
            <WifiOff className="w-5 h-5 text-amber-300 shrink-0" />
            <span>
              Hors ligne : vous pouvez importer et consulter vos fichiers locaux,
              mais l&apos;analyse Gemini attendra la reconnexion.
            </span>
          </div>
        )}

        {/* Import & Prompt Panel */}
        <div
          className={`rounded-2xl border p-4 space-y-3 ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,text/*,.md,.csv,.json,video/*"
            onChange={(e) => void handleImport(e.target.files)}
            className="hidden"
          />

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                extremeDark
                  ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200"
                  : "bg-cyan-400 hover:bg-cyan-300 border-cyan-300 text-slate-950"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Importer photo, PDF, doc ou vidéo</span>
            </button>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Consigne d'analyse optionnelle (ex. Résume ce PDF)…"
              aria-label="Question d'analyse Gemini"
              className={`flex-1 h-11 px-3.5 rounded-xl border text-sm focus:outline-none ${
                extremeDark
                  ? "bg-black border-white/[0.07] text-slate-200 placeholder:text-slate-600"
                  : "bg-[#050A14]/85 border-cyan-400/20 focus:border-cyan-400/50 text-slate-100 placeholder:text-slate-500"
              }`}
            />
          </div>

          {errorMsg && <p className="text-xs text-red-300">{errorMsg}</p>}
        </div>

        {/* Stored Files List */}
        {files.length === 0 ? (
          <div
            className={`rounded-2xl border p-8 text-center text-sm ${
              extremeDark
                ? "bg-black border-white/[0.05] text-slate-600"
                : "jarvis-glass text-slate-400"
            }`}
          >
            Aucun fichier enregistré pour le moment. Importez une photo, un PDF,
            un fichier texte ou une courte vidéo (16 Mo max).
          </div>
        ) : (
          <ul className="space-y-3">
            {files.map((item) => {
              const isBusy = analyzingId === item.id;
              return (
                <li
                  key={item.id}
                  className={`rounded-2xl border p-4 space-y-3 ${
                    extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl border border-cyan-400/20 bg-cyan-500/10 flex items-center justify-center shrink-0 text-cyan-300">
                          {item.kind === "video" ? (
                            <Film className="w-5 h-5" />
                          ) : item.kind === "image" ? (
                            <ImageIcon className="w-5 h-5" />
                          ) : (
                            <FileText className="w-5 h-5" />
                          )}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-slate-500 font-mono-tabular">
                          {item.kind.toUpperCase()} · {formatBytes(item.size)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleAnalyze(item)}
                        disabled={isBusy || !isOnline}
                        className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border text-xs font-medium disabled:opacity-40 whitespace-nowrap cursor-pointer ${
                          extremeDark
                            ? "border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/35"
                            : "border-cyan-400/30 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isBusy ? "Analyse…" : "Analyser avec Gemini"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        aria-label={`Supprimer ${item.name}`}
                        className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-500 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {item.textContent && !item.analysis && (
                    <pre className="text-xs text-slate-400 bg-black/40 border border-white/[0.06] rounded-xl p-3 max-h-36 overflow-y-auto whitespace-pre-wrap">
                      {item.textContent.slice(0, 800)}
                    </pre>
                  )}

                  {item.analysis && (
                    <div
                      className={`pt-3 border-t space-y-2 ${
                        extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-cyan-300">
                          Analyse Gemini
                        </span>
                        <button
                          type="button"
                          onClick={() => onSpeakText(item.analysis || "")}
                          className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border border-cyan-400/20 text-xs text-cyan-200 hover:bg-cyan-500/15 cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Lire</span>
                        </button>
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                        {item.analysis}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
