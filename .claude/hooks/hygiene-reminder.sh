#!/bin/bash
# UserPromptSubmit hook: เตือน git hygiene เป็นพักๆ เพื่อกัน "ไฟล์เละ"/งานหาย
# เตือนเมื่อ (มีไฟล์ยังไม่ commit / มี commit ยังไม่ push / กิ่งนำหน้า main ยังไม่รวม)
# และห่างจากการเตือนครั้งก่อน >= 30 นาที (ไม่รบกวนทุกข้อความ)
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

THROTTLE=1800   # วินาที = 30 นาที
STAMP=".claude/.last-hygiene-reminder"
NOW="$(date +%s 2>/dev/null || echo 0)"
LAST="$(cat "$STAMP" 2>/dev/null || echo 0)"
if [ "$NOW" -ne 0 ] && [ "$LAST" -ne 0 ] && [ $((NOW - LAST)) -lt "$THROTTLE" ]; then
  exit 0   # ยังไม่ถึงเวลาเตือนรอบใหม่
fi

ISSUES=""
CUR_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"

# (1) ไฟล์ที่แก้แล้วยังไม่ commit
DIRTY="$(git status --porcelain 2>/dev/null | grep -c . || true)"
if [ "${DIRTY:-0}" -gt 0 ]; then
  ISSUES="${ISSUES}
- 📝 มี ${DIRTY} ไฟล์ที่แก้แล้วยังไม่ commit → ควร \`git add -A && git commit -m \"...\"\`"
fi

# (2) commit ที่ยังไม่ push
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '')"
if [ -n "$UPSTREAM" ]; then
  UNPUSHED="$(git rev-list --count "${UPSTREAM}..HEAD" 2>/dev/null || echo 0)"
  if [ "${UNPUSHED:-0}" -gt 0 ]; then
    ISSUES="${ISSUES}
- ⬆️ มี ${UNPUSHED} commit ยังไม่ push → \`git push\` กันงานหาย + ให้เครื่องอื่นดึงได้"
  fi
fi

# (3) อยู่บนกิ่งอื่นที่นำหน้า main (งานยังไม่ถูกรวม)
if [ "$CUR_BRANCH" != "main" ] && git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
  AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
  if [ "${AHEAD:-0}" -gt 0 ]; then
    ISSUES="${ISSUES}
- 🔀 กิ่ง '${CUR_BRANCH}' นำหน้า main ${AHEAD} commit → เมื่องานพร้อม ควร merge เข้า main กันแตกกิ่งค้าง"
  fi
fi

# ไม่มีปัญหา -> เงียบ และไม่รีเซ็ต timer (จะได้เตือนทันทีเมื่อมีปัญหาครั้งถัดไป)
[ -n "$ISSUES" ] || exit 0

mkdir -p .claude
[ "$NOW" -ne 0 ] && printf '%s' "$NOW" > "$STAMP"

CONTEXT="[Git hygiene reminder] เพื่อกันไฟล์เละ/งานหาย โปรดเตือนผู้ใช้เป็นภาษาไทยสั้นๆ และเสนอช่วยจัดการให้ (commit/push/merge):${ISSUES}"
ESCAPED="$(printf '%s' "$CONTEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null)"
if [ -n "$ESCAPED" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":%s}}\n' "$ESCAPED"
else
  printf '%s\n' "$CONTEXT"   # fallback: plain stdout ก็ถูกเพิ่มเป็น context เช่นกัน
fi
exit 0
