#!/bin/bash
# SessionStart hook: git-sync reminder
# ทำงานทุกครั้งที่เปิด/resume session เพื่อลดปัญหาข้อมูลคลาดกันระหว่าง Cloud (Claude App) กับ Windows PC
#   1. ถ้ากิ่งที่กำลังใช้ ตามหลัง remote  -> เตือนให้ pull ให้ local เป็นปัจจุบัน
#   2. ถ้ามีกิ่งใดนำหน้า main (มีงานยังไม่ถูกรวม) -> แนะนำให้ merge เข้า main เพื่อปิดแกป
# ข้าม backup/* เพราะผู้ใช้ตั้งใจเก็บ snapshot ที่ต่างจาก main ไว้
set -uo pipefail

DEFAULT_BRANCH="main"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# ดึงข้อมูลล่าสุดจาก remote (ทนต่อกรณีไม่มีเน็ต)
git fetch --quiet --all --prune 2>/dev/null || true

CUR_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
REMINDERS=""

# --- 1) กิ่งปัจจุบันตามหลัง upstream หรือไม่ -> ควร pull ---
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '')"
if [ -n "$UPSTREAM" ]; then
  BEHIND="$(git rev-list --count "HEAD..$UPSTREAM" 2>/dev/null || echo 0)"
  if [ "${BEHIND:-0}" -gt 0 ]; then
    REMINDERS="${REMINDERS}
- ⚠️ กิ่งปัจจุบัน '${CUR_BRANCH}' ตามหลัง ${UPSTREAM} อยู่ ${BEHIND} commit — local ยังไม่ปัจจุบัน ควรรัน \`git pull\` ก่อนเริ่มทำงาน (สำคัญเมื่อเพิ่งสลับมาจากอีก platform)"
  fi
fi

# --- 2) มีกิ่งใดนำหน้า origin/main (งานยังไม่ถูกรวม) -> แนะนำ merge เข้า main ---
if git rev-parse --verify --quiet "origin/${DEFAULT_BRANCH}" >/dev/null 2>&1; then
  GAP=""
  while IFS= read -r ref; do
    short="${ref#origin/}"
    case "$short" in
      "$DEFAULT_BRANCH"|HEAD|backup/*) continue ;;
    esac
    ahead="$(git rev-list --count "origin/${DEFAULT_BRANCH}..${ref}" 2>/dev/null || echo 0)"
    if [ "${ahead:-0}" -gt 0 ]; then
      GAP="${GAP}
  • ${short} — นำหน้า ${DEFAULT_BRANCH} อยู่ ${ahead} commit"
    fi
  done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin 2>/dev/null)

  if [ -n "$GAP" ]; then
    REMINDERS="${REMINDERS}
- 🔀 มีกิ่งที่ยังไม่ถูกรวมเข้า ${DEFAULT_BRANCH} (งานล่าสุดต่างจากตัวเมน):${GAP}
  → แนะนำให้รวมกิ่งเหล่านี้เข้า ${DEFAULT_BRANCH} แล้ว push เพื่อให้ทุก platform ดึงงานล่าสุดได้ครบ"
  fi
fi

# --- แสดงผลผ่าน additionalContext เพื่อให้ Claude หยิบไปเตือนผู้ใช้ ---
if [ -n "$REMINDERS" ]; then
  CONTEXT="[Git sync check] ตรวจพบความคลาดเคลื่อนระหว่าง local/remote/main — โปรดแจ้งเตือนผู้ใช้เป็นภาษาไทยเชิงรุก และเสนอตัวช่วยดำเนินการให้:${REMINDERS}"
else
  CONTEXT="[Git sync check] ทุกกิ่ง (ยกเว้น backup/*) sync กับ ${DEFAULT_BRANCH} เรียบร้อย และ local เป็นปัจจุบัน — ไม่มีแกปที่ต้องรวม"
fi

# escape สำหรับ JSON (backslash, quote, newline)
ESCAPED="$(printf '%s' "$CONTEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null)"
if [ -n "$ESCAPED" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' "$ESCAPED"
else
  # fallback: ถ้าไม่มี python3 ให้พิมพ์ข้อความดิบ (Claude Code จะใส่ stdout เป็น context ให้)
  printf '%s\n' "$CONTEXT"
fi
exit 0
