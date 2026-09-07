/**
 * CyberShield — threat-domain category engine.
 *
 * Every live article is auto-classified against these keyword lexicons the
 * moment it enters the pipeline (see mapFeedItem). The Category Bar, the
 * footer "High Priority Intel" shortcuts and the mobile category drawer all
 * filter the stream through this single source of truth.
 */
export interface ThreatCategory {
  id: string;
  label: string;
  short: string;
  keywords: readonly string[];
}

export const CATEGORIES: readonly ThreatCategory[] = [
  {
    id: "ransomware",
    label: "Ransomware",
    short: "RANSOM",
    keywords: [
      "ransomware",
      "extortion",
      "lockbit",
      "blackcat",
      "alphv",
      "cl0p",
      "akira",
      "play ransomware",
      "ransom",
      "file-encrypting",
      "double extortion",
    ],
  },
  {
    id: "vulnerabilities",
    label: "Zero-Days & CVEs",
    short: "CVE",
    keywords: [
      "zero-day",
      "zero day",
      "0-day",
      "vulnerability",
      "vulnerabilities",
      "cve-",
      "flaw",
      "security patch",
      "patch now",
      "security update",
      "exploited",
      "exploit code",
      "poc",
      "proof-of-concept",
      "cvss",
      "kev",
    ],
  },
  {
    id: "breaches",
    label: "Data Breaches",
    short: "BREACH",
    keywords: [
      "breach",
      "breached",
      "data leak",
      "leaked",
      "stolen data",
      "exposed",
      "compromised",
      "million records",
      "credentials",
      "credential stuffing",
      "dump",
      "intrusion",
      "hackers stole",
      "dark web",
    ],
  },
  {
    id: "apt",
    label: "APT & Nation-State",
    short: "APT",
    keywords: [
      "apt",
      "apt-",
      "nation-state",
      "nation state",
      "espionage",
      "spyware campaign",
      "china-nexus",
      "chinese hackers",
      "russian hackers",
      "north korea",
      "dprk",
      "lazarus",
      "salt typhoon",
      "volt typhoon",
      "fancy bear",
      "cozy bear",
      "muddywater",
      "state-sponsored",
      "cyber espionage",
    ],
  },
  {
    id: "malware",
    label: "Malware",
    short: "MALWARE",
    keywords: [
      "malware",
      "trojan",
      "backdoor",
      "botnet",
      "stealer",
      "infostealer",
      "rootkit",
      "spyware",
      "worm",
      "loader",
      "dropper",
      "keylogger",
      "bootkit",
      "crate",
    ],
  },
  {
    id: "phishing",
    label: "Phishing & Scams",
    short: "PHISH",
    keywords: [
      "phishing",
      "phishers",
      "scam",
      "scammers",
      "social engineering",
      "smishing",
      "vishing",
      "fraud",
      "impersonation",
      "mfa fatigue",
      "fake",
    ],
  },
  {
    id: "ai-security",
    label: "AI Security",
    short: "AI SEC",
    keywords: [
      "llm",
      "gpt",
      "openai",
      "chatgpt",
      "copilot",
      "deepfake",
      "prompt injection",
      "artificial intelligence",
      "machine learning",
      "ai agent",
      "ai model",
      "ai-powered",
    ],
  },
  {
    id: "cloud",
    label: "Cloud & Enterprise",
    short: "CLOUD",
    keywords: [
      "cloud",
      "aws",
      "azure",
      "google cloud",
      "kubernetes",
      "docker",
      "container",
      "saas",
      "vmware",
      "esxi",
      "hypervisor",
      "sharepoint",
      "exchange server",
      "microsoft 365",
      "office 365",
      "sap",
      "oracle",
    ],
  },
  {
    id: "mobile-iot",
    label: "Mobile & IoT",
    short: "IOT",
    keywords: [
      "android",
      "ios",
      "iphone",
      "ipad",
      "mobile",
      "smartphone",
      "iot",
      "router",
      "camera",
      "smart home",
      "5g",
      "modem",
      "bluetooth",
    ],
  },
] as const;

/** IDs of the flagship categories surfaced in the footer quick-links. */
export const HIGH_PRIORITY_CATEGORY_IDS = [
  "ransomware",
  "vulnerabilities",
  "breaches",
  "apt",
  "ai-security",
] as const;

/** Classify a pre-lowered search blob into matching category IDs. */
export function matchCategories(searchBlob: string): string[] {
  if (!searchBlob) return [];
  const hits: string[] = [];
  for (const category of CATEGORIES) {
    for (const keyword of category.keywords) {
      if (searchBlob.includes(keyword)) {
        hits.push(category.id);
        break;
      }
    }
  }
  return hits;
}

export const CATEGORY_MAP: Record<string, ThreatCategory> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);
