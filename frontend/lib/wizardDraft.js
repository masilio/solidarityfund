const KEY = "sf_household_registration_draft";
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // stale after 48h

export function loadDraft() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - (parsed.savedAt || 0) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // best-effort — a failed local save should never block the workflow
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function emptyDraft() {
  return {
    step: 0,
    household: { id: null, code: null, values: {} },
    assessment: { id: null, values: {} },
    request: { values: {} },
  };
}
