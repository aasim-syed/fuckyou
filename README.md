# Mother Tongue

Look at the camera and talk. The AI guesses your mother tongue from your **voice** and answers in it.
Fool it and you score.

- **AI guesses right** → AI +1
- **AI guesses wrong** → you +1, AI −1
- First to 5 wins. Press `Y` / `N` to judge each round.

## How it works

| Step | What |
| --- | --- |
| Presence | MediaPipe face detector (in the browser). It only checks that someone is there, and listening starts automatically. It plays no part in the guess. |
| Capture | Mic recording that stops on its own when you stop talking |
| Guess | Groq `whisper-large-v3` → transcript + detected language |
| Reply | NVIDIA NIM (`meta/llama-3.3-70b-instruct`) replies in that language's script. Falls back to Groq if NIM fails. |
| Voice | Browser `speechSynthesis` in the detected language |

Stack: Vite · React 19 · TypeScript · Tailwind v4 · shadcn-style components (cva) · Motion · Vercel functions.

## Run

```bash
cp .env.example .env   # add GROQ_API_KEY and NVIDIA_API_KEY
npm i
npm run dev
```

`/api/*` runs inside the Vite dev server, so you don't need `vercel dev`. On Vercel, add the same two env vars to the project.

Chrome or Edge gives the best TTS coverage for Indian languages. If your OS has no voice for the detected language, the app shows a warning and the reply still appears as text.

## Ideas for fooling it

Hinglish or Tanglish code-switching, a heavy accent in English, a short burst of one language followed by another, dialects (Kongu Tamil, Dakhini).
