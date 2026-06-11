import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svg = `
<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="180" height="180" fill="#0f0e0d"/>
  <!-- Outer circle - the companion presence -->
  <circle cx="90" cy="90" r="56" fill="none" stroke="#e8e6e0" stroke-width="6"/>
  <!-- Inner light - the spark within -->
  <circle cx="90" cy="88" r="14" fill="#e8e6e0"/>
</svg>
`;

async function generateIcon() {
  try {
    const publicDir = path.join(__dirname, '../public');

    // Ensure public directory exists
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const outputPath = path.join(publicDir, 'apple-touch-icon.png');

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated apple-touch-icon.png (180x180px)`);
    console.log(`  Location: public/apple-touch-icon.png`);
  } catch (error) {
    console.error('✗ Error generating icon:', error.message);
    process.exit(1);
  }
}

generateIcon();
