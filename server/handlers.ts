// Shared server logic. Used by Vercel functions in /api and by the Vite dev middleware.
// Keys never reach the browser.

const GROQ = "https://api.groq.com/openai/v1";
const NIM = "https://integrate.api.nvidia.com/v1";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/** POST multipart {audio} → { text, language } via Groq Whisper. */
export async function transcribe(req: Request): Promise<Response> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: "GROQ_API_KEY not set" }, 500);

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return json({ error: "no audio" }, 400);

  const out = new FormData();
  const name = (audio as File).name || "speech.webm";
  out.append("file", audio, name);
  out.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3");
  out.append("response_format", "verbose_json");
  out.append("temperature", "0");

  const r = await fetch(`${GROQ}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: out,
  });
  if (!r.ok) return json({ error: `groq ${r.status}: ${await r.text()}` }, 502);
  const data = (await r.json()) as { text?: string; language?: string };
  return json({ text: (data.text || "").trim(), language: (data.language || "").toLowerCase() });
}

type ReplyBody = { text: string; language: string; bcp47: string; history?: string[] };

const SYSTEM = (lang: string, bcp47: string) => `You are the cocky, funny AI host of a game called "Mother Tongue".
The player speaks; you guess their mother tongue from their voice and reply in it.
Your guess this round: ${lang} (${bcp47}).

Rules for your reply:
- Write ONLY in ${lang}, in its native script (e.g. Devanagari for Hindi, Tamil script for Tamil). No English unless the guess is English.
- 1-2 short sentences, max ~30 words. Spoken aloud by TTS, so no emoji, no markdown, no lists.
- React to what they actually said, with playful swagger.
- End by asking, in ${lang}, whether you guessed their language right.
Return ONLY JSON: {"reply": string, "english": string}
where "english" is a short English translation of your reply.`;

/** POST {text, language, bcp47} → { reply, english, provider } via NVIDIA NIM (falls back to Groq). */
export async function reply(req: Request): Promise<Response> {
  const body = (await req.json()) as ReplyBody;
  const messages = [
    { role: "system", content: SYSTEM(body.language, body.bcp47) },
    { role: "user", content: `Player said: "${body.text}"` },
  ];

  const providers: { name: string; url: string; key?: string; model: string }[] = [
    {
      name: "nvidia-nim",
      url: `${NIM}/chat/completions`,
      key: process.env.NVIDIA_API_KEY,
      model: process.env.NIM_MODEL || "meta/llama-3.3-70b-instruct",
    },
    {
      name: "groq",
      url: `${GROQ}/chat/completions`,
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
    },
  ];

  const errors: string[] = [];
  for (const p of providers) {
    if (!p.key) continue;
    try {
      const r = await fetch(p.url, {
        method: "POST",
        headers: { authorization: `Bearer ${p.key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: p.model, messages, temperature: 0.8, max_tokens: 300 }),
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      const data = await r.json();
      const raw: string = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseJson(raw);
      return json({ reply: parsed.reply || raw, english: parsed.english || "", provider: p.name });
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  return json({ error: errors.join(" | ") || "no LLM key set" }, 502);
}

function parseJson(raw: string): { reply?: string; english?: string } {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]);
  } catch {
    return {};
  }
}
