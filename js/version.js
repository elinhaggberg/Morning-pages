// Bump APP_VERSION and add a CHANGELOG entry with every user-visible
// release -- whatsNew.js compares this against what a returning visitor
// last saw. Keep the version string in YYYY.MM.DD form (zero-padded) so
// plain string comparison sorts the same as chronological order.
export const APP_VERSION = "2026.08.17";

export const CHANGELOG = [
  {
    version: "2026.08.17",
    date: "August 17, 2026",
    changes: [
      "First release: encrypted daily morning pages, a word-count goal, My Log, Calendar catch-up, and export/import.",
      "Your four-word key is now generated for you, not typed and retyped.",
      "Optional Face ID / Touch ID / fingerprint unlock, alongside your phrase.",
    ],
  },
];
