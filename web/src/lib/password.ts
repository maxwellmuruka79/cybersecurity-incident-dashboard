// Password strength estimator. Everything runs in the browser: nothing typed is sent anywhere.
//
// Method (a simplified version of how professional estimators work): find the cheapest way an
// attacker could "spell" the password out of known pieces (common words, keyboard patterns,
// years, sequences, repeats), falling back to guessing single characters. The cost of that
// cheapest route is the estimated number of guesses. This is an estimate, not a guarantee.

export interface Finding {
  good: boolean;
  text: string;
}

export interface CrackScenario {
  label: string;
  note: string;
  seconds: number;
}

export interface PasswordReport {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  log10: number; // log10 of the estimated guesses needed
  percent: number; // 0-100 for the strength meter
  findings: Finding[];
  scenarios: CrackScenario[];
}

// Roughly ordered from most to least common. Earlier = cheaper for an attacker to try.
const COMMON = [
  "password", "123456", "123456789", "12345678", "12345", "qwerty", "abc123", "111111", "123123", "password1",
  "iloveyou", "admin", "welcome", "monkey", "login", "letmein", "dragon", "football", "baseball", "sunshine",
  "princess", "master", "hello", "freedom", "whatever", "shadow", "superman", "trustno1", "passw0rd", "starwars",
  "michael", "jennifer", "jordan", "hunter", "ranger", "buster", "thomas", "tigger", "robert", "soccer",
  "batman", "test", "guest", "user", "root", "secret", "love", "angel", "flower", "summer", "winter", "spring",
  "charlie", "donald", "zxcvbn", "qazwsx", "asdfgh", "qwertyuiop", "computer", "internet", "security", "nairobi",
  "kenya", "mombasa", "harambee", "safari", "simba", "mpesa", "jambo", "asante", "karibu", "daystar", "cyber",
  "hacker", "ninja", "lion", "tiger", "pepper", "cookie", "ginger", "chocolate", "banana", "orange", "apple",
  "google", "facebook", "twitter", "samsung", "iphone", "liverpool", "arsenal", "chelsea", "manutd", "barcelona",
  "madrid", "gabriel", "joshua", "daniel", "andrew", "access", "default", "changeme", "p@ssw0rd", "mypassword",
];
const RANK = new Map<string, number>();
COMMON.forEach((w, i) => {
  if (!RANK.has(w)) RANK.set(w, i + 1);
});

const LEET: Record<string, string> = { "@": "a", "4": "a", "8": "b", "3": "e", "!": "i", "0": "o", "$": "s", "5": "s", "7": "t", "+": "t" };
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

type Token = { start: number; end: number; kind: "dict" | "seq" | "repeat" | "year" | "walk" | "char"; log: number; text: string; leet: boolean; rank?: number };

function poolSize(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  return Math.max(pool, 10);
}

// Lower-cases and undoes common letter swaps. "1" could stand for i or l, so both are tried.
function normalised(piece: string): { text: string; leet: boolean }[] {
  const base = piece.toLowerCase();
  let leet = false;
  let a = "";
  for (const ch of base) {
    if (LEET[ch]) {
      a += LEET[ch];
      leet = true;
    } else a += ch;
  }
  const out = [{ text: a, leet }];
  if (a.includes("1")) {
    out.push({ text: a.replace(/1/g, "i"), leet: true });
    out.push({ text: a.replace(/1/g, "l"), leet: true });
  }
  return out;
}

function looksLikeWord(t: string): boolean {
  if (!/^[a-z]+$/.test(t)) return false;
  const vowels = (t.match(/[aeiouy]/g) ?? []).length;
  const ratio = vowels / t.length;
  return ratio >= 0.2 && ratio <= 0.6 && !/[^aeiouy]{4,}/.test(t) && !/(.)\1\1/.test(t);
}

function capitalCost(piece: string): number {
  if (piece === piece.toLowerCase()) return 0;
  if (piece === piece.toUpperCase() || (piece[0] === piece[0].toUpperCase() && piece.slice(1) === piece.slice(1).toLowerCase())) {
    return Math.log10(2);
  }
  return Math.log10(piece.length * 2);
}

function tokenAt(pw: string, i: number, j: number): Token | null {
  const piece = pw.slice(i, j);
  const len = j - i;

  // common words and passwords (with capitals and letter swaps)
  if (len >= 3) {
    let best: Token | null = null;
    for (const v of normalised(piece)) {
      const rank = RANK.get(v.text);
      if (rank !== undefined) {
        const log = Math.log10(rank + 8) + capitalCost(piece) + (v.leet ? Math.log10(2) * 2 : 0);
        if (!best || log < best.log) best = { start: i, end: j, kind: "dict", log, text: piece, leet: v.leet, rank };
      }
    }
    if (best) return best;
  }

  // Pronounceable runs of letters (like "troubador") are almost certainly real words that
  // simply are not in the small built-in list above. Price them as one pick from a large dictionary.
  if (len >= 5 && len <= 40) {
    for (const v of normalised(piece)) {
      if (looksLikeWord(v.text)) {
        const swaps = piece.toLowerCase().split("").filter((c, k) => c !== v.text[k]).length;
        const log = 5.5 + Math.max(0, len - 12) * 0.3 + capitalCost(piece) + swaps * 0.3;
        return { start: i, end: j, kind: "dict", log, text: piece, leet: swaps > 0 };
      }
    }
  }

  if (len >= 4 && /^(19|20)\d\d$/.test(piece)) {
    return { start: i, end: j, kind: "year", log: Math.log10(200), text: piece, leet: false };
  }

  if (len >= 3 && piece.split("").every((c) => c === piece[0])) {
    return { start: i, end: j, kind: "repeat", log: Math.log10(94) + Math.log10(len), text: piece, leet: false };
  }

  if (len >= 3) {
    const codes = piece.toLowerCase().split("").map((c) => c.charCodeAt(0));
    const step = codes[1] - codes[0];
    if ((step === 1 || step === -1) && codes.every((c, k) => k === 0 || c - codes[k - 1] === step)) {
      return { start: i, end: j, kind: "seq", log: Math.log10(72) + Math.log10(len), text: piece, leet: false };
    }
  }

  if (len >= 4) {
    const low = piece.toLowerCase();
    for (const row of ROWS) {
      if (row.includes(low) || row.split("").reverse().join("").includes(low)) {
        return { start: i, end: j, kind: "walk", log: Math.log10(100) + Math.log10(len), text: piece, leet: false };
      }
    }
  }
  return null;
}

export function formatDuration(seconds: number): string {
  if (seconds < 1) return "instantly";
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  const days = seconds / 86400;
  if (days < 365) return `${Math.round(days)} days`;
  const years = days / 365.25;
  if (years < 100) return `${Math.round(years)} years`;
  if (years < 1e6) return "centuries";
  if (years < 1e9) return "millions of years";
  return "billions of years";
}

const LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;

export function analyzePassword(raw: string): PasswordReport {
  const pw = raw.slice(0, 128); // longer than this is strong already, and keeps the analysis fast
  const n = pw.length;
  const emptyScenarios: CrackScenario[] = [];
  if (n === 0) return { score: 0, label: "Enter a password", log10: 0, percent: 0, findings: [], scenarios: emptyScenarios };

  const charCost = Math.log10(poolSize(pw));
  // dp[j] = cheapest cost (log10 guesses) to produce the first j characters
  const dp = new Array<number>(n + 1).fill(Infinity);
  const back = new Array<Token | null>(n + 1).fill(null);
  dp[0] = 0;
  for (let i = 0; i < n; i++) {
    if (dp[i] + charCost < dp[i + 1]) {
      dp[i + 1] = dp[i] + charCost;
      back[i + 1] = { start: i, end: i + 1, kind: "char", log: charCost, text: pw[i], leet: false };
    }
    for (let j = i + 3; j <= n; j++) {
      const t = tokenAt(pw, i, j);
      if (t && dp[i] + t.log < dp[j]) {
        dp[j] = dp[i] + t.log;
        back[j] = t;
      }
    }
  }

  const log10 = dp[n];
  const tokens: Token[] = [];
  for (let j = n; j > 0; ) {
    const t = back[j] as Token;
    tokens.unshift(t);
    j = t.start;
  }

  const score = (log10 < 6 ? 0 : log10 < 9 ? 1 : log10 < 12 ? 2 : log10 < 14 ? 3 : 4) as PasswordReport["score"];

  const findings: Finding[] = [];
  for (const t of tokens) {
    if (t.kind === "dict") {
      findings.push({
        good: false,
        text: `${t.rank !== undefined && t.rank <= 25 ? "Contains one of the most common passwords" : "Contains a common word or password"}: "${t.text}"${
          t.leet ? ". Swapping letters for symbols (like @ for a) is a well-known trick and barely helps" : ""
        }`,
      });
    } else if (t.kind === "walk") findings.push({ good: false, text: `Contains a keyboard pattern: "${t.text}"` });
    else if (t.kind === "seq") findings.push({ good: false, text: `Contains a sequence: "${t.text}"` });
    else if (t.kind === "repeat") findings.push({ good: false, text: `Repeats the same character: "${t.text}"` });
    else if (t.kind === "year") findings.push({ good: false, text: `Contains a year: "${t.text}". Years are easy to guess` });
  }
  if (n < 8) findings.push({ good: false, text: "Too short: under 8 characters" });
  else if (n >= 14) findings.push({ good: true, text: `Long: ${n} characters. Length is the strongest defence` });
  if (score >= 2 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) {
    findings.push({ good: true, text: "Mixes lowercase, uppercase, digits and symbols" });
  }
  if (findings.every((f) => f.good) && score >= 2) findings.unshift({ good: true, text: "No common words or patterns found" });

  const guesses = Math.pow(10, Math.min(log10, 300));
  const average = guesses / 2;
  const scenarios: CrackScenario[] = [
    { label: "Online, with lockouts", note: "about 100 guesses per hour", seconds: average / (100 / 3600) },
    { label: "Online, no protection", note: "about 10 guesses per second", seconds: average / 10 },
    { label: "Stolen database, slow hash (bcrypt style)", note: "about 10,000 guesses per second", seconds: average / 1e4 },
    { label: "Stolen database, fast hash (worst case)", note: "about 10 billion guesses per second", seconds: average / 1e10 },
  ];

  return { score, label: LABELS[score], log10, percent: Math.min(100, (log10 / 15) * 100), findings, scenarios };
}

// ---- random password generator (uses the browser's cryptographic random source) ----
function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max; // reject values that would bias the result
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

export interface GenOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
}

export function generatePassword(o: GenOptions): string {
  const sets: string[] = [];
  if (o.lower) sets.push("abcdefghijkmnopqrstuvwxyz"); // no l, to avoid look-alikes
  if (o.upper) sets.push("ABCDEFGHJKLMNPQRSTUVWXYZ"); // no I or O
  if (o.digits) sets.push("23456789"); // no 0, 1
  if (o.symbols) sets.push("!@#$%^&*()-_=+[]{}?");
  if (sets.length === 0) sets.push("abcdefghijkmnopqrstuvwxyz");
  const all = sets.join("");
  const chars: string[] = sets.map((s) => s[randomInt(s.length)]); // at least one from each chosen set
  while (chars.length < o.length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, Math.max(o.length, sets.length)).join("");
}