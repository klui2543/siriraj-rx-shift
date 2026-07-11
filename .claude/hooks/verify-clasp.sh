#!/bin/bash
# verify-clasp.sh — ตรวจว่า .claspignore กันไฟล์ที่ไม่ใช่ GAS ครบไหม (รันเมื่อไหร่ก็ได้)
# ใช้ `clasp status` (ไม่ต้อง login) list ไฟล์ที่จะ push จริง แล้วเช็คว่าไม่มีของหลุด
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 1

CLASP=""
command -v clasp >/dev/null 2>&1 && CLASP="clasp"
[ -z "$CLASP" ] && [ -x node_modules/.bin/clasp ] && CLASP="node_modules/.bin/clasp"
[ -z "$CLASP" ] && command -v npx >/dev/null 2>&1 && CLASP="npx clasp"
[ -z "$CLASP" ] && { echo "‼️ ไม่พบ clasp — ติดตั้งก่อน: npm i -g @google/clasp"; exit 1; }

OUT="$($CLASP status 2>/dev/null)"
TRACKED="$(printf '%s\n' "$OUT" | awk '/Tracked files:/{f=1;next} /Untracked files:/{f=0} f' | grep '└─' | sed 's/└─ //')"
COUNT="$(printf '%s\n' "$TRACKED" | grep -c . || true)"

# ของที่ "ไม่ควร" หลุดขึ้น GAS
LEAK="$(printf '%s\n' "$TRACKED" | grep -iE '/|\.md$|\.txt$|HANDOFF|\.claude|docs|node_modules' || true)"

echo "📦 ไฟล์ที่จะ push ขึ้น GAS: ${COUNT} ไฟล์"
if [ -n "$LEAK" ]; then
  echo "‼️ พบไฟล์ที่ไม่ควรขึ้น GAS หลุดเข้ามา — ต้องแก้ .claspignore:"
  printf '%s\n' "$LEAK" | sed 's/^/   - /'
  exit 2
else
  echo "✅ สะอาด — ไม่มีเอกสาร/ไฟล์ subdir/node_modules หลุด (.claspignore ทำงานถูกต้อง)"
fi
