const PREFS_STORAGE_KEY = "jarvis_app_preferences_v1";
const STARTUP_GREETING_SPOKEN_KEY = "jarvis_startup_greeting_spoken_v1";

export interface AppPreferences {
  startupGreetingSpokenEnabled: boolean;
  showDailyQuote: boolean;
}

const DEFAULT_PREFS: AppPreferences = {
  startupGreetingSpokenEnabled: true,
  showDailyQuote: true,
};

export function loadAppPreferences(): AppPreferences {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_PREFS };
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AppPreferences> | null;
    return {
      startupGreetingSpokenEnabled:
        typeof parsed?.startupGreetingSpokenEnabled === "boolean"
          ? parsed.startupGreetingSpokenEnabled
          : DEFAULT_PREFS.startupGreetingSpokenEnabled,
      showDailyQuote:
        typeof parsed?.showDailyQuote === "boolean"
          ? parsed.showDailyQuote
          : DEFAULT_PREFS.showDailyQuote,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveAppPreferences(prefs: AppPreferences): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

export function hasStartupGreetingBeenSpoken(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STARTUP_GREETING_SPOKEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function markStartupGreetingSpoken(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STARTUP_GREETING_SPOKEN_KEY, "true");
  } catch {
    // ignore storage errors
  }
}
