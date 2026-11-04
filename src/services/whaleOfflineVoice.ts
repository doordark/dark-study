import type { StreamingTtsEngine } from "react-native-sherpa-onnx/tts";
import type { Mood } from "./whaleVoiceText";
import { VOICE_SPEAKER_ID } from "./whaleVoiceProfile";

let engine: Promise<StreamingTtsEngine> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const speed: Record<Mood, number> = { normal: 0.96, happy: 1, excited: 1.04, sleepy: 0.88, comfort: 0.91 };

function getEngine() {
  if (!engine) {
    const pending = import("react-native-sherpa-onnx/tts").then(({ createStreamingTTS }) => createStreamingTTS({
      modelPath: { type: "asset", path: "models/whale-kokoro-v2" },
      modelType: "kokoro", numThreads: 2, provider: "cpu", debug: false,
      maxNumSentences: 1, silenceScale: 0.2,
    }));
    engine = pending;
    void pending.catch(() => { if (engine === pending) engine = null; });
  }
  return engine;
}

export function warmWhaleVoice() { void getEngine().catch(() => {}); }

export function disposeOfflineVoice() {
  const old = engine;
  engine = null;
  // Native synthesis must finish cancellation before its model is released.
  const done = queue.then(async () => { if (old) await (await old).destroy(); });
  queue = done.catch(() => {});
}

function cancelled() { return new Error("Voice cancelled"); }

/** PCM16 WAV, played through the same expo-audio channel as cached speech. */
function wav(chunks: number[][], sampleRate: number): Uint8Array {
  const count = chunks.reduce((sum, part) => sum + part.length, 0);
  if (!count || !sampleRate) throw new Error("Empty offline speech");
  const bytes = new Uint8Array(44 + count * 2);
  const view = new DataView(bytes.buffer);
  const label = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  label(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); label(8, "WAVE");
  label(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  label(36, "data"); view.setUint32(40, count * 2, true);
  let offset = 44;
  for (const part of chunks) for (const sample of part) {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    offset += 2;
  }
  return bytes;
}

export function generateOfflineSpeech(text: string, mood: Mood, signal: AbortSignal): Promise<Uint8Array> {
  const work = queue.then(async () => {
    if (signal.aborted) throw cancelled();
    const tts = await getEngine();
    if (signal.aborted) throw cancelled();
    return new Promise<Uint8Array>((resolve, reject) => {
      const chunks: number[][] = [];
      let sampleRate = 0;
      let started = false;
      const abort = () => {
        // Do not unsubscribe: onEnd is the fence before the next native request.
        if (started) void tts.cancelSpeechStream().catch(() => {});
      };
      signal.addEventListener("abort", abort, { once: true });
      void tts.generateSpeechStream(text, { sid: VOICE_SPEAKER_ID, speed: speed[mood] }, {
        onChunk: (chunk) => {
          if (!signal.aborted) { chunks.push(chunk.samples); sampleRate = chunk.sampleRate; }
        },
        onError: (error) => {
          signal.removeEventListener("abort", abort);
          reject(new Error(error.message));
        },
        onEnd: (event) => {
          signal.removeEventListener("abort", abort);
          if (signal.aborted || event.cancelled) reject(cancelled());
          else { try { resolve(wav(chunks, sampleRate)); } catch (error) { reject(error); } }
        },
      }).then(() => { started = true; if (signal.aborted) abort(); }).catch((error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      });
    });
  });
  queue = work.catch(() => {});
  return work;
}
