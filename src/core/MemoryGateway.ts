/**
 * Passerelle mémoire du noyau JARVIS 4.0.
 *
 * La mémoire existante (MemoryRepository / IndexedDB / localStorage) reste la
 * source de vérité. Cette passerelle est en lecture seule et n'efface, ne
 * remplace et ne réécrit aucune donnée existante.
 */

export interface MemorySnippet {
  id?: string;
  text: string;
  category?: string;
  source?: string;
  createdAt?: number;
}

export interface MemoryGatewayInfo {
  kind: string;
  readOnly: boolean;
  detail: string;
}

export interface MemoryGateway {
  readonly info: MemoryGatewayInfo;
  search(query: string, limit?: number): Promise<MemorySnippet[]>;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Passerelle en mémoire, utile pour les tests et comme repli sans stockage
 * externe. Construite à partir d'un instantané (jamais destructrice).
 */
export class StaticMemoryGateway implements MemoryGateway {
  readonly info: MemoryGatewayInfo = {
    kind: "static-snapshot",
    readOnly: true,
    detail: "Instantané de mémoire en lecture seule. Aucune suppression ni modification.",
  };

  private readonly items: MemorySnippet[];

  constructor(items: MemorySnippet[] = []) {
    this.items = items.slice();
  }

  async search(query: string, limit = 8): Promise<MemorySnippet[]> {
    const tokens = normalize(query).split(/\s+/).filter((t) => t.length > 2);
    if (tokens.length === 0) return [];
    return this.items
      .map((item) => {
        const haystack = normalize(item.text);
        const matches = tokens.filter((token) => haystack.includes(token)).length;
        return { item, matches };
      })
      .filter((entry) => entry.matches > 0)
      .sort((a, b) => b.matches - a.matches)
      .slice(0, Math.max(1, limit))
      .map((entry) => entry.item);
  }
}

/** Passerelle vide : utilisée quand aucune mémoire n'est disponible. */
export class NoopMemoryGateway implements MemoryGateway {
  readonly info: MemoryGatewayInfo = {
    kind: "none",
    readOnly: true,
    detail: "Aucune mémoire connectée au noyau (le stockage mémoire existant reste intact).",
  };

  async search(): Promise<MemorySnippet[]> {
    return [];
  }
}
