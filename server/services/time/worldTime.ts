export interface ResolvedZone {
  iana: string;
  label: string;
}

export interface ZoneTimeInfo {
  iana: string;
  label: string;
  dateTime: string;
  date: string;
  time: string;
  offset: string;
  offsetMinutes: number;
  isDst: boolean | null;
}

interface AliasEntry {
  iana: string | string[];
  label: string;
}

const ALIASES: Record<string, AliasEntry> = {
  "dakar": { iana: "Africa/Dakar", label: "Dakar" },
  "senegal": { iana: "Africa/Dakar", label: "Sénégal" },
  "sénégal": { iana: "Africa/Dakar", label: "Sénégal" },
  "paris": { iana: "Europe/Paris", label: "Paris" },
  "france": { iana: "Europe/Paris", label: "France" },
  "new york": { iana: "America/New_York", label: "New York" },
  "new-york": { iana: "America/New_York", label: "New York" },
  "nyc": { iana: "America/New_York", label: "New York" },
  "etats-unis": { iana: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"], label: "États-Unis" },
  "états-unis": { iana: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"], label: "États-Unis" },
  "usa": { iana: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"], label: "États-Unis" },
  "japon": { iana: "Asia/Tokyo", label: "Japon" },
  "japan": { iana: "Asia/Tokyo", label: "Japon" },
  "tokyo": { iana: "Asia/Tokyo", label: "Tokyo" },
  "londres": { iana: "Europe/London", label: "Londres" },
  "london": { iana: "Europe/London", label: "Londres" },
  "royaume-uni": { iana: "Europe/London", label: "Royaume-Uni" },
  "uk": { iana: "Europe/London", label: "Royaume-Uni" },
  "angleterre": { iana: "Europe/London", label: "Angleterre" },
  "berlin": { iana: "Europe/Berlin", label: "Berlin" },
  "allemagne": { iana: "Europe/Berlin", label: "Allemagne" },
  "germany": { iana: "Europe/Berlin", label: "Allemagne" },
  "madrid": { iana: "Europe/Madrid", label: "Madrid" },
  "espagne": { iana: "Europe/Madrid", label: "Espagne" },
  "spain": { iana: "Europe/Madrid", label: "Espagne" },
  "rome": { iana: "Europe/Rome", label: "Rome" },
  "italie": { iana: "Europe/Rome", label: "Italie" },
  "italy": { iana: "Europe/Rome", label: "Italie" },
  "bruxelles": { iana: "Europe/Brussels", label: "Bruxelles" },
  "belgique": { iana: "Europe/Brussels", label: "Belgique" },
  "geneve": { iana: "Europe/Zurich", label: "Genève" },
  "genève": { iana: "Europe/Zurich", label: "Genève" },
  "zurich": { iana: "Europe/Zurich", label: "Zurich" },
  "suisse": { iana: "Europe/Zurich", label: "Suisse" },
  "moscou": { iana: "Europe/Moscow", label: "Moscou" },
  "moscow": { iana: "Europe/Moscow", label: "Moscou" },
  "russie": { iana: ["Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka"], label: "Russie" },
  "russia": { iana: ["Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka"], label: "Russie" },
  "pekin": { iana: "Asia/Shanghai", label: "Pékin" },
  "pékin": { iana: "Asia/Shanghai", label: "Pékin" },
  "beijing": { iana: "Asia/Shanghai", label: "Pékin" },
  "shanghai": { iana: "Asia/Shanghai", label: "Shanghai" },
  "chine": { iana: "Asia/Shanghai", label: "Chine" },
  "china": { iana: "Asia/Shanghai", label: "Chine" },
  "inde": { iana: "Asia/Kolkata", label: "Inde" },
  "india": { iana: "Asia/Kolkata", label: "Inde" },
  "new delhi": { iana: "Asia/Kolkata", label: "New Delhi" },
  "delhi": { iana: "Asia/Kolkata", label: "New Delhi" },
  "dubai": { iana: "Asia/Dubai", label: "Dubaï" },
  "dubaï": { iana: "Asia/Dubai", label: "Dubaï" },
  "emirats arabes unis": { iana: "Asia/Dubai", label: "Émirats arabes unis" },
  "émirats arabes unis": { iana: "Asia/Dubai", label: "Émirats arabes unis" },
  "doha": { iana: "Asia/Qatar", label: "Doha" },
  "qatar": { iana: "Asia/Qatar", label: "Qatar" },
  "ryad": { iana: "Asia/Riyadh", label: "Riyad" },
  "riyadh": { iana: "Asia/Riyadh", label: "Riyad" },
  "arabie saoudite": { iana: "Asia/Riyadh", label: "Arabie saoudite" },
  "le caire": { iana: "Africa/Cairo", label: "Le Caire" },
  "cairo": { iana: "Africa/Cairo", label: "Le Caire" },
  "egypte": { iana: "Africa/Cairo", label: "Égypte" },
  "égypte": { iana: "Africa/Cairo", label: "Égypte" },
  "casablanca": { iana: "Africa/Casablanca", label: "Casablanca" },
  "maroc": { iana: "Africa/Casablanca", label: "Maroc" },
  "morocco": { iana: "Africa/Casablanca", label: "Maroc" },
  "alger": { iana: "Africa/Algiers", label: "Alger" },
  "algerie": { iana: "Africa/Algiers", label: "Algérie" },
  "algérie": { iana: "Africa/Algiers", label: "Algérie" },
  "tunis": { iana: "Africa/Tunis", label: "Tunis" },
  "tunisie": { iana: "Africa/Tunis", label: "Tunisie" },
  "abidjan": { iana: "Africa/Abidjan", label: "Abidjan" },
  "cote d'ivoire": { iana: "Africa/Abidjan", label: "Côte d'Ivoire" },
  "côte d'ivoire": { iana: "Africa/Abidjan", label: "Côte d'Ivoire" },
  "lagos": { iana: "Africa/Lagos", label: "Lagos" },
  "nigeria": { iana: "Africa/Lagos", label: "Nigeria" },
  "johannesburg": { iana: "Africa/Johannesburg", label: "Johannesburg" },
  "afrique du sud": { iana: "Africa/Johannesburg", label: "Afrique du Sud" },
  "nairobi": { iana: "Africa/Nairobi", label: "Nairobi" },
  "kenya": { iana: "Africa/Nairobi", label: "Kenya" },
  "sydney": { iana: "Australia/Sydney", label: "Sydney" },
  "melbourne": { iana: "Australia/Melbourne", label: "Melbourne" },
  "australie": { iana: ["Australia/Perth", "Australia/Adelaide", "Australia/Darwin", "Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne", "Australia/Hobart"], label: "Australie" },
  "australia": { iana: ["Australia/Perth", "Australia/Adelaide", "Australia/Darwin", "Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne", "Australia/Hobart"], label: "Australie" },
  "toronto": { iana: "America/Toronto", label: "Toronto" },
  "montreal": { iana: "America/Toronto", label: "Montréal" },
  "montréal": { iana: "America/Toronto", label: "Montréal" },
  "vancouver": { iana: "America/Vancouver", label: "Vancouver" },
  "canada": { iana: ["America/St_Johns", "America/Halifax", "America/Toronto", "America/Winnipeg", "America/Edmonton", "America/Vancouver"], label: "Canada" },
  "mexico": { iana: "America/Mexico_City", label: "Mexico" },
  "mexique": { iana: "America/Mexico_City", label: "Mexique" },
  "sao paulo": { iana: "America/Sao_Paulo", label: "São Paulo" },
  "são paulo": { iana: "America/Sao_Paulo", label: "São Paulo" },
  "bresil": { iana: ["America/Noronha", "America/Belem", "America/Fortaleza", "America/Recife", "America/Bahia", "America/Sao_Paulo", "America/Cuiaba", "America/Manaus", "America/Rio_Branco"], label: "Brésil" },
  "brésil": { iana: ["America/Noronha", "America/Belem", "America/Fortaleza", "America/Recife", "America/Bahia", "America/Sao_Paulo", "America/Cuiaba", "America/Manaus", "America/Rio_Branco"], label: "Brésil" },
  "brazil": { iana: ["America/Noronha", "America/Belem", "America/Fortaleza", "America/Recife", "America/Bahia", "America/Sao_Paulo", "America/Cuiaba", "America/Manaus", "America/Rio_Branco"], label: "Brésil" },
  "buenos aires": { iana: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  "argentine": { iana: "America/Argentina/Buenos_Aires", label: "Argentine" },
  "argentina": { iana: "America/Argentina/Buenos_Aires", label: "Argentine" },
  "los angeles": { iana: "America/Los_Angeles", label: "Los Angeles" },
  "chicago": { iana: "America/Chicago", label: "Chicago" },
  "san francisco": { iana: "America/Los_Angeles", label: "San Francisco" },
  "washington": { iana: "America/New_York", label: "Washington" },
  "seoul": { iana: "Asia/Seoul", label: "Séoul" },
  "séoul": { iana: "Asia/Seoul", label: "Séoul" },
  "coree du sud": { iana: "Asia/Seoul", label: "Corée du Sud" },
  "corée du sud": { iana: "Asia/Seoul", label: "Corée du Sud" },
  "singapour": { iana: "Asia/Singapore", label: "Singapour" },
  "singapore": { iana: "Asia/Singapore", label: "Singapour" },
  "bangkok": { iana: "Asia/Bangkok", label: "Bangkok" },
  "thailande": { iana: "Asia/Bangkok", label: "Thaïlande" },
  "thaïlande": { iana: "Asia/Bangkok", label: "Thaïlande" },
  "istanbul": { iana: "Europe/Istanbul", label: "Istanbul" },
  "turquie": { iana: "Europe/Istanbul", label: "Turquie" },
  "turkey": { iana: "Europe/Istanbul", label: "Turquie" },
  "jerusalem": { iana: "Asia/Jerusalem", label: "Jérusalem" },
  "jérusalem": { iana: "Asia/Jerusalem", label: "Jérusalem" },
  "israel": { iana: "Asia/Jerusalem", label: "Israël" },
  "israël": { iana: "Asia/Jerusalem", label: "Israël" },
  "utc": { iana: "UTC", label: "UTC" },
  "gmt": { iana: "UTC", label: "UTC" },
};

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9\s/\-_:+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSupportedTimeZones(): Set<string> | null {
  try {
    const fn = (Intl as any).supportedValuesOf;
    if (typeof fn === "function") {
      const zones = fn.call(Intl, "timeZone") as string[];
      return new Set(zones);
    }
  } catch {
    // ignore
  }
  return null;
}

function isValidIanaZone(zone: string): boolean {
  if (!zone) return false;
  try {
    // Throws RangeError if invalid timeZone
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolvePlaceToZones(place: string): { zones: ResolvedZone[]; ambiguous: boolean; unknown: boolean } {
  const raw = place.trim();
  if (!raw) return { zones: [], ambiguous: false, unknown: true };

  // Direct IANA-like input
  if (/^[A-Za-z_]+\/[A-Za-z0-9_\-+\/]+$/.test(raw) || raw.toUpperCase() === "UTC") {
    const z = raw.toUpperCase() === "UTC" ? "UTC" : raw;
    if (isValidIanaZone(z)) {
      return { zones: [{ iana: z, label: z }], ambiguous: false, unknown: false };
    }
  }

  const key = normalizeKey(raw);
  const entry = ALIASES[key] || ALIASES[raw.toLowerCase()];
  if (entry) {
    const list = Array.isArray(entry.iana) ? entry.iana : [entry.iana];
    const valid = list.filter((z) => isValidIanaZone(z));
    if (valid.length === 1) {
      return { zones: [{ iana: valid[0], label: entry.label }], ambiguous: false, unknown: false };
    }
    if (valid.length > 1) {
      return { zones: valid.map((z) => ({ iana: z, label: `${entry.label} (${z})` })), ambiguous: true, unknown: false };
    }
  }

  // Try to find by IANA city token match (best-effort, non-invented)
  const supported = getSupportedTimeZones();
  if (supported) {
    const token = key.replace(/\s+/g, "_");
    const matches: string[] = [];
    for (const z of supported) {
      const zl = z.toLowerCase();
      if (zl === key || zl.endsWith("/" + token) || zl.includes(token)) {
        matches.push(z);
      }
    }
    if (matches.length === 1) {
      return { zones: [{ iana: matches[0], label: raw }], ambiguous: false, unknown: false };
    }
    if (matches.length > 1 && matches.length <= 8) {
      return { zones: matches.map((z) => ({ iana: z, label: `${raw} (${z})` })), ambiguous: true, unknown: false };
    }
  }

  return { zones: [], ambiguous: false, unknown: true };
}

function getOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const asUTC = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second)
    );
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${h}:${m}`;
}

export function getZoneTimeInfo(iana: string, label: string, now = new Date()): ZoneTimeInfo | null {
  if (!isValidIanaZone(iana)) return null;
  try {
    const dateTime = new Intl.DateTimeFormat("fr-FR", {
      timeZone: iana,
      dateStyle: "full",
      timeStyle: "long",
    }).format(now);
    const date = new Intl.DateTimeFormat("fr-FR", { timeZone: iana, dateStyle: "full" }).format(now);
    const time = new Intl.DateTimeFormat("fr-FR", { timeZone: iana, timeStyle: "medium" }).format(now);
    const offsetMinutes = getOffsetMinutes(now, iana);

    // Rough DST heuristic: compare offset in January and July in that zone (when applicable)
    let isDst: boolean | null = null;
    try {
      const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: iana, year: "numeric" }).format(now));
      const jan = getOffsetMinutes(new Date(Date.UTC(year, 0, 15, 12, 0, 0)), iana);
      const jul = getOffsetMinutes(new Date(Date.UTC(year, 6, 15, 12, 0, 0)), iana);
      if (jan !== jul) {
        const max = Math.max(jan, jul);
        isDst = offsetMinutes === max;
      } else {
        isDst = false;
      }
    } catch {
      isDst = null;
    }

    return {
      iana,
      label,
      dateTime,
      date,
      time,
      offset: formatOffset(offsetMinutes),
      offsetMinutes,
      isDst,
    };
  } catch {
    return null;
  }
}

function diffText(a: ZoneTimeInfo, b: ZoneTimeInfo): string {
  const diffMin = a.offsetMinutes - b.offsetMinutes;
  const abs = Math.abs(diffMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const hm = m ? `${h} h ${m} min` : `${h} h`;
  if (diffMin === 0) return `${a.label} et ${b.label} ont le même décalage horaire à cet instant (${a.offset}).`;
  const ahead = diffMin > 0 ? a.label : b.label;
  const behind = diffMin > 0 ? b.label : a.label;
  return `${ahead} a ${hm} d'avance sur ${behind} à cet instant (${a.label}: ${a.offset}, ${b.label}: ${b.offset}).`;
}

function parseHourMinute(text: string): { hour: number; minute: number } | null {
  const m = text.match(/\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?\b/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function zonedDateTimeToUtcMs(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number | null {
  // Iterative approximation using Intl offset at candidate instants (handles DST reliably enough)
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const off = getOffsetMinutes(new Date(guess), timeZone);
    const next = Date.UTC(year, month - 1, day, hour, minute, 0) - off * 60000;
    if (Math.abs(next - guess) < 1000) { guess = next; break; }
    guess = next;
  }
  return guess;
}

function getZoneYmd(date: Date, timeZone: string): { year: number; month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
  } catch {
    return null;
  }
}

export interface TimeComputationContext {
  userTimeZone?: string;
  facts: string[];
  hasTimeIntent: boolean;
}

const TIME_INTENT_RE = /\b(heure|horloge|fuseau|fuseaux|decalage|d[eé]calage|quelle heure|quand sera|quand il sera|date locale|jour local|dst|heure d'?ete|heure d'?hiver|temps universel|utc|gmt)\b/i;

function findMentionedPlaces(message: string): string[] {
  const lower = message.toLowerCase();
  const found: string[] = [];
  const candidates = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx !== -1) {
      // crude word boundary-ish check
      const before = idx === 0 ? " " : lower[idx - 1];
      const after = idx + c.length >= lower.length ? " " : lower[idx + c.length];
      if (/[\s,.;:!?'"()\[\]]/.test(before) && /[\s,.;:!?'"()\[\]]/.test(after)) {
        const label = ALIASES[c].label;
        if (!found.some((f) => normalizeKey(f) === normalizeKey(label) || normalizeKey(f) === normalizeKey(c))) {
          found.push(label);
        }
      }
    }
  }

  // Detect explicit IANA tokens
  const ianaMatches = message.match(/\b[A-Za-z_]+\/[A-Za-z0-9_\-+\/]+\b/g) || [];
  for (const m of ianaMatches) {
    if (isValidIanaZone(m)) found.push(m);
  }
  return found.slice(0, 6);
}

export function buildTimeContextForMessage(message: string, userTimeZone?: string, now = new Date()): TimeComputationContext {
  const facts: string[] = [];
  const hasTimeIntent = TIME_INTENT_RE.test(message || "") || /\b\d{1,2}\s*(?:h|:)\s*\d{0,2}\b/i.test(message || "");
  const validUserTz = userTimeZone && isValidIanaZone(userTimeZone) ? userTimeZone : undefined;

  facts.push(`Instant de référence (calculé): ${now.toISOString()} (UTC).`);

  if (validUserTz) {
    const u = getZoneTimeInfo(validUserTz, `Fuseau utilisateur (${validUserTz})`, now);
    if (u) {
      facts.push(`Heure/date dans le fuseau utilisateur ${u.iana}: ${u.dateTime} (${u.offset}${u.isDst === true ? ", heure d'été" : u.isDst === false ? ", heure standard" : ""}).`);
    }
  } else if (userTimeZone) {
    facts.push(`Fuseau utilisateur fourni non valide ou non reconnu: "${userTimeZone}". Ne pas le confondre avec le fuseau serveur.`);
  } else {
    facts.push("Fuseau utilisateur non fourni. Ne pas supposer le fuseau de l'utilisateur ni utiliser le fuseau serveur comme fuseau utilisateur.");
  }

  if (!hasTimeIntent) {
    return { userTimeZone: validUserTz, facts, hasTimeIntent };
  }

  const places = findMentionedPlaces(message);
  const resolvedInfos: ZoneTimeInfo[] = [];
  const notes: string[] = [];

  for (const place of places) {
    const r = resolvePlaceToZones(place);
    if (r.unknown) {
      notes.push(`Lieu "${place}" non résolu de façon fiable: demander une ville précise ou un fuseau IANA, ne pas inventer.`);
      continue;
    }
    if (r.ambiguous) {
      notes.push(`Lieu "${place}" ambigu (plusieurs fuseaux IANA possibles): ${r.zones.slice(0, 6).map((z) => z.iana).join(", ")}. Demander une précision (ville/région/fuseau IANA).`);
      // Still compute for first few to be helpful but mark ambiguity
      for (const z of r.zones.slice(0, 3)) {
        const info = getZoneTimeInfo(z.iana, z.label, now);
        if (info) resolvedInfos.push(info);
      }
      continue;
    }
    const z = r.zones[0];
    const info = getZoneTimeInfo(z.iana, z.label, now);
    if (info) resolvedInfos.push(info);
  }

  // Deduplicate by iana
  const uniq: ZoneTimeInfo[] = [];
  const seen = new Set<string>();
  for (const i of resolvedInfos) {
    if (seen.has(i.iana)) continue;
    seen.add(i.iana);
    uniq.push(i);
  }

  for (const i of uniq) {
    facts.push(`Lieu/fuseau ${i.label} [IANA ${i.iana}] — date locale: ${i.date} ; heure locale: ${i.time} ; décalage: ${i.offset}${i.isDst === true ? " (heure d'été)" : i.isDst === false ? " (heure standard)" : ""}.`);
  }

  // Differences between mentioned zones
  if (uniq.length >= 2) {
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        facts.push(diffText(uniq[i], uniq[j]));
      }
    }
  }

  // "Quand sera-t-il HH[:MM] à X ?" conversions (best-effort)
  const hm = parseHourMinute(message);
  if (hm && uniq.length >= 1) {
    for (const target of uniq.slice(0, 2)) {
      const ymd = getZoneYmd(now, target.iana);
      if (!ymd) continue;
      const utcMs = zonedDateTimeToUtcMs(ymd.year, ymd.month, ymd.day, hm.hour, hm.minute, target.iana);
      if (utcMs == null) continue;
      const at = new Date(utcMs);
      const targetLabel = `${String(hm.hour).padStart(2, "0")}:${String(hm.minute).padStart(2, "0")} (${target.label}, ${target.iana}, date locale ${ymd.year}-${String(ymd.month).padStart(2, "0")}-${String(ymd.day).padStart(2, "0")})`;
      if (validUserTz) {
        const inUser = new Intl.DateTimeFormat("fr-FR", { timeZone: validUserTz, dateStyle: "full", timeStyle: "medium" }).format(at);
        facts.push(`Conversion horaire: quand il est ${targetLabel}, cela correspond à ${inUser} dans le fuseau utilisateur (${validUserTz}).`);
      } else {
        facts.push(`Conversion horaire: quand il est ${targetLabel}, l'instant UTC correspondant est ${at.toISOString()}. Fuseau utilisateur non fourni: demander s'il faut convertir dans un fuseau précis.`);
      }
      facts.push(`Remarque: le résultat dépend du jour/changement d'heure (DST) du fuseau ${target.iana}.`);
    }
  }

  for (const n of notes) facts.push(n);

  if (places.length === 0 && hasTimeIntent) {
    facts.push("Aucun lieu/fuseau IANA identifié avec certitude dans la demande: si l'utilisateur demande l'heure d'un lieu précis, demander le nom de la ville/pays ou le fuseau IANA plutôt que deviner.");
  }

  return { userTimeZone: validUserTz, facts, hasTimeIntent };
}

export function buildUserNowContext(userTimeZone?: string, now = new Date()): string[] {
  const facts: string[] = [];
  facts.push(`Instant de référence (calculé): ${now.toISOString()} (UTC).`);
  if (userTimeZone && isValidIanaZone(userTimeZone)) {
    const u = getZoneTimeInfo(userTimeZone, `Fuseau utilisateur (${userTimeZone})`, now);
    if (u) facts.push(`Heure/date locale de l'utilisateur [${u.iana}]: ${u.dateTime} (${u.offset}).`);
  }
  return facts;
}
