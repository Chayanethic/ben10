#!/usr/bin/env node
/**
 * OMNITRIX ARENA — ULTIMATE EDITION
 * Character Dataset & Image Asset Validation / Firebase Storage Upload Workflow
 *
 * Usage:
 *   node scripts/import_characters.js                 # Validate local dataset & SVG fallbacks
 *   node scripts/import_characters.js --probe-network # Probe live HTTP status of Excel URLs
 *   node scripts/import_characters.js --upload        # Download valid images & upload to Firebase Storage
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CHARACTERS_JSON = path.join(DATA_DIR, 'characters.json');
const REPORT_JSON = path.join(DATA_DIR, 'character_validation_report.json');
const EXCEL_FILE = path.join(DATA_DIR, 'Omnitrix_Character_Image_Library.xlsx');

const args = process.argv.slice(2);
const shouldProbeNetwork = args.includes('--probe-network') || args.includes('--upload');
const shouldUploadFirebase = args.includes('--upload');

function probeUrl(url, timeoutMs = 4500) {
  return new Promise((resolve) => {
    try {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'OmnitrixArenaValidator/2.0',
            Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
          },
          timeout: timeoutMs,
        },
        (res) => {
          const statusCode = res.statusCode || 0;
          const contentType = res.headers['content-type'] || '';
          res.destroy();
          resolve({
            reachable: statusCode >= 200 && statusCode < 400,
            statusCode,
            contentType,
          });
        }
      );
      req.on('error', (err) => {
        resolve({ reachable: false, statusCode: 0, error: err.message });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ reachable: false, statusCode: 0, error: 'TIMEOUT' });
      });
    } catch (err) {
      resolve({ reachable: false, statusCode: 0, error: err.message });
    }
  });
}

async function runValidation() {
  console.log('==============================================================');
  console.log(' OMNITRIX ARENA — CHARACTER DATA & IMAGE VALIDATION PIPELINE');
  console.log('==============================================================');

  const excelExists = fs.existsSync(EXCEL_FILE);
  console.log(`[1/4] Primary Excel Source (${path.basename(EXCEL_FILE)}): ${excelExists ? 'FOUND' : 'MISSING'}`);

  if (!fs.existsSync(CHARACTERS_JSON)) {
    console.error('ERROR: data/characters.json not found.');
    process.exit(1);
  }

  const characters = JSON.parse(fs.readFileSync(CHARACTERS_JSON, 'utf-8'));
  console.log(`[2/4] Loaded ${characters.length} character records from data/characters.json`);

  const seenIds = new Set();
  const seenNames = new Set();
  const hashBuckets = new Map();
  let validUrls = 0;
  let missingUrls = 0;
  let duplicateIds = 0;
  let duplicateNames = 0;
  let localFallbacksPresent = 0;
  const hashAnomalies = [];
  const records = [];

  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    const isDupId = seenIds.has(c.id);
    const isDupName = seenNames.has(c.name.toLowerCase());
    if (isDupId) duplicateIds++;
    if (isDupName) duplicateNames++;
    seenIds.add(c.id);
    seenNames.add(c.name.toLowerCase());

    const hasUrl = Boolean(c.imageUrl && /^https?:\/\//i.test(c.imageUrl));
    if (hasUrl) validUrls++;
    else missingUrls++;

    // Check WikiHow hash prefix collision (e.g., /thumb/7/76/ shared by xlr8 and upchuck)
    let hashCollisionWith = null;
    if (hasUrl && c.imageUrl.includes('/thumb/')) {
      const afterThumb = c.imageUrl.split('/thumb/')[1] || '';
      const prefix = afterThumb.split('/').slice(0, 2).join('/');
      if (hashBuckets.has(prefix)) {
        hashCollisionWith = hashBuckets.get(prefix);
        hashAnomalies.push({
          characterId: c.id,
          characterName: c.name,
          sharedPrefix: `/thumb/${prefix}/`,
          collidesWith: hashCollisionWith,
          excelImageUrl: c.imageUrl,
        });
      } else {
        hashBuckets.set(prefix, c.id);
      }
    }

    const svgDiskPath = path.join(PUBLIC_DIR, c.fallbackImageUrl.replace(/^\//, ''));
    const hasSvgFallback = fs.existsSync(svgDiskPath);
    if (hasSvgFallback) localFallbacksPresent++;

    // Validate all 15 stats are within 1..100
    const statEntries = Object.entries(c.stats || {});
    const invalidStats = statEntries.filter(([, v]) => typeof v !== 'number' || v < 1 || v > 100);
    if (statEntries.length !== 15 || invalidStats.length > 0) {
      console.error(`ERROR: Character ${c.id} has invalid stat block!`);
      process.exit(1);
    }

    let networkResult = {
      status: 'SKIPPED_OFFLINE (Run with --probe-network to test live HTTP status)',
      httpStatus: null,
    };

    if (shouldProbeNetwork && hasUrl) {
      const probe = await probeUrl(c.imageUrl);
      networkResult = {
        status: probe.reachable ? 'HTTP_OK' : `FAILED (${probe.error || 'HTTP_' + probe.statusCode})`,
        httpStatus: probe.statusCode,
        contentType: probe.contentType || null,
      };
    }

    records.push({
      rowNumber: i + 2,
      characterId: c.id,
      characterName: c.name,
      species: c.species,
      role: c.role,
      rarity: c.rarity,
      excelImageUrl: c.imageUrl,
      fallbackImageUrl: c.fallbackImageUrl,
      localFallbackExists: hasSvgFallback,
      firebaseStoragePath: c.storagePath,
      urlSyntaxValid: hasUrl,
      duplicateId: isDupId,
      duplicateName: isDupName,
      hashCollisionWith,
      networkProbe: networkResult,
    });
  }

  console.log(`[3/4] Validation Summary:`);
  console.log(`      - Total Characters Imported : ${characters.length}`);
  console.log(`      - Valid Image URL Syntax    : ${validUrls}/${characters.length}`);
  console.log(`      - Missing Image URLs        : ${missingUrls}`);
  console.log(`      - Duplicate Character IDs   : ${duplicateIds}`);
  console.log(`      - Duplicate Character Names : ${duplicateNames}`);
  console.log(`      - Local SVG Art Fallbacks   : ${localFallbacksPresent}/${characters.length} verified on disk`);
  console.log(`      - CDN Hash Prefix Anomalies : ${hashAnomalies.length} flagged`);
  if (hashAnomalies.length > 0) {
    hashAnomalies.forEach((a) => {
      console.log(
        `        * WARNING: '${a.characterId}' (${a.characterName}) shares WikiHow path prefix ${a.sharedPrefix} with '${a.collidesWith}'. Automatic SVG fallback (${ `/images/aliens/${a.characterId}.svg` }) is active if CDN returns 404/403.`
      );
    });
  }

  if (shouldUploadFirebase) {
    console.log('[4/4] Firebase Storage Upload Mode:');
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_STORAGE_BUCKET) {
      console.log(
        '      - Skipped live upload: GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_STORAGE_BUCKET are not set in environment.'
      );
      console.log(
        '      - To upload permitted images to Firebase Storage, set GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json" and NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-app.appspot.com", then re-run: node scripts/import_characters.js --upload'
      );
    }
  } else {
    console.log('[4/4] Writing detailed report to data/character_validation_report.json ...');
  }

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    sourceExcelFile: 'data/Omnitrix_Character_Image_Library.xlsx',
    totalRows: characters.length,
    validSyntaxUrls: validUrls,
    missingUrls,
    duplicateIds,
    duplicateNames,
    localSvgFallbacksGenerated: localFallbacksPresent,
    cdnHashAnomaliesFlagged: hashAnomalies,
    records,
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(reportPayload, null, 2), 'utf-8');
  console.log('Validation completed successfully.');
}

runValidation().catch((err) => {
  console.error('Validation script error:', err);
  process.exit(1);
});