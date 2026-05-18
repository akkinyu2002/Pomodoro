const sharp = require('sharp');
const path = require('path');

// Sizes to generate (common PWA / Apple touch sizes)
const sizes = [72, 96, 128, 144, 152, 180, 192, 256, 384, 512];

async function genFromSvg(svgPath, outDir) {
  const basename = path.basename(svgPath, path.extname(svgPath));
  for (const size of sizes) {
    const out = path.join(outDir, `icon-${size}.png`);
    await sharp(svgPath)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toFile(out);
    console.log(`Wrote ${out}`);
  }
}

(async () => {
  try {
    await genFromSvg('icons/icon-192.svg', 'icons');
    // Also generate from the larger source to ensure good quality for big sizes
    await genFromSvg('icons/icon-512.svg', 'icons');
    console.log('All icon sizes generated in icons/');
  } catch (err) {
    console.error('Conversion failed:', err);
    process.exit(1);
  }
})();