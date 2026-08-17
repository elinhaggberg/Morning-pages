// Every page is encrypted with a key derived from a four-word phrase the
// person chooses themselves at onboarding. The phrase is never stored --
// only a random salt and a "verifier" (a known string encrypted with the
// derived key, used to check a guess is right without ever persisting the
// key or phrase itself). The derived key lives only in memory for the life
// of this tab; reloading the app always means entering the phrase again.
const CONFIG_KEY = "mp_crypto_v1";
const PBKDF2_ITERATIONS = 250000;
const VERIFIER_PLAINTEXT = "morning-pages-unlock-check";

let liveKey = null;

function b64FromBytes(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function bytesFromB64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Lowercases and collapses whitespace so a stray extra space or a
// capitalized first letter (easy to do without thinking, typing a phrase
// into a fresh input) doesn't produce a different key than intended.
export function normalizePhrase(words) {
  return words
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

async function deriveKey(phrase, saltBytes, iterations) {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function readConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
  } catch {
    return null;
  }
}

export function hasPassphrase() {
  return Boolean(readConfig());
}

export function isUnlocked() {
  return liveKey !== null;
}

export function lock() {
  liveKey = null;
}

// First-time setup: picks a fresh salt, derives the key, and stores just
// enough (salt + an encrypted-and-checkable canary) to verify a future
// unlock attempt -- never the phrase, never the key.
export async function setupPassphrase(words) {
  const phrase = normalizePhrase(words);
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(phrase, saltBytes, PBKDF2_ITERATIONS);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(VERIFIER_PLAINTEXT));

  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({
      salt: b64FromBytes(saltBytes),
      iterations: PBKDF2_ITERATIONS,
      verifierIv: b64FromBytes(iv),
      verifierCipher: b64FromBytes(new Uint8Array(cipherBuf)),
    })
  );

  liveKey = key;
}

// Adopts a salt/verifier pair from an imported backup instead of generating
// a new one -- used when restoring onto a fresh install that hasn't been
// set up yet, so entries in the backup stay decryptable.
export function adoptConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function getConfig() {
  return readConfig();
}

export async function unlock(words) {
  const config = readConfig();
  if (!config) return false;
  const phrase = normalizePhrase(words);
  const key = await deriveKey(phrase, bytesFromB64(config.salt), config.iterations);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesFromB64(config.verifierIv) },
      key,
      bytesFromB64(config.verifierCipher)
    );
    if (new TextDecoder().decode(plainBuf) !== VERIFIER_PLAINTEXT) return false;
  } catch {
    return false;
  }
  liveKey = key;
  return true;
}

// Verifies a phrase against a *given* config without touching this device's
// live key or stored config -- used to confirm a backup's passphrase before
// adopting it during restore.
export async function verifyAgainstConfig(words, config) {
  const phrase = normalizePhrase(words);
  const key = await deriveKey(phrase, bytesFromB64(config.salt), config.iterations);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesFromB64(config.verifierIv) },
      key,
      bytesFromB64(config.verifierCipher)
    );
    return new TextDecoder().decode(plainBuf) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

export async function encryptText(plaintext) {
  if (!liveKey) throw new Error("locked");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, liveKey, new TextEncoder().encode(plaintext));
  return { iv: b64FromBytes(iv), cipher: b64FromBytes(new Uint8Array(cipherBuf)) };
}

export async function decryptText({ iv, cipher }) {
  if (!liveKey) throw new Error("locked");
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytesFromB64(iv) }, liveKey, bytesFromB64(cipher));
  return new TextDecoder().decode(plainBuf);
}

// Wipes everything -- the deliberate, only way out for someone who's lost
// their phrase for good. IndexedDB deletion is handled by the caller
// (storage.js) since this module doesn't own the DB connection.
export function forgetPassphrase() {
  localStorage.removeItem(CONFIG_KEY);
  liveKey = null;
}
