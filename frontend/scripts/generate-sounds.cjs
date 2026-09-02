const fs = require('fs');
const path = require('path');

const sampleRate = 44100;
const outDir = path.join(__dirname, '..', 'public', 'sounds');

const effects = [
  {
    file: 'button-click.wav',
    duration: 0.08,
    tones: [
      { start: 0, duration: 0.025, freq: 980, type: 'triangle', gain: 0.36 },
      { start: 0.018, duration: 0.045, freq: 490, type: 'sine', gain: 0.18 },
    ],
    noise: [{ start: 0, duration: 0.025, gain: 0.08 }],
  },
  {
    file: 'emoji-select.wav',
    duration: 0.13,
    tones: [
      { start: 0, duration: 0.1, freq: 740, endFreq: 980, type: 'sine', gain: 0.25 },
      { start: 0.02, duration: 0.08, freq: 1480, endFreq: 1960, type: 'triangle', gain: 0.09 },
    ],
  },
  {
    file: 'new-guess.wav',
    duration: 0.18,
    tones: [
      { start: 0, duration: 0.14, freq: 420, endFreq: 760, type: 'triangle', gain: 0.27 },
      { start: 0.055, duration: 0.09, freq: 1180, type: 'sine', gain: 0.1 },
    ],
    noise: [{ start: 0.005, duration: 0.06, gain: 0.045 }],
  },
  {
    file: 'correct-guess.wav',
    duration: 0.46,
    tones: [
      { start: 0, duration: 0.18, freq: 659.25, type: 'sine', gain: 0.2 },
      { start: 0.11, duration: 0.2, freq: 830.61, type: 'sine', gain: 0.2 },
      { start: 0.22, duration: 0.22, freq: 1046.5, type: 'sine', gain: 0.22 },
      { start: 0.22, duration: 0.22, freq: 1318.51, type: 'triangle', gain: 0.08 },
    ],
  },
  {
    file: 'player-joined.wav',
    duration: 0.34,
    tones: [
      { start: 0, duration: 0.15, freq: 587.33, type: 'sine', gain: 0.18 },
      { start: 0.09, duration: 0.19, freq: 880, type: 'triangle', gain: 0.18 },
      { start: 0.17, duration: 0.14, freq: 1174.66, type: 'sine', gain: 0.12 },
    ],
  },
  {
    file: 'game-start.wav',
    duration: 0.72,
    tones: [
      { start: 0, duration: 0.16, freq: 392, type: 'triangle', gain: 0.19 },
      { start: 0.13, duration: 0.16, freq: 523.25, type: 'triangle', gain: 0.19 },
      { start: 0.26, duration: 0.16, freq: 659.25, type: 'triangle', gain: 0.19 },
      { start: 0.39, duration: 0.26, freq: 783.99, type: 'sine', gain: 0.24 },
      { start: 0.39, duration: 0.26, freq: 987.77, type: 'sine', gain: 0.12 },
    ],
  },
  {
    file: 'time-up.wav',
    duration: 0.62,
    tones: [
      { start: 0, duration: 0.16, freq: 880, endFreq: 760, type: 'square', gain: 0.15 },
      { start: 0.19, duration: 0.16, freq: 880, endFreq: 760, type: 'square', gain: 0.15 },
      { start: 0.38, duration: 0.19, freq: 659.25, endFreq: 520, type: 'square', gain: 0.16 },
    ],
    noise: [{ start: 0, duration: 0.62, gain: 0.012 }],
  },
  {
    file: 'game-end.wav',
    duration: 0.92,
    tones: [
      { start: 0, duration: 0.22, freq: 523.25, type: 'sine', gain: 0.17 },
      { start: 0.16, duration: 0.24, freq: 659.25, type: 'sine', gain: 0.17 },
      { start: 0.32, duration: 0.24, freq: 783.99, type: 'sine', gain: 0.17 },
      { start: 0.5, duration: 0.34, freq: 1046.5, type: 'triangle', gain: 0.2 },
      { start: 0.5, duration: 0.34, freq: 1318.51, type: 'sine', gain: 0.09 },
      { start: 0.5, duration: 0.34, freq: 1567.98, type: 'sine', gain: 0.07 },
    ],
  },
];

let seed = 123456789;
const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 0xffffffff;
};

const wave = (type, phase) => {
  switch (type) {
    case 'square':
      return Math.sin(phase) >= 0 ? 1 : -1;
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(phase));
    default:
      return Math.sin(phase);
  }
};

const envelope = (position) => {
  const attack = 0.08;
  const release = 0.55;
  if (position < attack) return position / attack;
  if (position > 1 - release) return Math.max(0, (1 - position) / release);
  return 1;
};

const renderTone = (samples, tone) => {
  const start = Math.floor(tone.start * sampleRate);
  const length = Math.floor(tone.duration * sampleRate);
  let phase = 0;

  for (let i = 0; i < length && start + i < samples.length; i += 1) {
    const position = i / Math.max(1, length - 1);
    const freq = tone.endFreq
      ? tone.freq + (tone.endFreq - tone.freq) * position
      : tone.freq;
    phase += (2 * Math.PI * freq) / sampleRate;
    samples[start + i] += wave(tone.type, phase) * tone.gain * envelope(position);
  }
};

const renderNoise = (samples, noise) => {
  const start = Math.floor(noise.start * sampleRate);
  const length = Math.floor(noise.duration * sampleRate);

  for (let i = 0; i < length && start + i < samples.length; i += 1) {
    const position = i / Math.max(1, length - 1);
    samples[start + i] += (random() * 2 - 1) * noise.gain * envelope(position);
  }
};

const toWav = (samples) => {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  samples.forEach((sample, index) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(clipped * 32767), 44 + index * 2);
  });

  return buffer;
};

fs.mkdirSync(outDir, { recursive: true });

for (const effect of effects) {
  const samples = new Float32Array(Math.ceil(effect.duration * sampleRate));
  effect.tones.forEach((tone) => renderTone(samples, tone));
  (effect.noise || []).forEach((noise) => renderNoise(samples, noise));

  const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
  if (peak > 0.86) {
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = (samples[i] / peak) * 0.86;
    }
  }

  fs.writeFileSync(path.join(outDir, effect.file), toWav(samples));
}
