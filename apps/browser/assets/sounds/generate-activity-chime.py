"""Generate Kudium's original soft notification chime (no external samples)."""
import math
from pathlib import Path
import struct
import wave

rate = 44100
duration = 0.85
notes = [(0.0, 523.25, 0.19), (0.11, 659.25, 0.14), (0.22, 783.99, 0.10)]
frames = []
for i in range(int(rate * duration)):
    t = i / rate
    value = 0.0
    for start, frequency, gain in notes:
        elapsed = t - start
        if elapsed < 0:
            continue
        envelope = (1 - math.exp(-elapsed / 0.012)) * math.exp(-elapsed / 0.15)
        tone = math.sin(2 * math.pi * frequency * elapsed)
        tone += 0.10 * math.sin(2 * math.pi * frequency * 2 * elapsed)
        value += gain * envelope * tone
    value *= min(1.0, max(0.0, (duration - t) / 0.06))
    frames.append(struct.pack('<h', round(max(-1, min(1, value)) * 32767)))
with wave.open(str(Path(__file__).with_name('activity-chime.wav')), 'wb') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(b''.join(frames))
