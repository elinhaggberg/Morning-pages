// Two tiers of encryption, so writing never waits on the phrase but the
// permanent log always does:
//
// - The "device" key is generated once, sits in localStorage in the clear,
//   and loads automatically -- no phrase needed. It protects an
//   in-progress page from a casual glance (it's not human-readable
//   plaintext sitting in IndexedDB) but it is NOT a secret; anyone with the
//   device can read what it protects. It's what a fresh, unsaved page is
//   encrypted with while you're still writing it.
// - The "vault" key is derived from the four-word phrase, exactly as
//   before: never stored, lives only in memory for this tab, and is the
//   only thing that can decrypt a page once it's been saved to the log.
//   Committing a page (or opening one already committed) re-encrypts it
//   under this key, which is the one moment the phrase actually gets asked
//   for.
const CONFIG_KEY = "mp_crypto_v1";
const DEVICE_KEY_STORAGE_KEY = "mp_device_key_v1";
const PBKDF2_ITERATIONS = 250000;
const VERIFIER_PLAINTEXT = "morning-pages-unlock-check";

let vaultKey = null;
let deviceKeyPromise = null;

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
  return vaultKey !== null;
}

export function lock() {
  vaultKey = null;
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

  vaultKey = key;
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
  vaultKey = key;
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

export async function encryptVaultText(plaintext) {
  if (!vaultKey) throw new Error("locked");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, vaultKey, new TextEncoder().encode(plaintext));
  return { iv: b64FromBytes(iv), cipher: b64FromBytes(new Uint8Array(cipherBuf)) };
}

export async function decryptVaultText({ iv, cipher }) {
  if (!vaultKey) throw new Error("locked");
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytesFromB64(iv) }, vaultKey, bytesFromB64(cipher));
  return new TextDecoder().decode(plainBuf);
}

// Loads (or, on first-ever call, generates) the device key. Never throws,
// never asks for anything -- this is what lets a fresh page start
// encrypting itself the instant you type, with no gate in front of it.
function getDeviceKey() {
  if (!deviceKeyPromise) {
    deviceKeyPromise = (async () => {
      let bytes;
      const stored = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
      if (stored) {
        bytes = bytesFromB64(stored);
      } else {
        bytes = crypto.getRandomValues(new Uint8Array(32));
        localStorage.setItem(DEVICE_KEY_STORAGE_KEY, b64FromBytes(bytes));
      }
      return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    })();
  }
  return deviceKeyPromise;
}

export async function encryptDeviceText(plaintext) {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return { iv: b64FromBytes(iv), cipher: b64FromBytes(new Uint8Array(cipherBuf)) };
}

export async function decryptDeviceText({ iv, cipher }) {
  const key = await getDeviceKey();
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytesFromB64(iv) }, key, bytesFromB64(cipher));
  return new TextDecoder().decode(plainBuf);
}

// Wipes everything -- the deliberate, only way out for someone who's lost
// their phrase for good. IndexedDB deletion is handled by the caller
// (storage.js) since this module doesn't own the DB connection.
export function forgetPassphrase() {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(DEVICE_KEY_STORAGE_KEY);
  vaultKey = null;
  deviceKeyPromise = null;
}
