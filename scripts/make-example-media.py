"""The example projects' images and recordings, made from nothing.

    python3 scripts/make-example-media.py

Writes into public/examples/:
  songwriter-thirty-four-chords.m4a   a phone memo of guitar chords (plucked-string synthesis)
  director-arrivals-light.jpg         mood reference: an arrivals hall at 6am, out of focus
  director-taxi-home.jpg              mood reference: city lights through a wet taxi window
  director-scuffed-leather.jpg        mood reference: tan leather, marked by use

Every sound and pixel is generated here, so there is nothing anyone else
owns in them. It prints each file's duration, size and waveform (24 bars),
which the example's file (src/lib/examples/*.ts) carries.
Needs numpy, and macOS's own afconvert and sips for the final encoding.
"""

import json
import os
import struct
import subprocess
import tempfile
import wave
import zlib

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'public', 'examples')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(34)


# ── sound ────────────────────────────────────────────────────────────────────

SR = 44100


def pluck(freq, seconds, bright=0.5, decay=0.996):
    """One plucked string (Karplus-Strong), worked a delay line at a time."""
    n = max(2, int(round(SR / freq)))
    total = int(seconds * SR)
    out = np.zeros(total + n)
    burst = rng.uniform(-1, 1, n)
    # A softer pick: the burst itself smoothed a little.
    burst = (1 - bright) * np.convolve(burst, np.ones(3) / 3, mode='same') + bright * burst
    out[:n] = burst
    k = n
    while k < total:
        prev = out[k - n:k]
        nxt = decay * 0.5 * (prev + np.roll(prev, 1))
        m = min(n, total - k)
        out[k:k + m] = nxt[:m]
        k += n
    return out[:total]


# Open D tuning, low to high (D A D F# A D): the tuning the song is played in.
OPEN_D = [73.42, 110.0, 146.83, 185.0, 220.0, 293.66]
SEMI = 2 ** (1 / 12)
# Frets per string for each shape in open D.
SHAPES = {
    'D': [0, 0, 0, 0, 0, 0],
    'G': [5, 5, 5, 5, 5, 5],
    'A': [7, 7, 7, 7, 7, 7],
    'Bm': [0, 2, 0, 0, 2, 0],
}


def strum(shape, at, length, down=True, force=1.0):
    frets = SHAPES[shape]
    order = range(6) if down else reversed(range(6))
    sig = np.zeros(int((at + length + 0.2) * SR))
    for i, s in enumerate(order):
        f = OPEN_D[s] * SEMI ** frets[s]
        start = int((at + i * (0.011 if down else 0.008)) * SR)
        note = pluck(f, length, bright=0.35 if down else 0.6, decay=0.9965 if f < 150 else 0.9952) * force * (0.9 if s < 2 else 0.7)
        sig[start:start + len(note)] += note[: len(sig) - start]
    return sig


def mix_into(track, sig):
    end = min(len(track), len(sig))
    track[:end] += sig[:end]


def _shape(x, gain):
    spectrum = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spectrum * gain(f), n=len(x))


def lowpass(x, cutoff):
    """A gentle (second-order) roll-off above `cutoff`, done in the frequency domain."""
    return _shape(x, lambda f: 1 / np.sqrt(1 + (f / cutoff) ** 4))


def highpass(x, cutoff):
    return _shape(x, lambda f: (f / cutoff) ** 2 / np.sqrt(1 + (f / cutoff) ** 4))


def room(x):
    """A small hallway: a few short echoes."""
    y = x.copy()
    for delay, gain in [(0.023, 0.32), (0.037, 0.22), (0.061, 0.16), (0.089, 0.10)]:
        d = int(delay * SR)
        y[d:] += gain * x[:-d]
    return y


def write_wav(path, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.89
    data = (x * 32767).astype('<i2').tobytes()
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)


def envelope(x, bars=24):
    slice_ = len(x) // bars
    peaks = [float(np.max(np.abs(x[i * slice_:(i + 1) * slice_]))) for i in range(bars)]
    top = max(peaks) or 1
    return [round(p / top, 3) for p in peaks]


def encode_m4a(wav_path, out_path):
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '96000', wav_path, out_path], check=True)


def guitar_memo():
    bpm = 72
    beat = 60 / bpm
    bars = ['D', 'D', 'G', 'D', 'Bm', 'G', 'A', 'A', 'D', 'D', 'G', 'D', 'Bm', 'G', 'A', 'D']
    seconds = 1.2 + len(bars) * 2 * beat + 3.0
    track = np.zeros(int(seconds * SR))
    t = 1.2  # the phone picked up, a breath before the first chord
    # Each bar of 4: down on 1, down on 2, down-up on 3, up on the "and" of 4 (half bars per chord).
    for chord in bars:
        pattern = [(0.0, True, 1.0), (1.0, True, 0.75), (1.5, False, 0.5)]
        for off, down, force in pattern:
            mix_into(track, np.pad(strum(chord, 0, 1.6, down, force * rng.uniform(0.9, 1.05)), (int((t + off * beat) * SR), 0)))
        t += 2 * beat
    # Let the last chord ring.
    mix_into(track, np.pad(strum('D', 0, 3.0, True, 0.9), (int(t * SR), 0)))
    x = room(track)
    # A phone's microphone: no deep lows, no air at the top, a little hiss.
    x = highpass(x, 140)
    x = lowpass(x, 6500)
    x = x / (np.max(np.abs(x)) + 1e-9)
    x += rng.normal(0, 0.006, len(x))
    # The tap of the phone being set down, before it starts.
    tap = np.exp(-np.linspace(0, 40, int(0.05 * SR))) * rng.normal(0, 0.5, int(0.05 * SR))
    x[int(0.15 * SR):int(0.15 * SR) + len(tap)] += tap
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'memo.wav')
        write_wav(wav, x)
        out = os.path.join(OUT, 'songwriter-thirty-four-chords.m4a')
        encode_m4a(wav, out)
    return {'file': 'songwriter-thirty-four-chords.m4a', 'seconds': round(len(x) / SR, 1), 'bytes': os.path.getsize(out), 'envelope': envelope(x)}


# ── pictures ─────────────────────────────────────────────────────────────────

W, H = 1200, 800


def write_png(path, img):
    img = np.clip(img * 255, 0, 255).astype(np.uint8)
    raw = b''.join(b'\x00' + img[y].tobytes() for y in range(img.shape[0]))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', img.shape[1], img.shape[0], 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def to_jpeg(img, name):
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, 'img.png')
        write_png(png, img)
        out = os.path.join(OUT, name)
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', out], check=True, capture_output=True)
    return {'file': name, 'width': W, 'height': H, 'bytes': os.path.getsize(out)}


def blur(img, radius):
    """A cheap separable box blur, three passes (close to gaussian)."""
    out = img.copy()
    k = 2 * radius + 1
    for _ in range(3):
        for axis in (0, 1):
            c = np.cumsum(np.pad(out, [(radius + 1, radius) if a == axis else (0, 0) for a in range(3)], mode='edge'), axis=axis)
            if axis == 0:
                out = (c[k:] - c[:-k]) / k
            else:
                out = (c[:, k:] - c[:, :-k]) / k
    return out


def grain(img, amount):
    return img + rng.normal(0, amount, img.shape[:2])[..., None]


def vignette(img, strength):
    y, x = np.mgrid[0:H, 0:W]
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    return img * (1 - strength * np.clip(d - 0.35, 0, 1)[..., None])


def col(hexs):
    return np.array([int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def arrivals_light():
    """A long band of cold morning window across a dim hall, the floor catching it."""
    y, x = np.mgrid[0:H, 0:W] / np.array([H, W])[:, None, None]
    img = np.zeros((H, W, 3)) + col('#1b2129')
    sky = col('#c9d6df')
    band = ((y > 0.18) & (y < 0.42)).astype(float)
    # Mullions every so often.
    mull = (np.abs(((x * 9) % 1) - 0.5) < 0.02).astype(float)
    window = band * (1 - 0.85 * mull)
    img += window[..., None] * (sky - col('#1b2129')) * (0.75 + 0.25 * x)[..., None]
    # The floor: a soft, stretched reflection.
    refl = ((y > 0.62) & (y < 0.9)).astype(float) * np.exp(-((y - 0.66) * 7) ** 2)
    img += (refl * (1 - 0.6 * mull))[..., None] * col('#7f8f9c') * 0.45
    # Two people crossing in front of the glass, out of focus: a head, shoulders, a coat.
    py, px = np.mgrid[0:H, 0:W]
    for cx, scale, lean in [(0.355, 1.0, 0.02), (0.62, 0.9, -0.015), (0.8, 0.7, 0.0)]:
        cxp = cx * W
        head_y = H * (0.31 + 0.04 * (1 - scale))
        head = ((px - cxp) / (16 * scale)) ** 2 + ((py - head_y) / (21 * scale)) ** 2 < 1
        top = head_y + 18 * scale
        depth = (py - top) / (H * 0.4 * scale)
        half = (24 + 12 * np.clip(depth, 0, 1) - 10 * np.clip(depth - 0.8, 0, 1)) * scale
        body = (py > top) & (py < top + H * 0.42 * scale) & (np.abs(px - cxp - lean * (py - top)) < half)
        fig = head | body
        img[fig] = img[fig] * 0.2 + col('#1f242b') * 0.8
    img = blur(img, 13)
    img = vignette(img, 0.55)
    return grain(img, 0.03)


def taxi_home():
    """City lights through a wet window at night: warm and cold discs, out of focus."""
    img = np.zeros((H, W, 3)) + col('#0d0f14')
    y, x = np.mgrid[0:H, 0:W]
    lights = [('#ffb35c', 30), ('#ff9a2e', 20), ('#f4e6c8', 12), ('#9fc3ff', 9), ('#ff5a4e', 6)]
    for hexs, count in lights:
        c = col(hexs)
        for _ in range(count):
            cx, cy = rng.uniform(0, W), rng.uniform(H * 0.25, H * 0.8)
            r = rng.uniform(18, 70)
            a = rng.uniform(0.25, 0.7)
            disc = np.clip((r - np.sqrt((x - cx) ** 2 + (y - cy) ** 2)) / 3, 0, 1)
            img += disc[..., None] * c * a
    img = blur(img, 4)
    # Rain on the glass: short bright streaks.
    for _ in range(220):
        sx, sy = int(rng.uniform(0, W)), int(rng.uniform(0, H - 40))
        ln = int(rng.uniform(8, 36))
        img[sy:sy + ln, sx:sx + 2] += 0.06
    img = blur(img, 1)
    img = vignette(img, 0.6)
    return grain(img, 0.035)


def scuffed_leather():
    """Tan leather, close and lit from one side: mottled hide, soft creases, pale marks of use."""
    base = col('#9c5a27')
    y, x = np.mgrid[0:H, 0:W]
    img = np.zeros((H, W, 3)) + base
    # Large, slow mottling of the hide, then the fine grain on top.
    big = rng.normal(0, 1, (H // 40 + 2, W // 40 + 2))
    big = np.kron(big, np.ones((40, 40)))[:H, :W]
    big = blur(big[..., None].repeat(3, 2), 20)[..., 0]
    fine = np.kron(rng.normal(0, 1, (H // 3 + 1, W // 3 + 1)), np.ones((3, 3)))[:H, :W]
    fine = blur(fine[..., None].repeat(3, 2), 1)[..., 0]
    img *= (1 + 0.22 * big / (np.abs(big).max() + 1e-9) + 0.05 * fine)[..., None]
    # Creases: a soft dark valley with a lit edge beside it, where the hide bends.
    for _ in range(6):
        ang = rng.uniform(-0.5, 0.5)
        off = rng.uniform(0.1, 0.9) * H
        width = rng.uniform(5, 12)
        d = (y - off) - np.tan(ang) * (x - W / 2) + 6 * np.sin(x / rng.uniform(60, 140))
        valley = np.exp(-(d / width) ** 2)
        ridge = np.exp(-((d + width * 1.6) / (width * 0.9)) ** 2)
        img *= (1 - 0.32 * valley + 0.14 * ridge)[..., None]
    # Scuffs: short pale abrasions, softened.
    marks = np.zeros((H, W))
    for _ in range(90):
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        ang = rng.uniform(0, np.pi)
        ln = rng.uniform(15, 70)
        t = np.linspace(0, 1, int(ln * 2))
        mx = (cx + np.cos(ang) * ln * t).astype(int)
        my = (cy + np.sin(ang) * ln * t + 3 * np.sin(t * 6)).astype(int)
        ok = (mx >= 0) & (mx < W) & (my >= 0) & (my < H)
        marks[my[ok], mx[ok]] = rng.uniform(0.4, 1)
    marks = blur(marks[..., None].repeat(3, 2), 2)[..., 0]
    img = img * (1 - 0.5 * marks[..., None]) + col('#d9b48c') * (0.5 * marks[..., None])
    # Light raking in from the top left, falling away.
    img *= (1.35 - 0.75 * (x / W * 0.55 + y / H * 0.45))[..., None]
    img = vignette(img, 0.45)
    return grain(img, 0.015)


if __name__ == '__main__':
    made = {
        'memo': guitar_memo(),
        'arrivals': to_jpeg(arrivals_light(), 'director-arrivals-light.jpg'),
        'taxi': to_jpeg(taxi_home(), 'director-taxi-home.jpg'),
        'leather': to_jpeg(scuffed_leather(), 'director-scuffed-leather.jpg'),
    }
    print(json.dumps(made, indent=1))
