import { getAll, getOne, putOne, deleteOne, destroyDB } from "./db.js";
import { encryptText, decryptText, forgetPassphrase as cryptoForget } from "./crypto.js";

const THEME_KEY = "mp_theme_v1";
const WORD_GOAL_KEY = "mp_word_goal_v1";
const LAST_SEEN_VERSION_KEY = "mp_last_seen_version_v1";
const LAST_BACKUP_KEY = "mp_last_backup_at_v1";
const BACKUP_BANNER_DISMISSED_KEY = "mp_backup_banner_dismissed_at_v1";
const FIRST_OPEN_KEY = "mp_first_open_at_v1";

export const DEFAULT_WORD_GOAL = 750;

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- Dates ----

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateKey, n) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function todayKey() {
  return toDateKey(new Date());
}

export function countWords(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ---- Entries ----
// A record never holds plaintext -- only ciphertext + the iv it was sealed
// with, plus a wordCount kept in the clear so cards can show "142 words"
// without decrypting anything. `committed` distinguishes a page that's been
// deliberately "saved to log" (shows as a card, counts toward the day)
// from an in-progress draft -- but a draft with real words in it still
// counts as a day you wrote, since the writing itself is what matters here,
// not the filing of it. See getDaysWithEntries below.

export async function getEntries() {
  return getAll("entries");
}

export async function getEntry(id) {
  return getOne("entries", id);
}

export async function getEntriesForDate(dateKey) {
  const entries = await getEntries();
  return entries.filter((e) => e.dateKey === dateKey).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getCommittedForDate(dateKey) {
  return (await getEntriesForDate(dateKey)).filter((e) => e.committed);
}

// At most one uncommitted draft per date is ever created -- the editor
// resumes it rather than starting a second one alongside it.
export async function getDraftForDate(dateKey) {
  const entries = await getEntriesForDate(dateKey);
  return entries.find((e) => !e.committed) || null;
}

export async function decryptEntry(entry) {
  if (!entry.cipher) return "";
  return decryptText({ iv: entry.iv, cipher: entry.cipher });
}

// Saves the current text of a draft, encrypting it fresh each time (autosave
// calls this on every debounced keystroke). An entry that's emptied back out
// to nothing is deleted rather than left behind as a zero-word ghost --
// unless it's already committed, in which case an explicit delete (from the
// entry's own menu) is required instead of just clearing the textarea.
export async function saveDraftText(entryId, dateKey, plaintext) {
  const trimmed = plaintext || "";
  const wordCount = countWords(trimmed);
  const existing = entryId ? await getEntry(entryId) : null;

  if (!trimmed.trim() && !(existing && existing.committed)) {
    if (existing) await deleteOne("entries", existing.id);
    return null;
  }

  const { iv, cipher } = await encryptText(trimmed);
  const record = {
    id: existing?.id || entryId || uid(),
    dateKey,
    committed: existing?.committed || false,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    iv,
    cipher,
    wordCount,
  };
  await putOne("entries", record);
  return record;
}

export async function commitEntry(entryId) {
  const entry = await getEntry(entryId);
  if (!entry) return null;
  const updated = { ...entry, committed: true, updatedAt: Date.now() };
  await putOne("entries", updated);
  return updated;
}

export async function deleteEntry(id) {
  await deleteOne("entries", id);
}

// Every calendar day with at least one word ever written to it (draft or
// committed), most recent first -- the backbone of the Day counter, My Log,
// and the Calendar. Filed-away-or-not doesn't matter here: the writing
// itself is the practice.
export async function getDaysWithEntries() {
  const entries = (await getEntries()).filter((e) => e.wordCount > 0);
  const byDate = new Map();
  for (const entry of entries) {
    if (!byDate.has(entry.dateKey)) byDate.set(entry.dateKey, []);
    byDate.get(entry.dateKey).push(entry);
  }
  return [...byDate.entries()]
    .map(([dateKey, dayEntries]) => ({ dateKey, entries: dayEntries.sort((a, b) => a.createdAt - b.createdAt) }))
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
}

// Past days since first-open with nothing written at all -- what the
// Calendar offers to catch up on.
export async function getMissedDateKeys() {
  const days = await getDaysWithEntries();
  const doneDates = new Set(days.map((d) => d.dateKey));
  const earliestEntryKey = days.length ? days[days.length - 1].dateKey : null;
  const firstOpenKey = toDateKey(new Date(getFirstOpenAt()));
  const startKey = earliestEntryKey && earliestEntryKey < firstOpenKey ? earliestEntryKey : firstOpenKey;
  const today = todayKey();
  const missed = [];
  let cursor = startKey;
  while (cursor < today) {
    if (!doneDates.has(cursor)) missed.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return missed;
}

// ---- Export / import ----
// The exported file is still fully encrypted -- every entry keeps its
// ciphertext as-is -- so it's safe to store anywhere. Restoring it only
// works with the four words it was encrypted under.

export async function exportBackupData(cryptoConfig) {
  return {
    type: "morning-pages-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    crypto: cryptoConfig,
    entries: await getEntries(),
    theme: getThemePref(),
    wordGoal: getWordGoal(),
  };
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.dateKey)) return null;
  if (typeof raw.iv !== "string" || typeof raw.cipher !== "string") return null;
  return {
    id: uid(),
    dateKey: raw.dateKey,
    committed: raw.committed !== false,
    iv: raw.iv,
    cipher: raw.cipher,
    wordCount: typeof raw.wordCount === "number" ? raw.wordCount : 0,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
}

// Always merges (adds as new entries) rather than replacing, so a repeated
// or partial import can never destroy what's already logged. Caller is
// responsible for confirming the backup's salt matches the current
// passphrase before calling this -- see dataManagement.js.
export async function importEntries(data) {
  if (!data || data.type !== "morning-pages-backup") {
    throw new Error("That doesn't look like a Morning Pages backup file.");
  }
  const incoming = Array.isArray(data.entries) ? data.entries : [];
  const sanitized = incoming.map(sanitizeEntry).filter(Boolean);
  for (const entry of sanitized) await putOne("entries", entry);

  if (data.theme) setThemePref(data.theme);
  if (typeof data.wordGoal === "number") setWordGoal(data.wordGoal);

  return { entryCount: sanitized.length };
}

// ---- Preferences ----

export function getThemePref() {
  return readJSON(THEME_KEY, {});
}

export function setThemePref(pref) {
  writeJSON(THEME_KEY, pref);
}

export function getWordGoal() {
  const v = Number(localStorage.getItem(WORD_GOAL_KEY));
  return v > 0 ? v : DEFAULT_WORD_GOAL;
}

export function setWordGoal(n) {
  localStorage.setItem(WORD_GOAL_KEY, String(Math.max(1, Math.round(n))));
}

export function getLastSeenVersion() {
  return localStorage.getItem(LAST_SEEN_VERSION_KEY) || "";
}

export function setLastSeenVersion(version) {
  localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
}

function getFirstOpenAt() {
  let v = Number(localStorage.getItem(FIRST_OPEN_KEY));
  if (!v) {
    v = Date.now();
    localStorage.setItem(FIRST_OPEN_KEY, String(v));
  }
  return v;
}
export { getFirstOpenAt };

export function markBackedUp() {
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  localStorage.removeItem(BACKUP_BANNER_DISMISSED_KEY);
}

export function dismissBackupBanner() {
  localStorage.setItem(BACKUP_BANNER_DISMISSED_KEY, String(Date.now()));
}

const BACKUP_REMIND_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const BACKUP_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export async function shouldShowBackupBanner() {
  const entries = await getEntries();
  if (entries.length === 0) return false;

  const lastBackupAt = Number(localStorage.getItem(LAST_BACKUP_KEY)) || getFirstOpenAt();
  if (Date.now() - lastBackupAt < BACKUP_REMIND_AFTER_MS) return false;

  const dismissedAt = Number(localStorage.getItem(BACKUP_BANNER_DISMISSED_KEY));
  if (dismissedAt && Date.now() - dismissedAt < BACKUP_SNOOZE_MS) return false;

  return true;
}

// The only way out for someone who has genuinely lost their four words --
// wipes every local trace, local and IndexedDB alike, so the app can be set
// up fresh. There is no other recovery path by design.
export async function eraseEverything() {
  cryptoForget();
  await destroyDB();
  localStorage.removeItem(THEME_KEY);
  localStorage.removeItem(WORD_GOAL_KEY);
  localStorage.removeItem(LAST_SEEN_VERSION_KEY);
  localStorage.removeItem(LAST_BACKUP_KEY);
  localStorage.removeItem(BACKUP_BANNER_DISMISSED_KEY);
  localStorage.removeItem(FIRST_OPEN_KEY);
}

export { uid };
