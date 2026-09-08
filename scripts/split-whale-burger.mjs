import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const whaleDir = path.join(projectRoot, "public", "whale");
const sourcePath = path.join(whaleDir, "whale-burger-cutout.png");
const scenePath = path.join(whaleDir, "whale-burger-scene.png");
const burgerPath = path.join(whaleDir, "whale-burger-piece.png");

const image = sharp(sourcePath).ensureAlpha();
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

// The burger occupies this isolated area in the user's original drawing.
const burgerBox = { left: 240, top: 460, width: 130, height: 125 };
const scenePixels = Buffer.from(data);

for (let y = burgerBox.top; y < burgerBox.top + burgerBox.height; y += 1) {
  for (let x = burgerBox.left; x < burgerBox.left + burgerBox.width; x += 1) {
    scenePixels[(y * info.width + x) * 4 + 3] = 0;
  }
}

await sharp(scenePixels, { raw: info }).png({ compressionLevel: 9 }).toFile(scenePath);

await sharp(data, { raw: info })
  .extract(burgerBox)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(burgerPath);

console.log(`Created ${path.relative(projectRoot, scenePath)}`);
console.log(`Created ${path.relative(projectRoot, burgerPath)}`);
