#!/bin/bash
# Stop hook: auto `clasp push` ขึ้น GAS หลังโค้ดถูกแก้โดย Claude Code
# เป้าหมาย: โค้ดบน GAS = โค้ดล่าสุดที่ Claude อัพเดทเสมอ โดยไม่ต้อง copy-paste เอง
# ปลอดภัย: ถ้าไม่มี clasp / ไม่มี auth (เช่น cloud ที่ยังไม่ setup) จะข้ามเงียบ ไม่ error
# กัน push ซ้ำ: ถ้าไฟล์ต้นฉบับไม่เปลี่ยนจากครั้งก่อน จะไม่ push
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# ต้องเป็นโปรเจกต์ clasp
[ -f .clasp.json ] || exit 0

# หา clasp (global ก่อน แล้วค่อย local node_modules)
CLASP=""
if command -v clasp >/dev/null 2>&1; then
  CLASP="clasp"
elif [ -x node_modules/.bin/clasp ]; then
  CLASP="node_modules/.bin/clasp"
fi
[ -n "$CLASP" ] || exit 0   # ไม่มี clasp -> ข้าม

# ต้อง authenticated (global หรือ per-project)
[ -f "$HOME/.clasprc.json" ] || [ -f ./.clasprc.json ] || exit 0

# --- ตรวจว่าไฟล์ที่ clasp จะ push เปลี่ยนไหม ---
HASH_FILE=".claude/.last-clasp-push.hash"
CUR_HASH="$(find . -type f \( -name '*.js' -o -name '*.gs' -o -name '*.html' -o -name '*.json' \) \
  -not -path './node_modules/*' -not -path './.git/*' -not -path './.claude/*' -not -name '.clasp.json' \
  -exec sha1sum {} + 2>/dev/null | LC_ALL=C sort | sha1sum | awk '{print $1}')"
PREV_HASH="$(cat "$HASH_FILE" 2>/dev/null || echo '')"
if [ "$CUR_HASH" = "$PREV_HASH" ]; then
  exit 0   # ไม่มีการเปลี่ยนแปลงโค้ด -> ไม่ต้อง push
fi

# --- push ขึ้น GAS ---
OUT="$($CLASP push -f 2>&1)"; RC=$?
if [ "$RC" -eq 0 ]; then
  mkdir -p .claude
  printf '%s' "$CUR_HASH" > "$HASH_FILE"
  echo "✅ clasp push สำเร็จ — โค้ดล่าสุดขึ้น GAS แล้ว พร้อมให้ทดสอบได้เลย"
else
  echo "‼️ clasp push ไม่สำเร็จ (RC=$RC) — โค้ดบน GAS ยังไม่อัพเดท ต้อง push เอง:"
  printf '%s\n' "$OUT" | tail -6
fi
exit 0
