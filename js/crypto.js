import { WORDLIST } from "./wordlist.js";

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
//   for -- or, if enabled, Face ID / Touch ID / fingerprint can unwrap a
//   locally-stored copy of it instead. See the biometric section below.
const CONFIG_KEY = "mp_crypto_v1";
const DEVICE_KEY_STORAGE_KEY = "mp_device_key_v1";
const BIOMETRIC_WRAP_KEY = "mp_biometric_wrap_v1";
const PBKDF2_ITERATIONS = 250000;
const VERIFIER_PLAINTEXT = "morning-pages-unlock-check";
const PRF_SALT = new TextEncoder().encode("morning-pages-vault-key-v1");
const RP_NAME = "Morning Pages";

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

function bufToBase64Url(buf) {
  return b64FromBytes(new Uint8Array(buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBuf(b64url) {
  const pad = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return bytesFromB64(b64).buffer;
}

// Picks `count` words from the standard BIP-39 list with the Web Crypto
// RNG. The list is exactly 2048 words (2^11), so masking a random 16-bit
// value down to its low 11 bits picks uniformly among all of them -- no
// bias, no rejection sampling needed. Four words from this list carry
// about 44 bits of entropy, considerably more than a phrase most people
// would pick themselves.
export function generatePassphrase(count = 4) {
  const buf = new Uint16Array(count);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => WORDLIST[n & 2047]);
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
    // Extractable -- unlike the earlier version of this function. Needed
    // so a successful unlock (by phrase or by biometric) can export this
    // key's raw bytes to wrap for Face ID / Touch ID unlock. Nothing here
    // ever persists those raw bytes unencrypted; see enableBiometricUnlock.
    true,
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

// ---- Face ID / Touch ID / fingerprint unlock ----
// Entirely optional and additional -- never a replacement for the phrase,
// which remains the one thing that always works, on any device, forever.
// Uses a WebAuthn platform passkey's PRF extension: a value derived from
// the passkey's own hardware-backed private key, obtainable only through a
// real biometric ceremony, never exposed as the private key itself. That
// value wraps a copy of the vault key locally. If this browser/device
// doesn't support the PRF extension, every function below just fails
// closed (returns false) -- nothing is offered, and the phrase is the only
// way in, exactly as before this existed.

export async function isBiometricAvailable() {
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function hasBiometricUnlock() {
  return Boolean(localStorage.getItem(BIOMETRIC_WRAP_KEY));
}

async function deriveBioKeyFromPrf(prfBytes) {
  const baseKey = await crypto.subtle.importKey("raw", prfBytes, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("morning-pages-bio-wrap") },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Registers a platform passkey (Face ID, Touch ID, or a fingerprint --
// whatever the device itself offers) and, if the PRF extension is
// supported, wraps the currently-unlocked vault key under a key derived
// from it. Must be called with the vault already unlocked and from within
// a real tap (WebAuthn requires user activation). Returns true on success;
// false if this device/browser can't do it, or the person cancels either
// prompt.
export async function enableBiometricUnlock() {
  if (!vaultKey) return false;
  try {
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: RP_NAME },
        user: { id: userId, name: "morning-pages", displayName: "Morning Pages" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "required" },
        extensions: { prf: {} },
        timeout: 60000,
      },
    });
    if (!credential?.getClientExtensionResults().prf?.enabled) return false;

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: credential.rawId }],
        userVerification: "required",
        extensions: { prf: { eval: { first: PRF_SALT } } },
        timeout: 60000,
      },
    });
    const prfFirst = assertion?.getClientExtensionResults().prf?.results?.first;
    if (!prfFirst) return false;

    const bioKey = await deriveBioKeyFromPrf(new Uint8Array(prfFirst));
    const rawVaultKey = await crypto.subtle.exportKey("raw", vaultKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrappedBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, bioKey, rawVaultKey);

    localStorage.setItem(
      BIOMETRIC_WRAP_KEY,
      JSON.stringify({
        credentialId: bufToBase64Url(credential.rawId),
        iv: b64FromBytes(iv),
        cipher: b64FromBytes(new Uint8Array(wrappedBuf)),
      })
    );
    return true;
  } catch {
    return false;
  }
}

// Forgets the local wrapped copy -- the phrase-derived vault key itself is
// untouched, and this device just goes back to asking for the four words.
// (The passkey itself stays registered with the OS/browser; there's no way
// to un-register it from here, but it simply goes unused.)
export function disableBiometricUnlock() {
  localStorage.removeItem(BIOMETRIC_WRAP_KEY);
}

// Unwraps the vault key using a fresh biometric ceremony instead of the
// four words. Must be called from within a real tap. Returns true and
// unlocks the vault on success; false on any failure (cancelled prompt,
// unsupported, no wrap saved) -- the caller should fall back to the phrase
// form rather than retry silently.
export async function unlockWithBiometric() {
  let wrap;
  try {
    wrap = JSON.parse(localStorage.getItem(BIOMETRIC_WRAP_KEY) || "null");
  } catch {
    wrap = null;
  }
  if (!wrap) return false;

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: base64UrlToBuf(wrap.credentialId) }],
        userVerification: "required",
        extensions: { prf: { eval: { first: PRF_SALT } } },
        timeout: 60000,
      },
    });
    const prfFirst = assertion?.getClientExtensionResults().prf?.results?.first;
    if (!prfFirst) return false;

    const bioKey = await deriveBioKeyFromPrf(new Uint8Array(prfFirst));
    const rawVaultKey = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesFromB64(wrap.iv) },
      bioKey,
      bytesFromB64(wrap.cipher)
    );
    vaultKey = await crypto.subtle.importKey("raw", rawVaultKey, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    return true;
  } catch {
    return false;
  }
}

// Wipes everything -- the deliberate, only way out for someone who's lost
// their phrase for good. IndexedDB deletion is handled by the caller
// (storage.js) since this module doesn't own the DB connection.
export function forgetPassphrase() {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(DEVICE_KEY_STORAGE_KEY);
  localStorage.removeItem(BIOMETRIC_WRAP_KEY);
  vaultKey = null;
  deviceKeyPromise = null;
}
