#!/bin/bash
# Stop hook: auto `clasp push` ขึ้น GAS หลังโค้ดถูกแก้โดย Claude Code
# เป้าหมาย: โค้ดบน GAS = โค้ดล่าสุดที่ Claude อัพเดทเสมอ โดยไม่ต้อง copy-paste เอง
# ปลอดภัย: ถ้าไม่มี clasp / ไม่มี auth (เช่น cloud ที่ยังไม่ setup) จะข้ามเงียบ ไม่ error
# กัน push ซ้ำ: ถ้าไฟล์ต้นฉบับ (ไม่นับ _SYNC_STAMP.js) ไม่เปลี่ยนจากครั้งก่อน จะไม่ push
# stamp: ก่อน push จะปั๊มเวลา push จริง + commit + branch ลง _SYNC_STAMP.js อัตโนมัติ
set -uo pipefail

STAMP_FILE="_SYNC_STAMP.js"
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

# --- ตรวจว่าโค้ดเปลี่ยนไหม (ไม่นับ _SYNC_STAMP.js เพื่อกันวนลูป push ไม่รู้จบ) ---
HASH_FILE=".claude/.last-clasp-push.hash"
CUR_HASH="$(find . -type f \( -name '*.js' -o -name '*.gs' -o -name '*.html' -o -name '*.json' \) \
  -not -path './node_modules/*' -not -path './.git/*' -not -path './.claude/*' \
  -not -name '.clasp.json' -not -name "$STAMP_FILE" \
  -exec sha1sum {} + 2>/dev/null | LC_ALL=C sort | sha1sum | awk '{print $1}')"
PREV_HASH="$(cat "$HASH_FILE" 2>/dev/null || echo '')"
if [ "$CUR_HASH" = "$PREV_HASH" ]; then
  exit 0   # ไม่มีการเปลี่ยนแปลงโค้ด -> ไม่ต้อง push
fi

# --- ปั๊ม stamp ด้วยเวลา push จริง ก่อน push (เพื่อให้ของบน GAS มีเวลาที่ถูกต้อง) ---
if [ -f "$STAMP_FILE" ]; then
  NOW_TS="$(TZ=Asia/Bangkok date '+%Y-%m-%d %H:%M %z' 2>/dev/null || date '+%Y-%m-%d %H:%M %z' 2>/dev/null || echo '')"
  BR="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
  CM="$(git rev-parse --short HEAD 2>/dev/null || echo '')"
  [ -n "$NOW_TS" ] && sed -i -E "s|(updated:[[:space:]]*')[^']*(')|\1${NOW_TS}\2|" "$STAMP_FILE" 2>/dev/null || true
  [ -n "$BR" ]     && sed -i -E "s|(branch:[[:space:]]*')[^']*(')|\1${BR}\2|" "$STAMP_FILE" 2>/dev/null || true
  [ -n "$CM" ]     && sed -i -E "s|(based_on_commit:[[:space:]]*')[^']*(')|\1${CM}\2|" "$STAMP_FILE" 2>/dev/null || true
fi

# --- push ขึ้น GAS ---
OUT="$($CLASP push -f 2>&1)"; RC=$?
if [ "$RC" -eq 0 ]; then
  mkdir -p .claude
  printf '%s' "$CUR_HASH" > "$HASH_FILE"
  # commit stamp ที่เพิ่งปั๊ม (เฉพาะไฟล์ stamp) เพื่อให้ Git ตรงกับ GAS — ไม่ push git ให้อัตโนมัติ
  if [ -f "$STAMP_FILE" ] && ! git diff --quiet "$STAMP_FILE" 2>/dev/null; then
    git add "$STAMP_FILE" 2>/dev/null && \
      git commit -q -m "chore(stamp): ปั๊มเวลา push จริง ${NOW_TS}" 2>/dev/null || true
  fi
  NFILES="$(printf '%s' "$OUT" | grep -oiE 'Pushed [0-9]+' | grep -oE '[0-9]+' | head -1)"
  TOPIC="$(grep 'topic:' "$STAMP_FILE" 2>/dev/null | head -1 | sed -E "s/.*topic:[^']*'//; s/'.*//")"
  echo "✅ clasp push สำเร็จ — ขึ้น GAS แล้ว ${NFILES:+(${NFILES} ไฟล์) }พร้อมทดสอบ"
  [ -n "$TOPIC" ] && echo "   📌 หัวข้อเวอร์ชันนี้: ${TOPIC} | stamp: ${NOW_TS}"
  echo "   ℹ️ stamp commit ยังไม่ push ขึ้น Git — ตัวเตือน hygiene จะแจ้งให้ push (หรือ push พร้อมงานถัดไป)"
else
  echo "‼️ clasp push ไม่สำเร็จ (RC=$RC) — โค้ดบน GAS ยังไม่อัพเดท ต้อง push เอง:"
  printf '%s\n' "$OUT" | tail -6
fi

# --- push โปรเจกต์ Calendar แยก (calendar-sync-app/) แยก scriptId ของตัวเอง ---
# มี hash gate ของตัวเอง → push เฉพาะตอนไฟล์เคาน์เตอร์เปลี่ยน (ไม่ push ซ้ำทุกครั้ง)
# ปลอดภัย: อยู่หลังการ push แอปหลัก + จบด้วย exit 0 เสมอ ไม่กระทบ flow หลัก
CAL_DIR="$PROJECT_DIR/calendar-sync-app"
if [ -f "$CAL_DIR/.clasp.json" ]; then
  CAL_HASH_FILE=".claude/.last-clasp-push-calendar.hash"
  CAL_CUR_HASH="$(find "$CAL_DIR" -type f \( -name '*.js' -o -name '*.html' -o -name 'appsscript.json' \) \
    -exec sha1sum {} + 2>/dev/null | LC_ALL=C sort | sha1sum | awk '{print $1}')"
  CAL_PREV_HASH="$(cat "$CAL_HASH_FILE" 2>/dev/null || echo '')"
  if [ "$CAL_CUR_HASH" != "$CAL_PREV_HASH" ]; then
    CAL_CLASP="$(command -v clasp 2>/dev/null || true)"
    if [ -n "$CAL_CLASP" ]; then
      CAL_OUT="$( cd "$CAL_DIR" && "$CAL_CLASP" push -f 2>&1 )"; CAL_RC=$?
      if [ "$CAL_RC" -eq 0 ]; then
        mkdir -p .claude; printf '%s' "$CAL_CUR_HASH" > "$CAL_HASH_FILE"
        echo "✅ clasp push (calendar-sync-app) สำเร็จ"
        # อัปเดต /exec deployment เดิม → /exec ได้โค้ดล่าสุดทันที (URL คงเดิม) ไม่ต้องกด deploy เอง
        CAL_DEPLOY_ID="AKfycbxcH2114uAenaK6Gcy1YL_uzJv8p2IYzPQxtOZXOV47ndguYPYWqqyu3Ntc1x8VUBM1fw"
        DOUT="$( cd "$CAL_DIR" && "$CAL_CLASP" deploy -i "$CAL_DEPLOY_ID" -d auto 2>&1 )"; DRC=$?
        if [ "$DRC" -eq 0 ]; then echo "✅ clasp deploy (calendar /exec) อัพเดตแล้ว"; else echo "⚠️ deploy calendar /exec ไม่สำเร็จ:"; printf '%s\n' "$DOUT" | tail -3; fi
      else
        echo "‼️ clasp push (calendar-sync-app) ไม่สำเร็จ:"; printf '%s\n' "$CAL_OUT" | tail -4
      fi
    fi
  fi
fi
exit 0
