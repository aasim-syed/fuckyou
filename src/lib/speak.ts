// Browser TTS. Voice availability depends on the OS (Chrome/Edge ship many Indian-language voices).

function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const v = speechSynthesis.getVoices();
  if (v.length) return Promise.resolve(v);
  return new Promise((res) => {
    const done = () => res(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1200);
  });
}

export async function hasVoice(bcp47: string) {
  const base = bcp47.split("-")[0].toLowerCase();
  return (await voicesReady()).some((v) => v.lang.toLowerCase().startsWith(base));
}

export async function speak(text: string, bcp47: string): Promise<void> {
  const voices = await voicesReady();
  const base = bcp47.split("-")[0].toLowerCase();
  const exact = voices.find((v) => v.lang.toLowerCase() === bcp47.toLowerCase());
  const loose = voices.find((v) => v.lang.toLowerCase().startsWith(base));
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47;
    const voice = exact ?? loose;
    if (voice) u.voice = voice;
    u.rate = 1.02;
    u.pitch = 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
    // safety net — some browsers never fire onend
    setTimeout(resolve, Math.max(4000, text.length * 120));
  });
}

export function stopSpeaking() {
  speechSynthesis.cancel();
}
