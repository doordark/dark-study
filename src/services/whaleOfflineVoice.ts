import { TurboModuleRegistry } from "react-native";
import type { TtsEngine } from "react-native-sherpa-onnx/tts";
import type { Mood } from "./whaleVoiceText";
import { VOICE_SPEAKER_ID } from "./whaleVoiceProfile";

let engine: Promise<TtsEngine> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const speed: Record<Mood, number> = { normal: 0.96, happy: 1, excited: 1.04, sleepy: 0.88, comfort: 0.91 };

/** Expo Go lacks the SherpaOnnx / ReactNativeFs TurboModules; skip the native engine there. */
function nativeTtsAvailable(): boolean {
  try {
    return TurboModuleRegistry.get("SherpaOnnx") != null && TurboModuleRegistry.get("ReactNativeFs") != null;
  } catch {
    return false;
  }
}

function getEngine() {
  if (!engine) {
    if (!nativeTtsAvailable()) return Promise.reject(new Error("TTS native module unavailable"));
    // Promise.resolve().then() converts Metro's synchronous require throw into a rejection.
    const pending = Promise.resolve().then(() => import("react-native-sherpa-onnx/tts")).then(({ createTTS }) => createTTS({
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
  // Native synthesis must finish before its model is released.
  const done = queue.then(async () => { if (old) await (await old).destroy(); });
  queue = done.catch(() => {});
}

function cancelled() { return new Error("Voice cancelled"); }

/** PCM16 WAV, played through the same expo-audio channel as cached speech. */
function wav(samples: number[], sampleRate: number): Uint8Array {
  const count = samples.length;
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
  for (const sample of samples) {
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
    // The player needs a complete WAV per phrase. One-shot synthesis avoids
    // the native streaming callback's JNI method lookup in release builds.
    const { samples, sampleRate } = await tts.generateSpeech(text, { sid: VOICE_SPEAKER_ID, speed: speed[mood] });
    if (signal.aborted) throw cancelled();
    return wav(samples, sampleRate);
  });
  queue = work.catch(() => {});
  return work;
}
