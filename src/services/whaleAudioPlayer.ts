import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

let player: AudioPlayer | null = null;
let cancel: (() => void) | null = null;

/** One app-wide channel. A fresh native instance isolates late status events. */
export const whaleAudioPlayer = {
  async play(uri: string, signal: AbortSignal, onStarted: () => void): Promise<void> {
    this.stop();
    await setAudioModeAsync({ interruptionMode: "duckOthers", shouldPlayInBackground: false, allowsRecording: false });
    if (signal.aborted) return;
    const current = createAudioPlayer(uri, { updateInterval: 50, keepAudioSessionActive: false });
    player = current;
    try {
      await new Promise<void>((resolve, reject) => {
        let started = false;
        let settled = false;
        let subscription: { remove(): void } | undefined;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(loadTimer);
          clearTimeout(endTimer);
          subscription?.remove();
          signal.removeEventListener("abort", stop);
          if (cancel === stop) cancel = null;
          if (error) reject(error); else resolve();
        };
        const stop = () => finish();
        cancel = stop;
        const loadTimer = setTimeout(() => finish(new Error("音频加载超时")), 5000);
        const endTimer = setTimeout(() => finish(new Error("音频播放超时")), 120_000);
        signal.addEventListener("abort", stop, { once: true });
        subscription = current.addListener("playbackStatusUpdate", (status) => {
          if (signal.aborted) { finish(); return; }
          if (status.error) { finish(new Error("音频播放失败")); return; }
          if (status.playing && !started) { started = true; clearTimeout(loadTimer); onStarted(); }
          if (status.didJustFinish) finish();
        });
        if (signal.aborted) finish();
        else { try { current.play(); } catch { finish(new Error("无法播放音频")); } }
      });
    } finally {
      if (player === current) {
        player = null;
        try { current.pause(); } catch {}
        try { current.remove(); } catch {}
      }
    }
  },
  stop() {
    const old = player;
    player = null;
    cancel?.();
    cancel = null;
    if (old) {
      try { old.pause(); } catch {}
      try { old.remove(); } catch {}
    }
  },
  replace(uri: string, signal: AbortSignal, onStarted: () => void) { return this.play(uri, signal, onStarted); },
  dispose() { this.stop(); },
};
