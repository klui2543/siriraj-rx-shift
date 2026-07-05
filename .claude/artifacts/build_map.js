#!/usr/bin/env node
/* ============================================================
 * build_map.js — Auto-update system_map.html with fresh diagnostic data
 *
 * Workflow:
 *   1. clasp pull                                    (sync GAS code)
 *   2. Run devCheckOverlays() in GAS Editor          (produces JSON in Drive)
 *   3. Download JSON to Downloads folder
 *   4. node build_map.js <path-to-diagnostic.json>   (updates system_map.html)
 *   5. Open system_map.html in browser               (fresh counts!)
 *
 * Usage:
 *   node build_map.js <MapA_diagnostic.json> [system_map.html]
 *
 *   If [system_map.html] omitted, defaults to ./system_map.html in current dir.
 *
 * What it does:
 *   Replaces the <script id="diag-data"> block inside system_map.html
 *   with a compact JSON derived from the diagnostic. Everything else in
 *   the HTML (design, descriptions, categorizations) stays as-is.
 * ============================================================ */

const fs = require('fs');
const path = require('path');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }
  const jsonPath = path.resolve(args[0]);
  const htmlPath = args[1] ? path.resolve(args[1]) : path.resolve(process.cwd(), 'system_map.html');

  // ── 1. Validate input paths ──────────────────────────
  if (!fs.existsSync(jsonPath)) {
    err(`ไฟล์ JSON ไม่พบ: ${jsonPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(htmlPath)) {
    err(`system_map.html ไม่พบ: ${htmlPath}`);
    err(`(หา system_map.html ในโฟลเดอร์ปัจจุบัน หรือระบุ path เต็มเป็น arg ที่ 2)`);
    process.exit(1);
  }

  // ── 2. Read + parse ──────────────────────────────────
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    err(`JSON parse ล้มเหลว: ${e.message}`);
    process.exit(1);
  }
  const html = fs.readFileSync(htmlPath, 'utf8');

  // ── 3. Sanity check the JSON structure ───────────────
  if (!raw.metadata || !raw.sheets || !raw.firebase || !raw.functions) {
    err('ไฟล์ JSON ไม่ใช่ MapA diagnostic (ขาด metadata/sheets/firebase/functions)');
    process.exit(1);
  }

  // ── 4. Build the compact diag object ─────────────────
  const sheets = {};
  raw.sheets.forEach(s => {
    if (s.name) sheets[s.name] = { rows: s.rows || 0, cols: s.cols || 0 };
  });

  const probed = {};
  const probedPaths = raw.firebase.probedPaths || {};
  Object.keys(probedPaths).forEach(k => {
    probed[k] = { count: probedPaths[k].count || 0 };
  });

  const topLevelKeys = Array.isArray(raw.firebase.topLevelKeys) ? raw.firebase.topLevelKeys : [];

  const diag = {
    runAt: raw.metadata.runAt || new Date().toISOString(),
    runBy: raw.metadata.runBy || '(unknown)',
    sheets,
    firebase: { topLevelKeys, probed },
    functionsCount: Object.keys(raw.functions).length,
    propertiesCount: ((raw.scriptProperties && raw.scriptProperties.keys) || []).length
  };

  // ── 5. Regex-replace the diag-data block ─────────────
  const marker = /(<script id="diag-data" type="application\/json">)([\s\S]*?)(<\/script>)/;
  if (!marker.test(html)) {
    err('ไม่พบ <script id="diag-data"> ใน system_map.html');
    err('(HTML นี้อาจเป็น version เก่าที่ไม่รองรับ auto-update — download version ใหม่จาก artifact URL)');
    process.exit(2);
  }
  const compactJson = JSON.stringify(diag, null, 2);
  const updated = html.replace(marker, `$1\n${compactJson}\n$3`);

  // ── 6. Write back ────────────────────────────────────
  fs.writeFileSync(htmlPath, updated, 'utf8');

  // ── 7. Report ────────────────────────────────────────
  const sheetCount = Object.keys(sheets).length;
  const fbTop = topLevelKeys.length;
  const fbProbedActive = Object.values(probed).filter(x => x.count > 0).length;
  const fbProbedEmpty = Object.values(probed).filter(x => x.count === 0).length;
  const fnCount = diag.functionsCount;

  console.log(`${GREEN}✅ อัปเดตสำเร็จ${RESET}  ${DIM}${htmlPath}${RESET}`);
  console.log('');
  console.log(`  ${BOLD}Sheets:${RESET}       ${sheetCount}`);
  console.log(`  ${BOLD}Firebase:${RESET}     ${fbTop} top-level keys  ${DIM}(${fbProbedActive} มีข้อมูล · ${fbProbedEmpty} ว่าง)${RESET}`);
  console.log(`  ${BOLD}Functions:${RESET}    ${fnCount}`);
  console.log(`  ${BOLD}Run at:${RESET}       ${diag.runAt}`);
  console.log(`  ${BOLD}Run by:${RESET}       ${diag.runBy}`);
  console.log('');
  console.log(`  ${DIM}เปิด system_map.html ในเบราว์เซอร์เพื่อดู system map ใหม่${RESET}`);
}

function printHelp() {
  console.log(`${BOLD}build_map.js${RESET}  ·  อัปเดต system_map.html จาก MapA diagnostic JSON`);
  console.log('');
  console.log(`${BOLD}Usage:${RESET}`);
  console.log(`  node build_map.js ${YELLOW}<MapA_diagnostic.json>${RESET} [system_map.html]`);
  console.log('');
  console.log(`${BOLD}Example:${RESET}`);
  console.log(`  ${DIM}# ปกติ (HTML อยู่ในโฟลเดอร์ปัจจุบัน)${RESET}`);
  console.log(`  node build_map.js ~/Downloads/MapA_diagnostic_20260710_143022.json`);
  console.log('');
  console.log(`  ${DIM}# ระบุ HTML path เอง${RESET}`);
  console.log(`  node build_map.js ./data.json ./web/map.html`);
  console.log('');
  console.log(`${BOLD}Workflow:${RESET}`);
  console.log(`  1. ${DIM}clasp pull${RESET}                              ${DIM}# sync GAS code${RESET}`);
  console.log(`  2. ${DIM}Run devCheckOverlays() ใน GAS Editor${RESET}    ${DIM}# get fresh JSON in Drive${RESET}`);
  console.log(`  3. ${DIM}ดาวน์โหลด JSON${RESET}                          ${DIM}# to Downloads/${RESET}`);
  console.log(`  4. ${DIM}node build_map.js <json-path>${RESET}           ${DIM}# update HTML${RESET}`);
  console.log(`  5. ${DIM}เปิด system_map.html${RESET}                    ${DIM}# see updated map${RESET}`);
}

function err(msg) {
  console.error(`${RED}❌ ${msg}${RESET}`);
}

main();
