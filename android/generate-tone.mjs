import { writeFileSync } from "node:fs";

const rate = 22_050;
const notes = [
  [0, 784, 0.13],
  [0.19, 1047, 0.13],
  [0.47, 784, 0.13],
  [0.66, 1175, 0.24],
];
const count = rate;
const bytes = Buffer.alloc(44 + count * 2);
bytes.write("RIFF");
bytes.writeUInt32LE(bytes.length - 8, 4);
bytes.write("WAVEfmt ", 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(rate, 24);
bytes.writeUInt32LE(rate * 2, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write("data", 36);
bytes.writeUInt32LE(count * 2, 40);
for (const [offset, frequency, duration] of notes) {
  const start = Math.round(offset * rate);
  const length = Math.round(duration * rate);
  for (let i = 0; i < length; i++) {
    const time = i / rate;
    const phase = 2 * Math.PI * frequency * time;
    const envelope = Math.min(1, time / 0.015, (duration - time) / 0.04);
    const wave = Math.sin(phase) + Math.sin(3 * phase) / 3 + Math.sin(5 * phase) / 5;
    bytes.writeInt16LE(Math.round(8600 * envelope * wave), 44 + (start + i) * 2);
  }
}
writeFileSync(process.argv[2], bytes);
