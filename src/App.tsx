import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Mic, RotateCcw, ScanFace, Sparkles, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Kbd } from "@/components/ui/card";
import { useFaceWatch } from "@/hooks/useFaceWatch";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { resolveLang, type Lang } from "@/lib/languages";
import { hasVoice, speak, stopSpeaking } from "@/lib/speak";
import { cn } from "@/lib/utils";

type Phase = "intro" | "waiting" | "listening" | "hearing" | "thinking" | "speaking" | "judging" | "over";
type Round = { heard: string; lang: Lang; reply: string; english: string; provider?: string; noVoice?: boolean };
type Result = { lang: Lang; aiRight: boolean };

const TARGET = 5;

const ACCENT: Record<Phase, string> = {
  intro: "#f4f1ea",
  waiting: "rgba(244,241,234,0.55)",
  listening: "#9b7bff",
  hearing: "#c6ff3d",
  thinking: "#9b7bff",
  speaking: "#c6ff3d",
  judging: "#c6ff3d",
  over: "#ff6b4a",
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [round, setRound] = useState<Round | null>(null);
  const [score, setScore] = useState({ you: 0, ai: 0 });
  const [history, setHistory] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const { present, ready } = useFaceWatch(videoRef, canvasRef, !!stream, ACCENT[phase]);
  const { capture, cancel, getLevel } = useVoiceCapture(stream);

  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setStream(s);
      setPhase("waiting");
      speechSynthesis.getVoices(); // warm up voice list
    } catch {
      setError("Camera + mic access is needed to play.");
    }
  };

  useEffect(() => {
    if (stream && videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const fail = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
    setPhase("waiting");
  }, []);

  const runRound = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setRound(null);
      setPhase("listening");
      const cap = await capture(() => setPhase("hearing"));
      if (!cap) return setPhase("waiting");

      setPhase("thinking");
      const fd = new FormData();
      fd.append("audio", cap.blob, cap.filename);
      const t = await fetch("/api/transcribe", { method: "POST", body: fd }).then((r) => r.json());
      if (t.error) return fail(t.error);
      if (!t.text || t.text.length < 2) return setPhase("waiting");

      const lang = resolveLang(t.language);
      const r = await fetch("/api/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t.text, language: lang.english, bcp47: lang.bcp47 }),
      }).then((r) => r.json());
      if (r.error) return fail(r.error);

      const noVoice = !(await hasVoice(lang.bcp47));
      setRound({ heard: t.text, lang, reply: r.reply, english: r.english, provider: r.provider, noVoice });
      setPhase("speaking");
      await speak(r.reply, lang.bcp47);
      setPhase("judging");
    } catch (e) {
      fail((e as Error).message);
    } finally {
      busy.current = false;
    }
  }, [capture, fail]);

  // it sees you → it listens
  useEffect(() => {
    if (phase === "waiting" && present) {
      const id = setTimeout(runRound, 350);
      return () => clearTimeout(id);
    }
  }, [phase, present, runRound]);

  // you walked away mid-listen → drop it
  useEffect(() => {
    if (!present && (phase === "listening" || phase === "hearing")) cancel();
  }, [present, phase, cancel]);

  const judge = useCallback(
    (aiRight: boolean) => {
      if (!round) return;
      const next = aiRight ? { ...score, ai: score.ai + 1 } : { you: score.you + 1, ai: score.ai - 1 };
      setScore(next);
      setHistory((h) => [...h, { lang: round.lang, aiRight }]);
      stopSpeaking();
      setPhase(next.you >= TARGET || next.ai >= TARGET ? "over" : "waiting");
    },
    [round, score],
  );

  useEffect(() => {
    if (phase !== "judging") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "y") judge(true);
      if (e.key.toLowerCase() === "n") judge(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, judge]);

  const reset = () => {
    setScore({ you: 0, ai: 0 });
    setHistory([]);
    setRound(null);
    setPhase("waiting");
  };

  return (
    <div className="grain relative h-full w-full overflow-hidden">
      {/* camera */}
      <div className="absolute inset-0 -scale-x-100">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(7,7,10,0.85)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/60 to-transparent" />
      {(phase === "listening" || phase === "thinking") && (
        <div className="scanline pointer-events-none absolute inset-x-0 top-0 h-40" />
      )}

      <AnimatePresence mode="wait">
        {phase === "intro" ? (
          <Intro key="intro" onStart={start} error={error} />
        ) : (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0">
            <TopBar score={score} round={history.length + 1} />
            <History items={history} />
            <div className="absolute inset-x-0 bottom-0 flex justify-center p-5 pb-8">
              <Stage
                phase={phase}
                round={round}
                present={present}
                detectorReady={ready}
                getLevel={getLevel}
                onJudge={judge}
                score={score}
                onReset={reset}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && phase !== "intro" && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute left-1/2 top-24 z-40 max-w-md -translate-x-1/2 rounded-2xl border border-coral/40 bg-black/80 px-4 py-3 font-mono text-xs text-coral backdrop-blur-xl"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Intro({ onStart, error }: { onStart: () => void; error: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: "blur(12px)" }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#1a1430_0%,#07070a_60%)] px-6 text-center"
    >
      <Badge className="mb-8">
        <Sparkles /> a game against an AI
      </Badge>
      <h1 className="font-serif text-[clamp(3.5rem,13vw,10rem)] leading-[0.85] tracking-tight">
        Mother
        <br />
        <span className="italic text-lime">Tongue</span>
      </h1>
      <p className="mt-8 max-w-md text-balance text-lg text-muted">
        Look at the camera and talk. The AI guesses your mother tongue from your voice and answers in it.
      </p>

      <div className="mt-10 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
        {[
          ["01", "It sees you", "Look at the camera and it starts listening on its own."],
          ["02", "You talk", "Any language. Code-switch, use slang, do your best accent."],
          ["03", "Score it", `AI guesses right: AI +1. Guesses wrong: you +1, AI −1. First to ${TARGET} wins.`],
        ].map(([n, t, d]) => (
          <div key={n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="font-mono text-xs text-lime">{n}</div>
            <div className="mt-1 font-medium">{t}</div>
            <div className="mt-1 text-sm text-muted">{d}</div>
          </div>
        ))}
      </div>

      <Button size="lg" className="mt-10" onClick={onStart}>
        <ScanFace /> Turn on the camera
      </Button>
      {error && <p className="mt-4 font-mono text-xs text-coral">{error}</p>}
      <p className="mt-6 font-mono text-[11px] text-muted/70">
        Face detection only checks whether you're there. The guess comes only from your voice.
      </p>
    </motion.div>
  );
}

function TopBar({ score, round }: { score: { you: number; ai: number }; round: number }) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5">
      <div>
        <div className="font-serif text-3xl leading-none">
          Mother <span className="italic text-lime">Tongue</span>
        </div>
        <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">round {round}</div>
      </div>
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/50 p-1 backdrop-blur-xl">
        <ScorePill label="you" value={score.you} tone="lime" />
        <ScorePill label="ai" value={score.ai} tone="coral" />
      </div>
    </div>
  );
}

function ScorePill({ label, value, tone }: { label: string; value: number; tone: "lime" | "coral" }) {
  return (
    <div className="flex items-baseline gap-2 rounded-full px-4 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</span>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: -14, opacity: 0, scale: 1.6 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 14, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          className={cn("font-serif text-3xl tabular-nums leading-none", tone === "lime" ? "text-lime" : "text-coral")}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function History({ items }: { items: Result[] }) {
  if (!items.length) return null;
  return (
    <div className="absolute left-5 top-24 z-10 flex max-w-[60vw] flex-wrap gap-1.5">
      {items.map((r, i) => (
        <motion.span
          key={i}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs backdrop-blur-xl",
            r.aiRight ? "border-coral/40 bg-coral/10 text-coral" : "border-lime/40 bg-lime/10 text-lime",
          )}
        >
          {r.lang.native} {r.aiRight ? "✓" : "✗"}
        </motion.span>
      ))}
    </div>
  );
}

function LevelBars({ getLevel }: { getLevel: () => number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const bars = Array.from(ref.current?.children ?? []) as HTMLElement[];
    const tick = () => {
      const l = Math.min(1, getLevel() * 9);
      bars.forEach((b, i) => {
        const wobble = 0.55 + 0.45 * Math.sin(performance.now() / 120 + i * 1.3);
        b.style.transform = `scaleY(${0.12 + l * wobble})`;
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);
  return (
    <div ref={ref} className="flex h-10 items-center gap-1">
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="h-full w-1.5 origin-center rounded-full bg-lime transition-transform duration-75" />
      ))}
    </div>
  );
}

function Stage(props: {
  phase: Phase;
  round: Round | null;
  present: boolean;
  detectorReady: boolean;
  getLevel: () => number;
  onJudge: (aiRight: boolean) => void;
  score: { you: number; ai: number };
  onReset: () => void;
}) {
  const { phase, round, present, detectorReady, getLevel, onJudge, score, onReset } = props;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase === "speaking" || phase === "judging" ? "answer" : phase}
        initial={{ y: 24, opacity: 0, filter: "blur(8px)" }}
        animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
        exit={{ y: -12, opacity: 0, filter: "blur(8px)" }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-2xl"
      >
        {phase === "waiting" && (
          <Card className="flex items-center gap-4">
            <ScanFace className="size-6 shrink-0 text-muted" />
            <div>
              <div className="font-medium">
                {!detectorReady ? "Loading face tracking…" : present ? "There you are." : "I can't see you."}
              </div>
              <div className="text-sm text-muted">
                {present ? "Getting ready to listen…" : "Look at the camera and I'll start listening."}
              </div>
            </div>
          </Card>
        )}

        {(phase === "listening" || phase === "hearing") && (
          <Card className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative grid size-12 place-items-center rounded-full bg-violet/20">
                <span className="absolute inset-0 animate-ping rounded-full bg-violet/30" />
                <Mic className="size-5 text-violet" />
              </div>
              <div>
                <div className="font-medium">{phase === "hearing" ? "Listening…" : "Say something."}</div>
                <div className="text-sm text-muted">
                  {phase === "hearing" ? "Stop talking when you're done." : "Any language. Try to fool me."}
                </div>
              </div>
            </div>
            <LevelBars getLevel={getLevel} />
          </Card>
        )}

        {phase === "thinking" && (
          <Card className="flex items-center gap-4">
            <div className="size-5 animate-spin rounded-full border-2 border-violet border-t-transparent" />
            <div className="font-mono text-sm text-muted">working out your mother tongue…</div>
          </Card>
        )}

        {(phase === "speaking" || phase === "judging") && round && (
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-lime/40 text-lime">guess · {round.lang.english}</Badge>
              {phase === "speaking" && (
                <Badge>
                  <Volume2 /> speaking
                </Badge>
              )}
              {round.noVoice && <Badge className="text-coral">no {round.lang.english} voice installed</Badge>}
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted">you said</div>
              <div className="mt-1 text-muted">“{round.heard}”</div>
            </div>
            <div dir="auto" className="font-serif text-[clamp(1.6rem,4vw,2.6rem)] leading-tight">
              {round.reply}
            </div>
            {round.english && round.lang.key !== "english" && (
              <div className="text-sm italic text-muted">{round.english}</div>
            )}
            <div className="flex items-center gap-3 pt-1">
              <Button variant="lose" size="lg" className="flex-1" onClick={() => onJudge(true)}>
                <Check /> Got me <Kbd>Y</Kbd>
              </Button>
              <Button variant="win" size="lg" className="flex-1" onClick={() => onJudge(false)}>
                <X /> Wrong, I win <Kbd>N</Kbd>
              </Button>
            </div>
          </Card>
        )}

        {phase === "over" && (
          <Card className="space-y-4 text-center">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted">game over</div>
            <div className="font-serif text-6xl leading-none">
              {score.you >= TARGET ? (
                <>
                  You <span className="italic text-lime">win.</span>
                </>
              ) : (
                <>
                  AI <span className="italic text-coral">wins.</span>
                </>
              )}
            </div>
            <div className="text-muted">
              {score.you} – {score.ai}
            </div>
            <Button size="lg" onClick={onReset}>
              <RotateCcw /> Play again
            </Button>
          </Card>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
