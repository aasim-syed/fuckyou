import { useEffect, useRef, useState } from "react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

/**
 * Watches the video for a face. Used ONLY as a presence trigger ("it sees you → it starts listening")
 * and to draw the HUD brackets. Nothing about the face feeds the language guess.
 */
export function useFaceWatch(
  video: React.RefObject<HTMLVideoElement | null>,
  canvas: React.RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  accent: string,
) {
  const [present, setPresent] = useState(false);
  const [ready, setReady] = useState(false);
  const accentRef = useRef(accent);
  accentRef.current = accent;

  useEffect(() => {
    if (!enabled) return;
    let detector: FaceDetector | null = null;
    let raf = 0;
    let alive = true;
    let lastSeen = 0;
    let firstSeen = 0;
    let isPresent = false;
    let smooth: { x: number; y: number; w: number; h: number } | null = null;

    (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM);
      detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.6,
      });
      if (!alive) return detector.close();
      setReady(true);
      loop();
    })().catch((e) => console.error("face detector failed", e));

    function loop() {
      raf = requestAnimationFrame(loop);
      const v = video.current;
      const c = canvas.current;
      if (!detector || !v || !c || v.readyState < 2) return;
      const now = performance.now();
      const res = detector.detectForVideo(v, now);
      const det = res.detections[0]?.boundingBox;

      // presence with hysteresis so it doesn't flicker
      if (det) {
        if (!firstSeen) firstSeen = now;
        lastSeen = now;
        if (!isPresent && now - firstSeen > 450) {
          isPresent = true;
          setPresent(true);
        }
      } else {
        firstSeen = 0;
        if (isPresent && now - lastSeen > 1400) {
          isPresent = false;
          setPresent(false);
        }
      }

      // draw HUD brackets (canvas is mirrored via CSS together with the video)
      const dpr = window.devicePixelRatio || 1;
      const W = c.clientWidth * dpr;
      const H = c.clientHeight * dpr;
      if (c.width !== W || c.height !== H) Object.assign(c, { width: W, height: H });
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      if (!det) {
        smooth = null;
        return;
      }

      // map video pixels → canvas with object-cover
      const scale = Math.max(W / v.videoWidth, H / v.videoHeight);
      const ox = (W - v.videoWidth * scale) / 2;
      const oy = (H - v.videoHeight * scale) / 2;
      const target = {
        x: det.originX * scale + ox,
        y: det.originY * scale + oy - det.height * scale * 0.25,
        w: det.width * scale,
        h: det.height * scale * 1.3,
      };
      smooth = smooth
        ? {
            x: smooth.x + (target.x - smooth.x) * 0.3,
            y: smooth.y + (target.y - smooth.y) * 0.3,
            w: smooth.w + (target.w - smooth.w) * 0.3,
            h: smooth.h + (target.h - smooth.h) * 0.3,
          }
        : target;

      const { x, y, w, h } = smooth;
      const L = Math.min(w, h) * 0.22;
      ctx.strokeStyle = accentRef.current;
      ctx.lineWidth = 3 * dpr;
      ctx.shadowColor = accentRef.current;
      ctx.shadowBlur = 18 * dpr;
      ctx.beginPath();
      for (const [cx, cy, dx, dy] of [
        [x, y, 1, 1],
        [x + w, y, -1, 1],
        [x, y + h, 1, -1],
        [x + w, y + h, -1, -1],
      ]) {
        ctx.moveTo(cx + dx * L, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + dy * L);
      }
      ctx.stroke();
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      detector?.close();
    };
  }, [enabled, video, canvas]);

  return { present, ready };
}
