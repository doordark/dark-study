const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_PLACEHOLDER = 'package __PACKAGE__';
const TARGET_PACKAGE = 'package com.darkstudy.app';

const PAIRS = [
  {
    name: 'CourseWidget.kt',
    template: 'plugins/course-widget/CourseWidget.kt',
    target: 'android/app/src/main/java/com/darkstudy/app/CourseWidget.kt',
  },
  {
    name: 'WhaleOverlay.kt',
    template: 'plugins/whale-overlay/WhaleOverlay.kt',
    target: 'android/app/src/main/java/com/darkstudy/app/WhaleOverlay.kt',
  },
];

function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function summarizeDiff(expectedText, actualText) {
  const expectedLines = expectedText.split('\n');
  const actualLines = actualText.split('\n');
  const maxLen = Math.max(expectedLines.length, actualLines.length);
  const diffs = [];
  for (let i = 0; i < maxLen; i += 1) {
    if (expectedLines[i] !== actualLines[i]) {
      diffs.push({
        line: i + 1,
        expected: expectedLines[i],
        actual: actualLines[i],
      });
      if (diffs.length >= 5) break;
    }
  }
  const lines = [
    `  line count: expected ${expectedLines.length} (template), actual ${actualLines.length} (android)`,
  ];
  for (const item of diffs) {
    lines.push(`  line ${item.line}:`);
    lines.push(`    - template: ${item.expected === undefined ? '<EOF>' : JSON.stringify(item.expected)}`);
    lines.push(`    + android : ${item.actual === undefined ? '<EOF>' : JSON.stringify(item.actual)}`);
  }
  return lines.join('\n');
}

let failures = 0;

for (const pair of PAIRS) {
  const templatePath = path.join(ROOT, pair.template);
  const targetPath = path.join(ROOT, pair.target);

  if (!fs.existsSync(templatePath)) {
    console.error(`FAIL [${pair.name}]: missing plugin template ${pair.template}`);
    failures += 1;
    continue;
  }
  if (!fs.existsSync(targetPath)) {
    console.error(`FAIL [${pair.name}]: missing Android target ${pair.target}`);
    failures += 1;
    continue;
  }

  const templateRaw = normalizeEol(fs.readFileSync(templatePath, 'utf8'));
  const targetNormalized = normalizeEol(fs.readFileSync(targetPath, 'utf8'));

  if (!templateRaw.includes(PACKAGE_PLACEHOLDER)) {
    console.error(
      `FAIL [${pair.name}]: plugin template ${pair.template} does not contain expected "${PACKAGE_PLACEHOLDER}" header`,
    );
    failures += 1;
    continue;
  }

  const expectedNormalized = templateRaw.replaceAll(PACKAGE_PLACEHOLDER, TARGET_PACKAGE);

  if (expectedNormalized !== targetNormalized) {
    console.error(`FAIL [${pair.name}]: plugin template and Android source have diverged`);
    console.error(`  template: ${pair.template}`);
    console.error(`  android : ${pair.target}`);
    console.error(summarizeDiff(expectedNormalized, targetNormalized));
    console.error(`  hint: sync edits between ${pair.template} and ${pair.target} (keeping "${PACKAGE_PLACEHOLDER}" in plugins/).`);
    failures += 1;
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log(`PASS: native Kotlin sync verified (${PAIRS.map(pair => pair.name).join(', ')})`);
