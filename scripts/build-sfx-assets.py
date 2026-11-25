#!/usr/bin/env python3
"""
Synthesize warm, cozy game-style sound effects for Dark Study's Farm,
hidden easter eggs (NightSky, AfterHours, Zero-G), and DaFeiYu (Whale) interactions.

Zero third-party Python deps required; uses local ffmpeg to encode compact mono MP3s
so the entire 35-clip SFX pack stays well under 0.7 MB.
"""

from __future__ import annotations

import array
import math
import os
import random
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

SR = 24000
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "sfx"


def clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return lo if v < lo else hi if v > hi else v


def make_buf(duration_sec: float) -> list[float]:
    return [0.0] * max(1, int(round(duration_sec * SR)))


def mix_at(dst: list[float], src: list[float], start_sec: float, gain: float = 1.0) -> None:
    offset = int(round(start_sec * SR))
    if offset >= len(dst):
        return
    start_i = max(0, -offset)
    end_i = min(len(src), len(dst) - offset)
    for i in range(start_i, end_i):
        dst[offset + i] += src[i] * gain


def one_pole_lp(samples: list[float], cutoff_hz: float) -> list[float]:
    if cutoff_hz <= 0:
        return samples
    rc = 1.0 / (2.0 * math.pi * cutoff_hz)
    dt = 1.0 / SR
    alpha = dt / (rc + dt)
    out = [0.0] * len(samples)
    y = 0.0
    for i, x in enumerate(samples):
        y += alpha * (x - y)
        out[i] = y
    return out


def one_pole_hp(samples: list[float], cutoff_hz: float) -> list[float]:
    if cutoff_hz <= 0:
        return samples
    rc = 1.0 / (2.0 * math.pi * cutoff_hz)
    dt = 1.0 / SR
    alpha = rc / (rc + dt)
    out = [0.0] * len(samples)
    prev_x = 0.0
    y = 0.0
    for i, x in enumerate(samples):
        y = alpha * (y + x - prev_x)
        prev_x = x
        out[i] = y
    return out


def soft_reverb(samples: list[float], wet: float = 0.22, tail_sec: float = 0.28) -> list[float]:
    """Gentle damped multi-tap room shimmer for magical chimes & harp notes."""
    extra = int(tail_sec * SR)
    out = list(samples) + [0.0] * extra
    taps = [(0.029, 0.55), (0.053, 0.38), (0.089, 0.26), (0.137, 0.16)]
    damped = one_pole_lp(samples, 3200.0)
    for delay_s, decay in taps:
        d = int(delay_s * SR)
        g = wet * decay
        for i in range(len(damped)):
            idx = i + d
            if idx < len(out):
                out[idx] += damped[i] * g
    return out


def fade_edges(samples: list[float], fade_in_ms: float = 4.0, fade_out_ms: float = 18.0) -> list[float]:
    n = len(samples)
    fi = min(n, max(1, int(SR * fade_in_ms / 1000.0)))
    fo = min(n, max(1, int(SR * fade_out_ms / 1000.0)))
    out = list(samples)
    for i in range(fi):
        out[i] *= i / fi
    for i in range(fo):
        idx = n - 1 - i
        if idx >= 0:
            out[idx] *= i / fo
    return out


def normalize(samples: list[float], target_peak: float = 0.78) -> list[float]:
    peak = max((abs(x) for x in samples), default=0.0)
    if peak < 1e-6:
        return samples
    scale = target_peak / peak
    # Soft tanh limiter to prevent harsh peaks while keeping warmth.
    return [math.tanh(x * scale * 1.06) / math.tanh(1.06) for x in samples]


# ---------------------------------------------------------------------------
# Musical & organic sound primitives
# ---------------------------------------------------------------------------

def karplus_harp(freq: float, dur: float, brightness: float = 0.45, seed: int = 1) -> list[float]:
    """Warm plucked string (harp / acoustic chime)."""
    rng = random.Random(seed)
    n = max(1, int(dur * SR))
    period = max(2, int(round(SR / max(40.0, freq))))
    ring = [rng.uniform(-1.0, 1.0) for _ in range(period)]
    # Smooth initial excitation so the pluck is nylon-soft, not metallic.
    for _ in range(2):
        ring = [(ring[i - 1] + 2.0 * ring[i] + ring[(i + 1) % period]) * 0.25 for i in range(period)]
    out = [0.0] * n
    decay = 0.994 - (0.004 * (1.0 - brightness))
    idx = 0
    for i in range(n):
        nxt = (idx + 1) % period
        val = ring[idx]
        out[i] = val
        ring[idx] = (val * (0.5 + brightness * 0.2) + ring[nxt] * (0.5 - brightness * 0.2)) * decay
        idx = nxt
    return fade_edges(out, 2.5, 40.0)


def marimba_note(freq: float, dur: float, bright: float = 0.32) -> list[float]:
    """Cozy wooden marimba / kalimba note."""
    n = max(1, int(dur * SR))
    out = [0.0] * n
    for i in range(n):
        t = i / SR
        env1 = math.exp(-t * 9.5) * (1.0 - math.exp(-t * 380.0))
        env2 = math.exp(-t * 28.0) * (1.0 - math.exp(-t * 600.0))
        click = math.exp(-t * 140.0) * math.sin(2.0 * math.pi * freq * 6.2 * t)
        s = (
            math.sin(2.0 * math.pi * freq * t) * env1
            + bright * 0.42 * math.sin(2.0 * math.pi * freq * 3.98 * t) * env2
            + 0.14 * click
        )
        out[i] = s
    return fade_edges(out, 1.5, 22.0)


def music_box_note(freq: float, dur: float) -> list[float]:
    """Delicate dreamy music-box tine with gentle shimmer."""
    n = max(1, int(dur * SR))
    out = [0.0] * n
    for i in range(n):
        t = i / SR
        atk = 1.0 - math.exp(-t * 420.0)
        e1 = math.exp(-t * 4.2) * atk
        e2 = math.exp(-t * 11.0) * atk
        e3 = math.exp(-t * 24.0) * atk
        s = (
            0.78 * math.sin(2.0 * math.pi * freq * t) * e1
            + 0.18 * math.sin(2.0 * math.pi * (freq * 1.003) * t) * e1
            + 0.24 * math.sin(2.0 * math.pi * (freq * 2.0) * t) * e2
            + 0.12 * math.sin(2.0 * math.pi * (freq * 2.99) * t) * e3
        )
        out[i] = s
    return fade_edges(out, 2.0, 45.0)


def glass_chime(freq: float, dur: float, sparkle: float = 0.26) -> list[float]:
    """Crystalline liquid-glass bell ping with airy water-droplet overtones."""
    n = max(1, int(dur * SR))
    out = [0.0] * n
    for i in range(n):
        t = i / SR
        atk = 1.0 - math.exp(-t * 520.0)
        e1 = math.exp(-t * 5.8) * atk
        e2 = math.exp(-t * 14.5) * atk
        e3 = math.exp(-t * 28.0) * atk
        s = (
            0.74 * math.sin(2.0 * math.pi * freq * t) * e1
            + 0.16 * math.sin(2.0 * math.pi * (freq * 1.0025) * t) * e1
            + sparkle * math.sin(2.0 * math.pi * (freq * 2.0) * t) * e2
            + (sparkle * 0.45) * math.sin(2.0 * math.pi * (freq * 2.756) * t) * e3
        )
        out[i] = s
    return fade_edges(out, 1.5, 30.0)


def bubble_pop(f_start: float, f_end: float, dur: float) -> list[float]:
    """Crisp upward water-bubble pop."""
    n = max(1, int(dur * SR))
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        u = i / max(1, n - 1)
        freq = f_start * ((f_end / max(20.0, f_start)) ** (u ** 1.35))
        phase += 2.0 * math.pi * freq / SR
        env = math.sin(math.pi * u) ** 0.75 * math.exp(-u * 1.4)
        out[i] = (math.sin(phase) + 0.22 * math.sin(phase * 2.0)) * env
    return fade_edges(out, 1.5, 8.0)


def filtered_noise(dur: float, lp_hz: float, hp_hz: float = 0.0, seed: int = 42, decay: float = 8.0, attack: float = 120.0) -> list[float]:
    rng = random.Random(seed)
    n = max(1, int(dur * SR))
    raw = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    if hp_hz > 0:
        raw = one_pole_hp(raw, hp_hz)
    raw = one_pole_lp(raw, lp_hz)
    out = [0.0] * n
    for i in range(n):
        t = i / SR
        env = (1.0 - math.exp(-t * attack)) * math.exp(-t * decay)
        out[i] = raw[i] * env
    return fade_edges(out, 2.0, 12.0)


def pitch_sweep_tone(f0: float, f1: float, dur: float, harm2: float = 0.18, decay: float = 7.0) -> list[float]:
    n = max(1, int(dur * SR))
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SR
        u = i / max(1, n - 1)
        freq = f0 + (f1 - f0) * (1.0 - math.exp(-u * 4.5))
        phase += 2.0 * math.pi * freq / SR
        env = (1.0 - math.exp(-t * 280.0)) * math.exp(-t * decay)
        out[i] = (math.sin(phase) + harm2 * math.sin(phase * 2.0)) * env
    return fade_edges(out, 2.0, 15.0)


def cute_syllable(f0: float, f1: float, dur: float, vibrato: float = 0.0, breath: float = 0.06, seed: int = 7) -> list[float]:
    """Soft anime-mascot / Animal-Crossing-like vowel chirp with warm rounded formants."""
    n = max(1, int(dur * SR))
    out = [0.0] * n
    phase = 0.0
    rng = random.Random(seed)
    for i in range(n):
        t = i / SR
        u = i / max(1, n - 1)
        # Smooth S-curve pitch glide for lively cute inflection
        s_curve = u * u * (3.0 - 2.0 * u)
        vib = 1.0 + vibrato * math.sin(2.0 * math.pi * 6.5 * t) * min(1.0, u * 2.5)
        freq = (f0 + (f1 - f0) * s_curve) * vib
        phase += 2.0 * math.pi * freq / SR
        env = (math.sin(math.pi * (u ** 0.72)) ** 0.85) * (1.0 - 0.25 * u)
        # Rounded female-voice-like harmonic stack (warm fundamental + gentle 2nd/3rd/4th)
        tone = (
            0.66 * math.sin(phase)
            + 0.26 * math.sin(phase * 2.0 + 0.3)
            + 0.11 * math.sin(phase * 3.0)
            + 0.04 * math.sin(phase * 4.0)
        )
        air = rng.uniform(-1.0, 1.0) * breath * env
        out[i] = tone * env + air
    return fade_edges(one_pole_lp(out, 3600.0), 4.0, 18.0)


# ---------------------------------------------------------------------------
# All 35 Dark Study SFX recipes
# ---------------------------------------------------------------------------

def build_all_sfx() -> dict[str, list[float]]:
    clips: dict[str, list[float]] = {}

    # 1. Farm: plant seed (soft soil pat + tiny sprout pop)
    b = make_buf(0.30)
    mix_at(b, pitch_sweep_tone(175, 72, 0.11, harm2=0.1, decay=18.0), 0.0, 0.72)
    mix_at(b, filtered_noise(0.14, 1400, 260, seed=11, decay=18.0, attack=240.0), 0.0, 0.55)
    mix_at(b, bubble_pop(360, 620, 0.08), 0.09, 0.38)
    clips["farm_plant"] = normalize(b, 0.72)

    # 2. Farm: water crops (gentle watering-can splash + sparkles)
    b = make_buf(0.56)
    mix_at(b, filtered_noise(0.42, 2600, 420, seed=21, decay=5.5, attack=45.0), 0.0, 0.42)
    for t_off, f0, f1 in [(0.04, 420, 920), (0.11, 560, 1180), (0.19, 480, 1020), (0.28, 620, 1340), (0.35, 520, 980)]:
        mix_at(b, bubble_pop(f0, f1, 0.075), t_off, 0.34)
    clips["farm_water"] = normalize(b, 0.70)

    # 3. Farm: refill watering can at pond (deeper rising gulps)
    b = make_buf(0.58)
    mix_at(b, filtered_noise(0.35, 1600, 250, seed=31, decay=6.5, attack=35.0), 0.0, 0.32)
    for idx, (f0, f1) in enumerate([(260, 520), (310, 620), (380, 760), (470, 950)]):
        mix_at(b, bubble_pop(f0, f1, 0.095), 0.03 + idx * 0.105, 0.52)
    clips["farm_refill"] = normalize(b, 0.74)

    # 4. Farm: fertilize (soft sandy sprinkle + warm upward sparkle)
    b = make_buf(0.52)
    mix_at(b, filtered_noise(0.26, 3800, 1200, seed=41, decay=9.0, attack=90.0), 0.0, 0.28)
    for idx, f in enumerate([659.25, 783.99, 987.77, 1318.51]):
        mix_at(b, music_box_note(f, 0.24), 0.04 + idx * 0.055, 0.42)
    clips["farm_fertilize"] = normalize(soft_reverb(b, 0.18, 0.16), 0.70)

    # 5. Farm: harvest crop (juicy pluck + crisp happy pop-chime)
    b = make_buf(0.42)
    mix_at(b, bubble_pop(320, 840, 0.085), 0.0, 0.65)
    mix_at(b, marimba_note(587.33, 0.20), 0.05, 0.58)
    mix_at(b, marimba_note(880.0, 0.28), 0.11, 0.68)
    clips["farm_harvest"] = normalize(soft_reverb(b, 0.15, 0.12), 0.76)

    # 6. Farm: coins / buy / sell (bright two-tone coin clink)
    b = make_buf(0.46)
    mix_at(b, music_box_note(1318.51, 0.24), 0.0, 0.65)
    mix_at(b, music_box_note(1760.0, 0.34), 0.075, 0.75)
    clips["farm_coin"] = normalize(soft_reverb(b, 0.18, 0.14), 0.74)

    # 7. Farm: cook / fish soup (warm simmer bubbles + cozy ready bell)
    b = make_buf(0.68)
    for t_off, f0, f1 in [(0.02, 240, 480), (0.12, 280, 560), (0.21, 310, 620)]:
        mix_at(b, bubble_pop(f0, f1, 0.085), t_off, 0.44)
    mix_at(b, marimba_note(523.25, 0.26), 0.30, 0.50)
    mix_at(b, music_box_note(1046.5, 0.34), 0.34, 0.62)
    clips["farm_cook"] = normalize(soft_reverb(b, 0.20, 0.16), 0.74)

    # 8. Farm: gift / affection up (warm harp triad)
    b = make_buf(0.72)
    for idx, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        mix_at(b, karplus_harp(f, 0.48, brightness=0.45, seed=80 + idx), idx * 0.075, 0.55)
    clips["farm_gift"] = normalize(soft_reverb(b, 0.24, 0.20), 0.74)

    # 9. Farm: level up / quest reward (sunny major fanfare arpeggio)
    b = make_buf(0.95)
    notes = [(0.0, 523.25), (0.09, 659.25), (0.18, 783.99), (0.28, 1046.5), (0.39, 1318.51)]
    for idx, (t_off, f) in enumerate(notes):
        mix_at(b, marimba_note(f, 0.36), t_off, 0.55)
        mix_at(b, music_box_note(f, 0.48), t_off + 0.01, 0.42)
    clips["farm_level_up"] = normalize(soft_reverb(b, 0.26, 0.24), 0.78)

    # 10. Farm: house door (soft warm wooden creak + gentle latch)
    b = make_buf(0.36)
    mix_at(b, pitch_sweep_tone(185, 118, 0.14, harm2=0.25, decay=14.0), 0.0, 0.65)
    mix_at(b, filtered_noise(0.10, 900, 140, seed=101, decay=18.0), 0.02, 0.35)
    mix_at(b, marimba_note(310.0, 0.12, bright=0.18), 0.14, 0.48)
    clips["farm_door"] = normalize(b, 0.70)

    # 11. Farm: sleep / nap / tuck in (lullaby music box descending cradle)
    b = make_buf(1.05)
    lullaby = [(0.0, 659.25), (0.20, 587.33), (0.40, 523.25), (0.62, 392.0)]
    for t_off, f in lullaby:
        mix_at(b, music_box_note(f, 0.52), t_off, 0.55)
    clips["farm_sleep"] = normalize(soft_reverb(b, 0.30, 0.32), 0.66)

    # 12. Farm: chicken / KunKun cluck (adorable double pixel cluck)
    b = make_buf(0.42)
    mix_at(b, cute_syllable(520, 740, 0.095, breath=0.04, seed=121), 0.0, 0.75)
    mix_at(b, cute_syllable(480, 640, 0.12, breath=0.05, seed=122), 0.13, 0.70)
    mix_at(b, bubble_pop(420, 680, 0.06), 0.27, 0.32)
    clips["farm_chicken"] = normalize(b, 0.72)

    # 13. Farm: campfire festival (warm guitar/harp chord + cozy sparkle)
    b = make_buf(1.10)
    for idx, f in enumerate([261.63, 329.63, 392.0, 493.88, 659.25, 783.99]):
        mix_at(b, karplus_harp(f, 0.72, brightness=0.52, seed=130 + idx), idx * 0.06, 0.48)
    mix_at(b, filtered_noise(0.55, 2200, 600, seed=139, decay=4.5, attack=25.0), 0.05, 0.14)
    clips["farm_festival"] = normalize(soft_reverb(b, 0.26, 0.26), 0.74)

    # 14. Farm: random event / visitor / focus bell (serene windchime)
    b = make_buf(0.84)
    for idx, (t_off, f) in enumerate([(0.0, 880.0), (0.11, 1174.66), (0.23, 1318.51), (0.36, 1760.0)]):
        mix_at(b, music_box_note(f, 0.45), t_off, 0.48)
    clips["farm_event"] = normalize(soft_reverb(b, 0.30, 0.26), 0.70)

    # 15. Fishing: cast line (airy whoosh + plop splash)
    b = make_buf(0.56)
    mix_at(b, filtered_noise(0.22, 2400, 600, seed=151, decay=10.0, attack=55.0), 0.0, 0.35)
    mix_at(b, pitch_sweep_tone(540, 210, 0.14, harm2=0.1, decay=14.0), 0.02, 0.28)
    mix_at(b, bubble_pop(220, 560, 0.11), 0.21, 0.72)
    mix_at(b, filtered_noise(0.22, 1800, 350, seed=152, decay=9.0, attack=180.0), 0.22, 0.42)
    mix_at(b, bubble_pop(460, 920, 0.07), 0.28, 0.36)
    clips["fish_cast"] = normalize(b, 0.74)

    # 16. Fishing: fish bite alert (urgent playful double bobber plop + ping)
    b = make_buf(0.46)
    mix_at(b, bubble_pop(340, 780, 0.08), 0.0, 0.75)
    mix_at(b, marimba_note(880.0, 0.14), 0.03, 0.55)
    mix_at(b, bubble_pop(390, 920, 0.08), 0.16, 0.80)
    mix_at(b, marimba_note(1046.5, 0.18), 0.19, 0.65)
    clips["fish_bite"] = normalize(b, 0.78)

    # 17. Fishing: catch success (splash + joyful leap chime)
    b = make_buf(0.76)
    mix_at(b, filtered_noise(0.26, 2800, 450, seed=171, decay=8.0, attack=160.0), 0.0, 0.38)
    mix_at(b, bubble_pop(340, 960, 0.09), 0.02, 0.55)
    for idx, f in enumerate([587.33, 739.99, 880.0, 1174.66]):
        mix_at(b, marimba_note(f, 0.30), 0.10 + idx * 0.08, 0.58)
        mix_at(b, music_box_note(f * 2.0, 0.32), 0.12 + idx * 0.08, 0.25)
    clips["fish_catch"] = normalize(soft_reverb(b, 0.22, 0.20), 0.76)

    # 18. Fishing: missed bite (soft comical descending slide)
    b = make_buf(0.46)
    mix_at(b, pitch_sweep_tone(440, 260, 0.24, harm2=0.14, decay=7.5), 0.0, 0.62)
    mix_at(b, marimba_note(261.63, 0.22, bright=0.15), 0.16, 0.45)
    clips["fish_miss"] = normalize(b, 0.66)

    # 19. Bug game: catch bug (snappy cheerful pop, scaled in-app with playbackRate!)
    b = make_buf(0.24)
    mix_at(b, bubble_pop(460, 1180, 0.075), 0.0, 0.76)
    mix_at(b, marimba_note(783.99, 0.14), 0.02, 0.58)
    clips["bug_catch"] = normalize(b, 0.75)

    # 20. Farm Night Horror: 恐怖徐睡阴降临 (spooky moody low drone + eerie blue keyboard ticks)
    b = make_buf(1.25)
    n = len(b)
    for i in range(n):
        t = i / SR
        env = (1.0 - math.exp(-t * 3.5)) * math.exp(-t * 1.4)
        # Moody minor-second & tritone ghostly chord (spooky-fun, not ear-piercing)
        drone = (
            0.48 * math.sin(2.0 * math.pi * 110.0 * t)
            + 0.36 * math.sin(2.0 * math.pi * 116.54 * t + 0.4 * math.sin(3.2 * t))
            + 0.26 * math.sin(2.0 * math.pi * 155.56 * t)
            + 0.14 * math.sin(2.0 * math.pi * 233.08 * t)
        )
        b[i] += drone * env * 0.58
    # Faint frantic muffled gaming-keyboard clicks in the dark blanket
    for t_click in [0.18, 0.27, 0.34, 0.46, 0.52, 0.61, 0.74]:
        mix_at(b, filtered_noise(0.03, 2800, 900, seed=int(t_click * 1000), decay=65.0, attack=900.0), t_click, 0.28)
    clips["horror_appear"] = normalize(soft_reverb(b, 0.32, 0.30), 0.70)

    # 21. Farm Night Horror: banish 恐怖徐睡阴 (bright cleansing chimes + relief chord)
    b = make_buf(0.92)
    for idx, f in enumerate([523.25, 659.25, 783.99, 987.77, 1318.51]):
        mix_at(b, karplus_harp(f, 0.50, brightness=0.60, seed=210 + idx), idx * 0.065, 0.48)
        mix_at(b, music_box_note(f * 2.0, 0.38), idx * 0.065 + 0.02, 0.24)
    clips["horror_banish"] = normalize(soft_reverb(b, 0.28, 0.26), 0.74)

    # 22. NightSky / Secret Charge: star collect & secret charge tap (crystalline chime)
    b = make_buf(0.50)
    mix_at(b, music_box_note(880.0, 0.42), 0.0, 0.68)
    mix_at(b, karplus_harp(1318.51, 0.36, brightness=0.62, seed=221), 0.025, 0.34)
    clips["star_charge"] = normalize(soft_reverb(b, 0.28, 0.22), 0.72)

    # 22b. NightSky: 7-note C-major diatonic scale (C5..B5: Do Re Mi Fa Sol La Si)
    # Dedicated equal-temperament chimes so star taps ring out as a true musical scale
    # on every platform without playbackRate pitch distortion.
    star_scale_freqs = [
        523.25,  # C5 - Do
        587.33,  # D5 - Re
        659.25,  # E5 - Mi
        698.46,  # F5 - Fa
        783.99,  # G5 - Sol
        880.00,  # A5 - La
        987.77,  # B5 - Si
    ]
    for idx, freq in enumerate(star_scale_freqs):
        b = make_buf(0.68)
        mix_at(b, music_box_note(freq, 0.60), 0.0, 0.72)
        mix_at(b, karplus_harp(freq, 0.50, brightness=0.50, seed=2210 + idx), 0.006, 0.36)
        # Soft octave starlight shimmer preserves exact pitch perception across all 7 degrees.
        mix_at(b, music_box_note(freq * 2.0, 0.30), 0.014, 0.18)
        target_peak = 0.76 - idx * 0.011
        clips[f"star_note_{idx + 1}"] = normalize(soft_reverb(b, 0.28, 0.24), target_peak)

    # 23. NightSky: 7-star constellation reveal & achievement unlock (resolves B5 -> C6 Do' + Cmaj9 harp cascade)
    b = make_buf(1.52)
    # Immediate high Do' (C6) + warm C5 octave root resolves the 7th star's leading tone (B5).
    mix_at(b, music_box_note(1046.50, 0.92), 0.0, 0.66)
    mix_at(b, karplus_harp(523.25, 0.90, brightness=0.52, seed=2300), 0.0, 0.42)
    mix_at(b, karplus_harp(1046.50, 0.85, brightness=0.60, seed=2301), 0.012, 0.44)
    cascade = [659.25, 783.99, 987.77, 1046.50, 1174.66, 1318.51, 1567.98, 2093.00]
    for idx, f in enumerate(cascade):
        t_off = 0.08 + idx * 0.082
        mix_at(b, karplus_harp(f, 0.74, brightness=0.58, seed=2310 + idx), t_off, 0.40)
        mix_at(b, music_box_note(f, 0.64), t_off + 0.018, 0.30)
    clips["star_constellation"] = normalize(soft_reverb(b, 0.36, 0.36), 0.76)

    # 24. NightSky: cute owl hoot ("hoo~ hooo~")
    b = make_buf(0.86)
    mix_at(b, cute_syllable(520, 445, 0.18, vibrato=0.012, breath=0.08, seed=241), 0.02, 0.65)
    mix_at(b, cute_syllable(495, 405, 0.36, vibrato=0.016, breath=0.09, seed=242), 0.28, 0.74)
    clips["owl_hoot"] = normalize(soft_reverb(b, 0.26, 0.22), 0.68)

    # 25. AfterHours Platform: star tile flip (soft glass crystal tap)
    b = make_buf(0.32)
    mix_at(b, music_box_note(1046.5, 0.26), 0.0, 0.62)
    mix_at(b, marimba_note(698.46, 0.14, bright=0.35), 0.0, 0.36)
    clips["after_star_flip"] = normalize(soft_reverb(b, 0.18, 0.14), 0.68)

    # 26. AfterHours Coffee: ceramic spoon clink & cloud foam swirl
    b = make_buf(0.46)
    mix_at(b, filtered_noise(0.24, 1700, 320, seed=261, decay=8.5, attack=40.0), 0.0, 0.26)
    mix_at(b, music_box_note(1661.22, 0.24), 0.06, 0.56)
    mix_at(b, music_box_note(2093.0, 0.20), 0.16, 0.34)
    clips["after_coffee_stir"] = normalize(soft_reverb(b, 0.18, 0.15), 0.68)

    # 27. AfterHours Permission: red official stamp thump + cheerful approval ping
    b = make_buf(0.58)
    mix_at(b, pitch_sweep_tone(155, 46, 0.13, harm2=0.12, decay=19.0), 0.0, 0.90)
    mix_at(b, filtered_noise(0.08, 1200, 180, seed=271, decay=34.0, attack=650.0), 0.0, 0.62)
    mix_at(b, marimba_note(659.25, 0.22), 0.16, 0.48)
    mix_at(b, music_box_note(987.77, 0.32), 0.22, 0.44)
    clips["after_stamp"] = normalize(soft_reverb(b, 0.16, 0.14), 0.78)

    # 28. Zero-G easter egg: floating sci-fi decompression whoosh + airy chime
    b = make_buf(0.95)
    mix_at(b, pitch_sweep_tone(180, 620, 0.52, harm2=0.22, decay=3.2), 0.0, 0.52)
    mix_at(b, music_box_note(783.99, 0.45), 0.18, 0.38)
    mix_at(b, music_box_note(1174.66, 0.48), 0.30, 0.42)
    mix_at(b, bubble_pop(360, 740, 0.12), 0.48, 0.36)
    clips["zero_g"] = normalize(soft_reverb(b, 0.32, 0.28), 0.70)

    # 29. Whale Summon FX: sparkling leap out of water portal + ascending bubbles + windchime chord
    b = make_buf(1.06)
    mix_at(b, filtered_noise(0.32, 2600, 420, seed=291, decay=6.8, attack=85.0), 0.03, 0.36)
    for t_off, f0, f1 in [
        (0.03, 250, 620),
        (0.10, 320, 780),
        (0.18, 410, 980),
        (0.26, 520, 1200),
        (0.34, 640, 1440),
    ]:
        mix_at(b, bubble_pop(f0, f1, 0.088), t_off, 0.46)
    mix_at(b, cute_syllable(590, 880, 0.14, vibrato=0.014, breath=0.04, seed=294), 0.15, 0.42)
    for idx, (t_off, f) in enumerate([
        (0.22, 783.99),
        (0.28, 987.77),
        (0.34, 1046.50),
        (0.41, 1318.51),
        (0.49, 1567.98),
    ]):
        mix_at(b, karplus_harp(f, 0.48, brightness=0.56, seed=295 + idx), t_off, 0.36)
        mix_at(b, glass_chime(f, 0.42, sparkle=0.28), t_off + 0.01, 0.28)
    clips["whale_summon"] = normalize(soft_reverb(b, 0.28, 0.24), 0.74)

    # 30. Whale Leave FX: playful dive back into portal + soft water droplets + gentle farewell chime
    b = make_buf(0.90)
    mix_at(b, cute_syllable(640, 460, 0.14, vibrato=0.012, breath=0.05, seed=300), 0.02, 0.36)
    mix_at(b, bubble_pop(680, 240, 0.13), 0.11, 0.56)
    mix_at(b, filtered_noise(0.28, 1850, 280, seed=301, decay=7.5, attack=85.0), 0.12, 0.34)
    for t_off, f0, f1 in [(0.23, 500, 780), (0.35, 400, 640), (0.47, 320, 520)]:
        mix_at(b, bubble_pop(f0, f1, 0.085), t_off, 0.36)
    for t_off, f in [(0.22, 1318.51), (0.34, 1046.50), (0.46, 783.99)]:
        mix_at(b, music_box_note(f, 0.38), t_off, 0.30)
    clips["whale_leave"] = normalize(soft_reverb(b, 0.24, 0.20), 0.70)

    # 36. DaFeiYu Dock / Poke Boop: crisp Q-elastic water-bubble chirp ("啾/啵~")
    b = make_buf(0.34)
    mix_at(b, bubble_pop(440, 1080, 0.082), 0.0, 0.64)
    mix_at(b, cute_syllable(620, 920, 0.11, vibrato=0.012, breath=0.04, seed=361), 0.028, 0.56)
    mix_at(b, marimba_note(783.99, 0.14, bright=0.34), 0.045, 0.36)
    mix_at(b, glass_chime(1318.51, 0.22, sparkle=0.28), 0.075, 0.34)
    clips["whale_dock_boop"] = normalize(soft_reverb(b, 0.16, 0.10), 0.72)

    # 37. Global UI Circular Ripple Wave: luminous liquid-glass wave bloom + starlight shimmer
    b = make_buf(0.78)
    mix_at(b, filtered_noise(0.36, 2600, 560, seed=371, decay=5.8, attack=42.0), 0.0, 0.24)
    for t_off, f0, f1 in [(0.02, 380, 860), (0.10, 510, 1140), (0.19, 680, 1420)]:
        mix_at(b, bubble_pop(f0, f1, 0.082), t_off, 0.32)
    for idx, (t_off, f) in enumerate([
        (0.05, 523.25),
        (0.11, 659.25),
        (0.17, 783.99),
        (0.24, 1046.50),
        (0.31, 1318.51),
        (0.38, 1567.98),
    ]):
        mix_at(b, glass_chime(f, 0.38, sparkle=0.30), t_off, 0.34)
        mix_at(b, karplus_harp(f, 0.42, brightness=0.58, seed=372 + idx), t_off + 0.008, 0.24)
    clips["whale_ui_ripple"] = normalize(soft_reverb(b, 0.30, 0.22), 0.70)

    # 38. DaFeiYu Popover Open: springy glass bubble pop + rising double chime
    b = make_buf(0.38)
    mix_at(b, bubble_pop(360, 880, 0.078), 0.0, 0.58)
    mix_at(b, marimba_note(783.99, 0.16, bright=0.30), 0.035, 0.44)
    mix_at(b, glass_chime(1046.50, 0.24, sparkle=0.26), 0.085, 0.52)
    mix_at(b, glass_chime(1318.51, 0.24, sparkle=0.24), 0.135, 0.36)
    clips["whale_popover_open"] = normalize(soft_reverb(b, 0.18, 0.12), 0.70)

    # 39. DaFeiYu Popover Close: soft descending water-droplet tuck-in
    b = make_buf(0.31)
    mix_at(b, bubble_pop(740, 340, 0.088), 0.0, 0.56)
    mix_at(b, glass_chime(1046.50, 0.18, sparkle=0.20), 0.035, 0.40)
    mix_at(b, marimba_note(783.99, 0.18, bright=0.22), 0.095, 0.46)
    clips["whale_popover_close"] = normalize(soft_reverb(b, 0.15, 0.10), 0.66)

    # 40. DaFeiYu Pet Summon: energetic cute leap chirp + triple bubbles + cheerful triad
    b = make_buf(0.68)
    mix_at(b, cute_syllable(560, 820, 0.105, vibrato=0.01, breath=0.04, seed=401), 0.0, 0.56)
    mix_at(b, cute_syllable(740, 1040, 0.135, vibrato=0.016, breath=0.04, seed=402), 0.11, 0.62)
    for t_off, f0, f1 in [(0.05, 340, 780), (0.14, 460, 1020), (0.24, 600, 1320)]:
        mix_at(b, bubble_pop(f0, f1, 0.078), t_off, 0.42)
    for idx, (t_off, f) in enumerate([
        (0.18, 1046.50),
        (0.25, 1318.51),
        (0.32, 1567.98),
        (0.40, 2093.00),
    ]):
        mix_at(b, glass_chime(f, 0.30, sparkle=0.28), t_off, 0.36)
        mix_at(b, karplus_harp(f * 0.5, 0.36, brightness=0.52, seed=405 + idx), t_off, 0.26)
    clips["whale_pet_summon"] = normalize(soft_reverb(b, 0.22, 0.16), 0.74)

    # 41. DaFeiYu Pet Dismiss: playful tail-swish glide + descending bubbles + cozy lullaby chime
    b = make_buf(0.56)
    mix_at(b, pitch_sweep_tone(640, 310, 0.16, harm2=0.14, decay=9.5), 0.0, 0.50)
    mix_at(b, bubble_pop(520, 280, 0.095), 0.10, 0.52)
    mix_at(b, bubble_pop(420, 640, 0.075), 0.22, 0.34)
    mix_at(b, music_box_note(1318.51, 0.28), 0.14, 0.34)
    mix_at(b, music_box_note(1046.50, 0.32), 0.24, 0.40)
    clips["whale_pet_dismiss"] = normalize(soft_reverb(b, 0.20, 0.16), 0.68)

    # 42. DaFeiYu Chat Send: crisp gentle bubble-glass tap (pleasant even on frequent sends)
    b = make_buf(0.30)
    mix_at(b, bubble_pop(480, 960, 0.065), 0.0, 0.56)
    mix_at(b, marimba_note(659.25, 0.14, bright=0.26), 0.015, 0.44)
    mix_at(b, glass_chime(1318.51, 0.20, sparkle=0.24), 0.04, 0.36)
    clips["whale_chat_send"] = normalize(soft_reverb(b, 0.14, 0.09), 0.66)

    # 31. DaFeiYu Cute Reaction — happy / pet / rice bowl (sweet bubbly girl chirp + sparkle)
    b = make_buf(0.56)
    mix_at(b, cute_syllable(540, 740, 0.12, vibrato=0.01, breath=0.05, seed=311), 0.0, 0.68)
    mix_at(b, cute_syllable(660, 890, 0.16, vibrato=0.015, breath=0.05, seed=312), 0.12, 0.74)
    mix_at(b, bubble_pop(680, 1260, 0.075), 0.24, 0.34)
    mix_at(b, music_box_note(1318.51, 0.26), 0.26, 0.26)
    clips["whale_cute_happy"] = normalize(soft_reverb(b, 0.18, 0.14), 0.72)

    # 32. DaFeiYu Cute Reaction — tsundere / playful milk-fierce ("哼~!" crisp bouncy pout)
    b = make_buf(0.46)
    mix_at(b, cute_syllable(780, 610, 0.11, vibrato=0.0, breath=0.05, seed=321), 0.0, 0.74)
    mix_at(b, cute_syllable(640, 790, 0.13, vibrato=0.01, breath=0.04, seed=322), 0.13, 0.66)
    mix_at(b, bubble_pop(520, 880, 0.065), 0.25, 0.32)
    clips["whale_cute_tsun"] = normalize(soft_reverb(b, 0.14, 0.12), 0.72)

    # 33. DaFeiYu Cute Reaction — sleepy / yawn ("呼呼…" gentle soft downward purr-bubble)
    b = make_buf(0.76)
    mix_at(b, cute_syllable(520, 410, 0.24, vibrato=0.014, breath=0.08, seed=331), 0.02, 0.62)
    mix_at(b, cute_syllable(430, 355, 0.28, vibrato=0.016, breath=0.09, seed=332), 0.28, 0.56)
    mix_at(b, bubble_pop(340, 520, 0.09), 0.54, 0.26)
    clips["whale_cute_sleepy"] = normalize(soft_reverb(b, 0.24, 0.20), 0.64)

    # 34. DaFeiYu Cute Reaction — comfort / shy / gentle ("没关系呀~" warm tender harp + soft hum)
    b = make_buf(0.68)
    mix_at(b, cute_syllable(500, 575, 0.19, vibrato=0.012, breath=0.06, seed=341), 0.0, 0.62)
    mix_at(b, cute_syllable(560, 515, 0.22, vibrato=0.015, breath=0.06, seed=342), 0.19, 0.58)
    mix_at(b, karplus_harp(659.25, 0.42, brightness=0.40, seed=343), 0.12, 0.32)
    mix_at(b, karplus_harp(783.99, 0.44, brightness=0.42, seed=344), 0.24, 0.30)
    clips["whale_cute_comfort"] = normalize(soft_reverb(b, 0.24, 0.20), 0.68)

    # 35. DaFeiYu Cute Reaction — excited / dance / spin (triple upbeat bubbly trills)
    b = make_buf(0.64)
    mix_at(b, cute_syllable(580, 760, 0.10, breath=0.04, seed=351), 0.0, 0.66)
    mix_at(b, cute_syllable(700, 920, 0.10, breath=0.04, seed=352), 0.11, 0.72)
    mix_at(b, cute_syllable(840, 1080, 0.14, vibrato=0.018, breath=0.05, seed=353), 0.22, 0.74)
    mix_at(b, bubble_pop(640, 1340, 0.07), 0.36, 0.36)
    mix_at(b, music_box_note(1567.98, 0.28), 0.37, 0.28)
    clips["whale_cute_excited"] = normalize(soft_reverb(b, 0.20, 0.16), 0.74)

    return clips


def write_wav(path: Path, samples: list[float]) -> None:
    pcm = array.array("h", (int(clamp(s) * 32767.0) for s in samples))
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def main() -> int:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ERROR: ffmpeg not found on PATH", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    clips = build_all_sfx()
    total_bytes = 0

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for name, samples in sorted(clips.items()):
            wav_path = tmp_dir / f"{name}.wav"
            mp3_path = OUT_DIR / f"{name}.mp3"
            write_wav(wav_path, samples)
            proc = subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-v",
                    "error",
                    "-i",
                    str(wav_path),
                    "-ac",
                    "1",
                    "-ar",
                    str(SR),
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                    "48k",
                    "-write_xing",
                    "0",
                    str(mp3_path),
                ],
                capture_output=True,
                text=True,
            )
            if proc.returncode != 0:
                print(f"ERROR encoding {name}: {proc.stderr}", file=sys.stderr)
                return 1
            size = mp3_path.stat().st_size
            total_bytes += size

    print(f"Generated {len(clips)} SFX clips in {OUT_DIR} ({total_bytes / 1024:.1f} KB total)")
    if total_bytes > 1024 * 1024:
        print("ERROR: SFX bundle exceeded 1 MB budget!", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
