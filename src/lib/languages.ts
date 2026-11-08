// Whisper returns a lowercase English language name (sometimes an ISO code).
// Map it to a BCP-47 tag for speech synthesis plus the language's own name.

export type Lang = { key: string; english: string; native: string; bcp47: string };

const TABLE: [string, string, string, string][] = [
  // key, english, native, bcp47
  ["english", "English", "English", "en-US"],
  ["hindi", "Hindi", "हिन्दी", "hi-IN"],
  ["tamil", "Tamil", "தமிழ்", "ta-IN"],
  ["telugu", "Telugu", "తెలుగు", "te-IN"],
  ["kannada", "Kannada", "ಕನ್ನಡ", "kn-IN"],
  ["malayalam", "Malayalam", "മലയാളം", "ml-IN"],
  ["marathi", "Marathi", "मराठी", "mr-IN"],
  ["bengali", "Bengali", "বাংলা", "bn-IN"],
  ["gujarati", "Gujarati", "ગુજરાતી", "gu-IN"],
  ["punjabi", "Punjabi", "ਪੰਜਾਬੀ", "pa-IN"],
  ["urdu", "Urdu", "اردو", "ur-PK"],
  ["nepali", "Nepali", "नेपाली", "ne-NP"],
  ["sinhala", "Sinhala", "සිංහල", "si-LK"],
  ["assamese", "Assamese", "অসমীয়া", "as-IN"],
  ["sanskrit", "Sanskrit", "संस्कृतम्", "sa-IN"],
  ["spanish", "Spanish", "Español", "es-ES"],
  ["french", "French", "Français", "fr-FR"],
  ["german", "German", "Deutsch", "de-DE"],
  ["italian", "Italian", "Italiano", "it-IT"],
  ["portuguese", "Portuguese", "Português", "pt-BR"],
  ["dutch", "Dutch", "Nederlands", "nl-NL"],
  ["russian", "Russian", "Русский", "ru-RU"],
  ["ukrainian", "Ukrainian", "Українська", "uk-UA"],
  ["polish", "Polish", "Polski", "pl-PL"],
  ["turkish", "Turkish", "Türkçe", "tr-TR"],
  ["arabic", "Arabic", "العربية", "ar-SA"],
  ["persian", "Persian", "فارسی", "fa-IR"],
  ["hebrew", "Hebrew", "עברית", "he-IL"],
  ["swahili", "Swahili", "Kiswahili", "sw-KE"],
  ["chinese", "Chinese", "中文", "zh-CN"],
  ["cantonese", "Cantonese", "粵語", "zh-HK"],
  ["japanese", "Japanese", "日本語", "ja-JP"],
  ["korean", "Korean", "한국어", "ko-KR"],
  ["indonesian", "Indonesian", "Bahasa Indonesia", "id-ID"],
  ["malay", "Malay", "Bahasa Melayu", "ms-MY"],
  ["tagalog", "Tagalog", "Tagalog", "fil-PH"],
  ["vietnamese", "Vietnamese", "Tiếng Việt", "vi-VN"],
  ["thai", "Thai", "ไทย", "th-TH"],
  ["greek", "Greek", "Ελληνικά", "el-GR"],
  ["swedish", "Swedish", "Svenska", "sv-SE"],
  ["norwegian", "Norwegian", "Norsk", "nb-NO"],
  ["danish", "Danish", "Dansk", "da-DK"],
  ["finnish", "Finnish", "Suomi", "fi-FI"],
  ["czech", "Czech", "Čeština", "cs-CZ"],
  ["romanian", "Romanian", "Română", "ro-RO"],
  ["hungarian", "Hungarian", "Magyar", "hu-HU"],
];

const BY_KEY = new Map<string, Lang>();
for (const [key, english, native, bcp47] of TABLE) {
  const l = { key, english, native, bcp47 };
  BY_KEY.set(key, l);
  BY_KEY.set(bcp47.split("-")[0], l); // also accept ISO codes ("ta", "hi"…)
}

export function resolveLang(whisper: string): Lang {
  const k = whisper.trim().toLowerCase();
  return (
    BY_KEY.get(k) ?? {
      key: k || "unknown",
      english: k ? k[0].toUpperCase() + k.slice(1) : "Unknown",
      native: k || "?",
      bcp47: "en-US",
    }
  );
}

export const ALL_LANGS: Lang[] = TABLE.map(([key, english, native, bcp47]) => ({ key, english, native, bcp47 }));
