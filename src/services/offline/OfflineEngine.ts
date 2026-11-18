import { useEffect, useState } from "react";
import type {
  ConversationSession,
  MemoryItem,
  StoredFileItem,
} from "../../types/jarvis";

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return isOnline;
}

export interface OfflineCommandContext {
  memories: MemoryItem[];
  sessions: ConversationSession[];
  files: StoredFileItem[];
  onToggleExtremeDark: (force?: boolean) => void;
  onNewSession: () => void;
}

export interface OfflineCommandResult {
  reply: string;
  handledLocally: boolean;
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Handles simple offline commands without pretending Gemini AI works offline.
 */
export function executeOfflineCommand(
  rawQuery: string,
  ctx: OfflineCommandContext
): OfflineCommandResult {
  const q = normalize(rawQuery);

  if (q.includes("heure") || q.includes("quel jour") || q.includes("date")) {
    const formatted = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date());
    return {
      handledLocally: true,
      reply: `Mode hors ligne actif. Il est actuellement ${formatted}.`,
    };
  }

  if (q.includes("sombre extreme") || q.includes("economie batterie")) {
    const enable = !q.includes("desactiv");
    ctx.onToggleExtremeDark(enable);
    return {
      handledLocally: true,
      reply: enable
        ? "Mode sombre extrême activé localement pour économiser votre batterie."
        : "Mode sombre standard rétabli.",
    };
  }

  if (q.includes("nouvelle session") || q.includes("nouvelle conversation")) {
    ctx.onNewSession();
    return {
      handledLocally: true,
      reply: "Nouvelle session locale initialisée.",
    };
  }

  if (
    q.includes("souvenir") ||
    q.includes("memoire") ||
    q.includes("tu sais sur moi") ||
    q.includes("rappelle")
  ) {
    if (ctx.memories.length === 0) {
      return {
        handledLocally: true,
        reply:
          "Aucun souvenir permanent n'est enregistré localement pour le moment. Vous pouvez en ajouter dans l'espace Mémoire, même hors connexion.",
      };
    }
    const list = ctx.memories
      .slice(0, 8)
      .map((m) => `• ${m.fact}`)
      .join("\n");
    return {
      handledLocally: true,
      reply: `Mode hors ligne — Voici vos souvenirs enregistrés localement (${ctx.memories.length}) :\n${list}`,
    };
  }

  if (q.includes("fichier") || q.includes("document") || q.includes("photo")) {
    if (ctx.files.length === 0) {
      return {
        handledLocally: true,
        reply:
          "Aucun fichier local n'est enregistré dans votre coffre hors ligne.",
      };
    }
    const list = ctx.files
      .slice(0, 8)
      .map((f) => `• ${f.name} (${f.kind})`)
      .join("\n");
    return {
      handledLocally: true,
      reply: `Mode hors ligne — Fichiers disponibles localement (${ctx.files.length}) :\n${list}`,
    };
  }

  if (q.includes("historique") || q.includes("conversation")) {
    return {
      handledLocally: true,
      reply: `Mode hors ligne — ${ctx.sessions.length} conversation(s) sont sauvegardées sur cet appareil et consultables dans l'historique.`,
    };
  }

  return {
    handledLocally: false,
    reply:
      "JARVIS est actuellement hors ligne. Le cerveau Gemini et la recherche Internet nécessitent une connexion, mais vos souvenirs permanents, votre historique et vos fichiers enregistrés restent accessibles localement. Essayez par exemple : « Mes souvenirs », « Mes fichiers », « Quelle heure est-il ? » ou « Mode sombre extrême ».",
  };
}
