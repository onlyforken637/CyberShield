/**
 * CyberShield — threat-domain keyword lexicon.
 * The Topic Intercept Cloud in Column A is derived from these terms matched
 * against the live incoming article payloads (a badge only appears when the
 * keyword actually occurs in the current live feed slice).
 */
export const KEYWORD_LEXICON: readonly string[] = [
  "Ransomware",
  "Zero-Day",
  "APT",
  "Vulnerability",
  "Malware",
  "Exploit",
  "Data Breach",
  "Phishing",
  "Cloud Security",
  "Botnet",
  "Spyware",
  "Backdoor",
  "DDoS",
  "Encryption",
  "Supply Chain",
  "Credential",
  "Firmware",
  "IoT",
  "AI Security",
  "Patch",
  "Windows",
  "Linux",
  "Android",
  "macOS",
  "Microsoft",
  "Apple",
  "Google",
  "Fortinet",
  "Citrix",
  "Ivanti",
  "Cisco",
] as const;
