#!/usr/bin/env node
/**
 * Regenerate thumbnails for all images already in R2.
 *
 * Downloads each original from R2, generates a 512x512 WebP thumbnail,
 * and re-uploads it to R2 (overwriting the old thumb).
 *
 * Usage:
 *   node scripts/regen-thumbs.js
 *
 * Prerequisites:
 *   npm install sharp
 *   wrangler must be logged in
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_NAME = 'tag-supporter-db';
const BUCKET_NAME = 'tag-supporter-images';
const THUMB_SIZE = 512;
const WEBP_QUALITY = 90;

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Error: sharp is required. Install with: npm install sharp');
    process.exit(1);
  }

  // 1. Get all images from D1
  console.log('Fetching image list from D1...');
  const result = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --command="SELECT id, filename, r2_key FROM images ORDER BY filename" --json`,
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const parsed = JSON.parse(result);
  const images = parsed[0]?.results || [];
  console.log(`Found ${images.length} images.\n`);

  const tmpDir = path.join(os.tmpdir(), 'regen-thumbs-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  let success = 0;
  let failed = 0;

  for (let i = 0; i < images.length; i++) {
    const { id, filename, r2_key } = images[i];
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const thumbName = nameWithoutExt + '.webp';
    const thumbKey = `thumbs/${thumbName}`;
    const tmpOriginal = path.join(tmpDir, filename);
    const tmpThumb = path.join(tmpDir, thumbName);

    process.stdout.write(`[${i + 1}/${images.length}] ${filename}... `);

    try {
      // Download original from R2
      execSync(
        `npx wrangler r2 object get "${BUCKET_NAME}/${r2_key}" --file="${tmpOriginal}" --remote`,
        { stdio: 'pipe' }
      );

      // Generate 512x512 thumbnail
      await sharp(tmpOriginal)
        .resize(THUMB_SIZE, THUMB_SIZE, {
          fit: 'cover',
          position: 'left top',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toFile(tmpThumb);

      // Upload thumbnail to R2
      execSync(
        `npx wrangler r2 object put "${BUCKET_NAME}/${thumbKey}" --file="${tmpThumb}" --content-type="image/webp" --remote`,
        { stdio: 'pipe' }
      );

      // Update D1 thumb_key if null
      execSync(
        `npx wrangler d1 execute ${DB_NAME} --remote --command="UPDATE images SET thumb_key = '${thumbKey}' WHERE id = '${id}'"`,
        { stdio: 'pipe' }
      );

      // Cleanup temp files
      if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal);
      if (fs.existsSync(tmpThumb)) fs.unlinkSync(tmpThumb);

      console.log('OK');
      success++;
    } catch (e) {
      console.log(`FAILED (${e.message})`);
      failed++;
      if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal);
      if (fs.existsSync(tmpThumb)) fs.unlinkSync(tmpThumb);
    }
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\nDone! ${success} succeeded, ${failed} failed.`);
}

main().catch(console.error);
