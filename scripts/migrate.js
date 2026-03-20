#!/usr/bin/env node
/**
 * Migration script: Upload local images + tags to Cloudflare R2 + D1
 *
 * Usage:
 *   node scripts/migrate.js --images ./imgs/PJH --tags ./tags/PJH_tags
 *
 * Prerequisites:
 *   npm install sharp @cloudflare/wrangler (wrangler must be logged in)
 *   npm install sharp uuid
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Parse CLI args
const args = process.argv.slice(2);
let imagesDir = null;
let tagsDir = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--images' && args[i + 1]) imagesDir = args[++i];
  if (args[i] === '--tags' && args[i + 1]) tagsDir = args[++i];
}

if (!imagesDir || !tagsDir) {
  console.error('Usage: node scripts/migrate.js --images <dir> --tags <dir>');
  process.exit(1);
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const DB_NAME = 'tag-supporter-db';
const BUCKET_NAME = 'tag-supporter-images';

async function main() {
  // List image files
  const files = fs.readdirSync(imagesDir)
    .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort();

  console.log(`Found ${files.length} images in ${imagesDir}`);

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.warn('Warning: sharp not installed. Thumbnails will not be generated.');
    console.warn('Install with: npm install sharp');
    sharp = null;
  }

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const id = crypto.randomUUID();
    const imagePath = path.join(imagesDir, filename);
    const tagFilePath = path.join(tagsDir, nameWithoutExt + '.txt');
    const r2Key = `originals/${filename}`;

    console.log(`[${i + 1}/${files.length}] Processing ${filename}...`);

    // 1. Upload original to R2
    try {
      execSync(
        `npx wrangler r2 object put "${BUCKET_NAME}/${r2Key}" --file="${imagePath}" --content-type="image/${path.extname(filename).slice(1)}" --remote`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      console.error(`  Failed to upload ${filename}: ${e.message}`);
      continue;
    }

    // 2. Generate and upload thumbnail
    let thumbKey = null;
    if (sharp) {
      try {
        const thumbName = nameWithoutExt + '.webp';
        thumbKey = `thumbs/${thumbName}`;
        const tmpThumbPath = path.join(require('os').tmpdir(), thumbName);

        await sharp(imagePath)
          .resize(150, null, { withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(tmpThumbPath);

        execSync(
          `npx wrangler r2 object put "${BUCKET_NAME}/${thumbKey}" --file="${tmpThumbPath}" --content-type="image/webp" --remote`,
          { stdio: 'pipe' }
        );

        fs.unlinkSync(tmpThumbPath);
      } catch (e) {
        console.warn(`  Warning: thumbnail failed for ${filename}: ${e.message}`);
        thumbKey = null;
      }
    }

    // 3. Read tags
    let tags = [];
    if (fs.existsSync(tagFilePath)) {
      const content = fs.readFileSync(tagFilePath, 'utf-8').trim();
      if (content) {
        tags = content.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }
    }

    // 4. Check for duplicate filename in D1
    try {
      const checkResult = execSync(
        `npx wrangler d1 execute ${DB_NAME} --remote --command="SELECT id FROM images WHERE filename = '${filename}'" --json`,
        { stdio: 'pipe', encoding: 'utf-8' }
      );
      const parsed = JSON.parse(checkResult);
      if (parsed[0]?.results?.length > 0) {
        console.log(`  Skipped (already exists in DB)`);
        continue;
      }
    } catch (e) {
      // If check fails, proceed with insert (UNIQUE constraint will catch duplicates)
    }

    // 5. Insert into D1
    const fileSize = fs.statSync(imagePath).size;
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    // Insert image record
    const insertImageSQL = `INSERT OR IGNORE INTO images (id, filename, r2_key, thumb_key, mime_type, file_size) VALUES ('${id}', '${filename}', '${r2Key}', ${thumbKey ? `'${thumbKey}'` : 'NULL'}, '${mimeType}', ${fileSize})`;

    try {
      execSync(
        `npx wrangler d1 execute ${DB_NAME} --remote --command="${insertImageSQL}"`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      console.error(`  Failed to insert image record: ${e.message}`);
      continue;
    }

    // Insert tags
    if (tags.length > 0) {
      const tagValues = tags.map((tag, pos) =>
        `('${id}', '${tag.replace(/'/g, "''")}', ${pos})`
      ).join(', ');
      const insertTagsSQL = `INSERT OR IGNORE INTO tags (image_id, tag, position) VALUES ${tagValues}`;

      try {
        execSync(
          `npx wrangler d1 execute ${DB_NAME} --remote --command="${insertTagsSQL}"`,
          { stdio: 'pipe' }
        );
      } catch (e) {
        console.error(`  Failed to insert tags: ${e.message}`);
      }
    }

    console.log(`  Done. (${tags.length} tags)`);
  }

  console.log('\nMigration complete!');
}

main().catch(console.error);
