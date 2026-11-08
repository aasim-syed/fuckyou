import { useCallback, useEffect, useRef } from "react";

export type Capture = { blob: Blob; filename: string };

/**
 * Voice-activity-gated recorder on top of an existing mic stream.
 * capture() resolves when the player stops talking, or null if they never start.
 */
export function useVoiceCapture(stream: MediaStream | null) {
  const analyser = useRef<AnalyserNode | null>(null);
  const buf = useRef<Float32Array<ArrayBuffer> | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const a = ctx.createAnalyser();
    a.fftSize = 1024;
    src.connect(a);
    analyser.current = a;
    buf.current = new Float32Array(a.fftSize);
    return () => {
      analyser.current = null;
      ctx.close();
    };
  }, [stream]);

  /** 0..1 loudness, for meters. */
  const getLevel = useCallback(() => {
    const a = analyser.current;
    const b = buf.current;
    if (!a || !b) return 0;
    a.getFloatTimeDomainData(b);
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    return Math.sqrt(s / b.length);
  }, []);

  const capture = useCallback(
    (onSpeechStart?: () => void): Promise<Capture | null> =>
      new Promise((resolve) => {
        if (!stream) return resolve(null);
        const audio = new MediaStream(stream.getAudioTracks());
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
          MediaRecorder.isTypeSupported(m),
        );
        const rec = new MediaRecorder(audio, mime ? { mimeType: mime } : undefined);
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

        let noise = 0.01;
        let speaking = false;
        let loudFor = 0;
        let quietFor = 0;
        let discard = false;
        const t0 = performance.now();
        const TICK = 50;

        const finish = (keep: boolean) => {
          clearInterval(timer);
          abortRef.current = null;
          discard = !keep;
          if (rec.state !== "inactive") rec.stop();
        };
        rec.onstop = () => {
          if (discard || !chunks.length) return resolve(null);
          const type = rec.mimeType || "audio/webm";
          resolve({ blob: new Blob(chunks, { type }), filename: type.includes("mp4") ? "speech.mp4" : "speech.webm" });
        };

        const timer = setInterval(() => {
          const lvl = getLevel();
          const elapsed = performance.now() - t0;
          const thr = Math.max(0.018, noise * 3);
          if (!speaking) {
            noise = noise * 0.95 + lvl * 0.05; // track room noise until speech starts
            loudFor = lvl > thr ? loudFor + TICK : 0;
            if (loudFor >= 150) {
              speaking = true;
              onSpeechStart?.();
            }
            if (elapsed > 9000) finish(false); // nobody talked
          } else {
            quietFor = lvl < thr * 0.8 ? quietFor + TICK : 0;
            if (quietFor >= 1300 || elapsed > 15000) finish(true);
          }
        }, TICK);

        abortRef.current = () => finish(false);
        rec.start(250);
      }),
    [stream, getLevel],
  );

  const cancel = useCallback(() => abortRef.current?.(), []);

  return { capture, cancel, getLevel };
}
