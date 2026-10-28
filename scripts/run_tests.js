#!/usr/bin/env node
/**
 * OMNITRIX ARENA — ULTIMATE EDITION
 * Zero-External-Network Automated Test Runner
 * Compiles TypeScript game engine, character data, and unit tests via Babel
 * into /tmp/omnitrix-test-dist (or local .test-dist) and executes the complete test suite.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.NODE_PATH) {
  process.env.NODE_PATH = '/usr/share/nodejs';
  require('module').Module._initPaths();
}

const babel = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(os.tmpdir(), 'omnitrix-test-dist-' + process.pid);

const FILES_TO_COMPILE = [
  'lib/types.ts',
  'lib/gameEngine.ts',
  'data/characters.ts',
  'tests/gameEngine.test.ts',
];

try {
  for (const relPath of FILES_TO_COMPILE) {
    const srcFile = path.join(ROOT, relPath);
    const dstFile = path.join(OUT_DIR, relPath.replace(/\.ts$/, '.js'));
    fs.mkdirSync(path.dirname(dstFile), { recursive: true });

    const transformed = babel.transformFileSync(srcFile, {
      filename: srcFile,
      presets: [require.resolve('@babel/preset-typescript')],
      plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    });

    fs.writeFileSync(dstFile, transformed.code, 'utf-8');
  }

  const { runAllGameEngineTests } = require(path.join(OUT_DIR, 'tests', 'gameEngine.test.js'));
  const summary = runAllGameEngineTests();

  console.log('==============================================================');
  console.log(' OMNITRIX ARENA — AUTOMATED GAME ENGINE & PRIVACY TEST SUITE');
  console.log('==============================================================');
  summary.results.forEach((line) => console.log('  ' + line));
  console.log('--------------------------------------------------------------');
  console.log(`  TOTAL: ${summary.passed}/${summary.total} TESTS PASSED`);
  console.log('==============================================================');

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
} catch (err) {
  console.error('Test runner failed:', err);
  process.exit(1);
}
