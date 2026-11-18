import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface StoredSocialToken {
  platform: "tiktok" | "instagram";
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: number;
  accountId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  permissions?: string[];
  connectedAt: number;
  updatedAt: number;
  rawProfile?: unknown;
}

interface TokenDb {
  tiktok?: StoredSocialToken;
  instagram?: StoredSocialToken;
}

interface EncryptedDb {
  version: 2;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  data: string;
}

const DATA_DIR = path.resolve(process.cwd(), "server", ".data");
const TOKEN_FILE = path.join(DATA_DIR, "social_tokens.json");
const LEGACY_TOKEN_FILE = path.join(DATA_DIR, "social_tokens.plaintext.backup.json");
const KEY_FILE = path.join(DATA_DIR, ".token_key");

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

/** Clé locale : variable d'environnement dédiée, sinon fichier 0600 généré une seule fois. */
function getEncryptionKey(): Buffer {
  const fromEnv = String(process.env.JARVIS_TOKEN_SECRET || "").trim();
  if (fromEnv) {
    return crypto.createHash("sha256").update(fromEnv).digest();
  }
  ensureDir();
  try {
    if (fs.existsSync(KEY_FILE)) {
      const key = Buffer.from(fs.readFileSync(KEY_FILE, "utf-8").trim(), "base64");
      if (key.length === 32) return key;
    }
  } catch {
    // clé illisible : on en régénère une (les anciens tokens chiffrés deviennent illisibles)
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString("base64"), { encoding: "utf-8", mode: 0o600 });
  try {
    fs.chmodSync(KEY_FILE, 0o600);
  } catch {
    // systèmes sans chmod
  }
  return key;
}

function decryptDb(payload: EncryptedDb, key: Buffer): TokenDb {
  const decipher = crypto.createDecipheriv(
    payload.algorithm,
    key,
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf-8")) as TokenDb;
}

function encryptDb(db: TokenDb, key: Buffer): EncryptedDb {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(db), "utf-8"),
    cipher.final(),
  ]);
  return {
    version: 2,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function readDb(): TokenDb {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return {};
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
    const parsed = JSON.parse(raw) as TokenDb | EncryptedDb;
    if ((parsed as EncryptedDb)?.version === 2 && (parsed as EncryptedDb)?.data) {
      return decryptDb(parsed as EncryptedDb, getEncryptionKey());
    }
    // Ancien stockage en clair : conservé tel quel en lecture, migré à la prochaine écriture.
    return parsed as TokenDb;
  } catch {
    return {};
  }
}

function writeDb(db: TokenDb): void {
  ensureDir();
  const payload = encryptDb(db, getEncryptionKey());
  const tempFile = `${TOKEN_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(tempFile, 0o600);
  } catch {
    // systèmes sans chmod
  }
  fs.renameSync(tempFile, TOKEN_FILE);
}

/**
 * Migration explicite et non destructive d'un ancien fichier en clair.
 * Une copie de sécurité est conservée avant chiffrement.
 */
export function migratePlaintextTokens(): { migrated: boolean; error?: string } {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return { migrated: false };
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
    const parsed = JSON.parse(raw) as TokenDb | EncryptedDb;
    if ((parsed as EncryptedDb)?.version === 2) return { migrated: false };
    if (!fs.existsSync(LEGACY_TOKEN_FILE)) {
      fs.copyFileSync(TOKEN_FILE, LEGACY_TOKEN_FILE);
      try {
        fs.chmodSync(LEGACY_TOKEN_FILE, 0o600);
      } catch {
        // systèmes sans chmod
      }
    }
    writeDb(parsed as TokenDb);
    return { migrated: true };
  } catch (e) {
    return { migrated: false, error: e instanceof Error ? e.message : "Échec migration." };
  }
}

export function getStoredToken(platform: "tiktok" | "instagram"): StoredSocialToken | null {
  const db = readDb();
  return db[platform] ?? null;
}

export function saveStoredToken(token: StoredSocialToken): void {
  const db = readDb();
  db[token.platform] = token;
  writeDb(db);
}

export function deleteStoredToken(platform: "tiktok" | "instagram"): void {
  const db = readDb();
  delete db[platform];
  writeDb(db);
}

export function listStoredTokens(): TokenDb {
  return readDb();
}
