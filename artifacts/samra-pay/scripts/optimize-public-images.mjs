import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const packageRoot = path.resolve(import.meta.dirname, "..");
const sourceDirectory = path.join(packageRoot, "src/assets/coming-soon/source");
const generatedDirectory = path.join(
  packageRoot,
  "src/assets/coming-soon/generated",
);
const generationFingerprintPath = path.join(
  generatedDirectory,
  ".generation-fingerprint",
);
const publicDirectory = path.join(packageRoot, "public");
const publicIconsDirectory = path.join(publicDirectory, "icons");

const imagePlans = [
  {
    name: "hero-woman-coffee",
    source: "hero-woman-coffee.png",
    widths: [640, 960, 1200],
    webpQuality: 70,
    // Keep the detailed 1200px portrait inside the existing 100 KB fallback budget.
    webpQualityByWidth: { 1200: 58 },
    avifQuality: 54,
    maximumBytes: 100_000,
  },
  {
    name: "proof-man-laptop",
    source: "proof-man-laptop.png",
    widths: [640, 960, 1200],
    webpQuality: 78,
    avifQuality: 55,
    maximumBytes: 60_000,
  },
  {
    name: "values-portrait-elder-v2",
    source: "values-portrait-elder-v2.jpg",
    widths: [1000],
    webpQuality: 75,
    avifQuality: 55,
    maximumBytes: 70_000,
  },
  {
    name: "values-portrait-man-v2",
    source: "values-portrait-man-v2.jpg",
    widths: [1000],
    webpQuality: 75,
    avifQuality: 55,
    maximumBytes: 70_000,
  },
  {
    name: "values-portrait-woman-v2",
    source: "values-portrait-woman-v2.jpg",
    widths: [1000],
    webpQuality: 75,
    avifQuality: 55,
    maximumBytes: 70_000,
  },
  {
    name: "woman-with-phone-diaspora",
    source: "woman-with-phone-diaspora.jpg",
    widths: [640, 960, 1024],
    webpQuality: 75,
    avifQuality: 55,
    maximumBytes: 90_000,
  },
  {
    name: "tibeb-pattern-gold",
    source: "tibeb-pattern-gold.jpg",
    widths: [640],
    webpQuality: 62,
    avifQuality: 45,
    blurSigma: 0.7,
    maximumBytes: 80_000,
  },
  ...[
    "samra-pay-charge-v1",
    "samra-pay-elite-v1",
    "samra-pay-airline-v1",
    "samra-pay-elite-100-v1",
  ].map((name) => ({
    name,
    source: `${name}.png`,
    widths: [428, 856],
    // Preserve the approved lettering and fine etched borders at card scale.
    webpQuality: 95,
    avifQuality: 80,
    maximumBytes: 200_000,
  })),
];

function expectedGeneratedFileNames() {
  return imagePlans.flatMap((plan) =>
    plan.widths.flatMap((width) => [
      `${plan.name}-${width}.avif`,
      `${plan.name}-${width}.webp`,
    ]),
  );
}

async function generationFingerprint() {
  const hash = createHash("sha256");
  hash.update(await readFile(new URL(import.meta.url)));
  hash.update(
    JSON.stringify({
      architecture: process.arch,
      platform: process.platform,
      sharp: sharp.versions,
    }),
  );

  const sourceNames = [
    ...new Set([
      ...imagePlans.map((plan) => plan.source),
      "og-preview.png",
      "samra-pay-icon-source.png",
    ]),
  ].sort();
  for (const name of sourceNames) {
    hash.update(name);
    hash.update(await readFile(path.join(sourceDirectory, name)));
  }
  return hash.digest("hex");
}

async function generatedCacheIsCurrent(fingerprint) {
  try {
    if (
      (await readFile(generationFingerprintPath, "utf8")).trim() !== fingerprint
    ) {
      return false;
    }
    const generatedImages = (await readdir(generatedDirectory))
      .filter((name) => /\.(?:avif|webp)$/u.test(name))
      .sort();
    return (
      JSON.stringify(generatedImages) ===
      JSON.stringify(expectedGeneratedFileNames().sort())
    );
  } catch {
    return false;
  }
}

function contentHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 10);
}

async function removeMatchingFiles(directory, expression) {
  await mkdir(directory, { recursive: true });
  for (const name of await readdir(directory)) {
    if (expression.test(name)) await rm(path.join(directory, name));
  }
}

async function writeCheckedFile(filePath, buffer, maximumBytes) {
  if (buffer.byteLength > maximumBytes) {
    throw new Error(
      `${path.basename(filePath)} is ${buffer.byteLength} B; maximum is ${maximumBytes} B`,
    );
  }
  await writeFile(filePath, buffer);
  process.stdout.write(
    `${path.relative(packageRoot, filePath)} ${buffer.byteLength} B\n`,
  );
}

async function generateResponsiveImages() {
  await mkdir(generatedDirectory, { recursive: true });
  await removeMatchingFiles(generatedDirectory, /\.(?:avif|webp)$/u);

  for (const plan of imagePlans) {
    const source = path.join(sourceDirectory, plan.source);
    for (const width of plan.widths) {
      let pipeline = sharp(source).rotate().resize({
        width,
        fit: "inside",
        withoutEnlargement: false,
      });
      if (plan.blurSigma !== undefined) {
        pipeline = pipeline.blur(plan.blurSigma);
      }
      const avif = await pipeline
        .clone()
        .avif({ quality: plan.avifQuality, effort: 6 })
        .toBuffer();
      const webp = await pipeline
        .clone()
        .webp({
          quality: plan.webpQualityByWidth?.[width] ?? plan.webpQuality,
          effort: 6,
          smartSubsample: false,
        })
        .toBuffer();
      await writeCheckedFile(
        path.join(generatedDirectory, `${plan.name}-${width}.avif`),
        avif,
        plan.maximumBytes,
      );
      await writeCheckedFile(
        path.join(generatedDirectory, `${plan.name}-${width}.webp`),
        webp,
        plan.maximumBytes,
      );
    }
  }
}

async function generateOpenGraphImage() {
  const source = path.join(sourceDirectory, "og-preview.png");
  const output = await sharp(source)
    .rotate()
    .resize(1200, 630, { fit: "cover" })
    .png({
      palette: true,
      colours: 32,
      quality: 70,
      compressionLevel: 9,
      dither: 0,
    })
    .toBuffer();
  const fileName = `og-preview-${contentHash(output)}.png`;
  await removeMatchingFiles(publicDirectory, /^og-preview-[a-f0-9]{10}\.png$/u);
  await writeCheckedFile(path.join(publicDirectory, fileName), output, 30_000);
  return fileName;
}

async function generateIcons() {
  const source = path.join(sourceDirectory, "samra-pay-icon-source.png");
  const iconNames = new Map();

  for (const size of [32, 180, 192, 512]) {
    const output = await sharp(source)
      .rotate()
      .resize(size, size, { fit: "contain" })
      .png({
        palette: true,
        colours: 64,
        quality: 100,
        compressionLevel: 9,
        dither: 0,
      })
      .toBuffer();
    const fileName = `samra-pay-icon-${size}-${contentHash(output)}.png`;
    await removeMatchingFiles(
      publicIconsDirectory,
      new RegExp(`^samra-pay-icon-${size}(?:-[a-f0-9]{10})?\\.png$`, "u"),
    );
    await writeCheckedFile(
      path.join(publicIconsDirectory, fileName),
      output,
      20_000,
    );
    iconNames.set(size, fileName);
  }

  return iconNames;
}

async function updateStaticReferences(ogFileName, iconNames) {
  const indexPath = path.join(packageRoot, "index.html");
  let index = await readFile(indexPath, "utf8");
  index = index.replace(/og-preview(?:-[a-f0-9]{10})?\.png/gu, ogFileName);
  for (const size of [32, 180]) {
    index = index.replace(
      new RegExp(`samra-pay-icon-${size}(?:-[a-f0-9]{10})?\\.png`, "gu"),
      iconNames.get(size),
    );
  }
  await writeFile(indexPath, index);

  const manifestPath = path.join(publicDirectory, "manifest.webmanifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.icons = [192, 512].map((size) => ({
    src: `/icons/${iconNames.get(size)}`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose: "any",
  }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function verifyGeneratedDimensions() {
  const expected = new Map([
    ["hero-woman-coffee-1200.webp", [1200, 1499]],
    ["proof-man-laptop-1200.webp", [1200, 675]],
    ["values-portrait-elder-v2-1000.webp", [1000, 1000]],
    ["values-portrait-man-v2-1000.webp", [1000, 1000]],
    ["values-portrait-woman-v2-1000.webp", [1000, 1000]],
    ["woman-with-phone-diaspora-1024.webp", [1024, 1024]],
    ["tibeb-pattern-gold-640.webp", [640, 640]],
  ]);

  for (const [name, [width, height]] of expected) {
    const metadata = await sharp(
      path.join(generatedDirectory, name),
    ).metadata();
    if (metadata.width !== width || metadata.height !== height) {
      throw new Error(
        `${name} is ${metadata.width}x${metadata.height}; expected ${width}x${height}`,
      );
    }
  }

  const ogCandidates = (await readdir(publicDirectory)).filter((name) =>
    /^og-preview-[a-f0-9]{10}\.png$/u.test(name),
  );
  if (ogCandidates.length !== 1) {
    throw new Error(
      `Expected one hashed Open Graph image, found ${ogCandidates.length}`,
    );
  }
  const ogMetadata = await sharp(
    path.join(publicDirectory, ogCandidates[0]),
  ).metadata();
  if (ogMetadata.width !== 1200 || ogMetadata.height !== 630) {
    throw new Error("Open Graph image must remain exactly 1200x630.");
  }
}

async function verifyGeneratedImageCeilings() {
  for (const name of expectedGeneratedFileNames()) {
    const bytes = (await stat(path.join(generatedDirectory, name))).size;
    if (bytes > 200_000) {
      throw new Error(
        `${name} exceeds the global 200 KB production image ceiling.`,
      );
    }
  }
}

async function main() {
  const fingerprint = await generationFingerprint();
  if (await generatedCacheIsCurrent(fingerprint)) {
    await verifyGeneratedDimensions();
    await verifyGeneratedImageCeilings();
    process.stdout.write("Public image derivatives are current.\n");
    return;
  }

  await generateResponsiveImages();
  const ogFileName = await generateOpenGraphImage();
  const iconNames = await generateIcons();
  await updateStaticReferences(ogFileName, iconNames);
  await verifyGeneratedDimensions();
  await verifyGeneratedImageCeilings();
  await writeFile(generationFingerprintPath, `${fingerprint}\n`);
}

await main();
