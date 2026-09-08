import sharp from 'sharp';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/extract-mascot-background.mjs <input> <output>');
}

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const pixelCount = info.width * info.height;
const connectedBackground = new Uint8Array(pixelCount);
const queue = new Int32Array(pixelCount);
let queueStart = 0;
let queueEnd = 0;

const isOuterWhite = (pixelIndex) => {
  const offset = pixelIndex * info.channels;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const darkest = Math.min(red, green, blue);
  const lightest = Math.max(red, green, blue);
  return darkest >= 220 && lightest - darkest <= 24;
};

const enqueue = (pixelIndex) => {
  if (connectedBackground[pixelIndex] || !isOuterWhite(pixelIndex)) return;
  connectedBackground[pixelIndex] = 1;
  queue[queueEnd++] = pixelIndex;
};

for (let x = 0; x < info.width; x += 1) {
  enqueue(x);
  enqueue((info.height - 1) * info.width + x);
}
for (let y = 0; y < info.height; y += 1) {
  enqueue(y * info.width);
  enqueue(y * info.width + info.width - 1);
}

while (queueStart < queueEnd) {
  const pixelIndex = queue[queueStart++];
  const x = pixelIndex % info.width;
  const y = Math.floor(pixelIndex / info.width);
  if (x > 0) enqueue(pixelIndex - 1);
  if (x + 1 < info.width) enqueue(pixelIndex + 1);
  if (y > 0) enqueue(pixelIndex - info.width);
  if (y + 1 < info.height) enqueue(pixelIndex + info.width);
}

for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
  if (!connectedBackground[pixelIndex]) continue;
  data[pixelIndex * info.channels + 3] = 0;
}

await sharp(data, { raw: info })
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
