# HANDOFF — v3.46 relay ลบแล้ว + "เจ้าของร่วม" (joint) v1 — 2026-07-13

Branch **`main`**, ทุกอย่าง push แล้ว. Session นี้ทำตามแผน RE-PLAN จาก
`HANDOFF_v3.45.3_REPLAN_leg_feature_2026-07-12.md` ครบทั้ง 2 เฟส.
แผนเต็ม: `C:\Users\Klui\.claude\plans\humble-noodling-balloon.md`

## ✅ สิ่งที่เสร็จใน session นี้

### PHASE 1 — ลบระบบไม้ (relay legs) ทั้งหมด — commit `95753bb`
- **Hard removal จริง** (Klui เลือกลบโค้ด ไม่ใช่ปล่อย dormant): −1,456 บรรทัด Index.html
  + ตัด field `legs` ออกจาก whitelist ใน `Phase_PathB_Global.js`
- ปลอดภัยโดยโครงสร้าง: ทั้งหมดอยู่หลัง `_relayEnabled` DEFAULT OFF → โค้ดที่ลบไม่เคยรันใน
  production → ลบแล้วหน้าจอเหมือนเดิมทุกอย่าง
- เก็บ `.swap-pair-dot` ไว้ (ใช้ร่วมกับ swap ปกติ)
- Verified: relay grep = 0 · 9 script blocks syntax ok · ไม่มี orphaned refs · โหลดจริง
  (headless) — ตาราง/ปฏิทิน/banner/ยก/แลก/timeline ทำงานปกติ ไม่มี JS error

### PHASE 2 — "ต่อเวรแบบเจ้าของร่วม" v1 — commit `f40bac1`
Concept ของ Klui เอง (แทนไม้): **เวรเป็นก้อนเดียว ไม่หั่นเวลา** — แนบโน้ต + เลือกผู้ร่วมรับผิดชอบ
ได้หลายคน · ตารางโชว์ทุกชื่อ `A + B + C` + 📝 · ไม่มี strike/ghost/chain เลย

**โครงข้อมูล = linked append-only records** (ตัดสินใจแล้ว ห้ามเปลี่ยนเป็น embedded array):
```
joint       {shiftKey, owners:[creator,...], note}   ← base, draft→publish เหมือน give/swap
joint_note  {refActionId→base, note}                 ← แก้โน้ต (v1.1) เขียนใต้ชื่อคนแก้
joint_leave {refActionId→base}                       ← ถอนชื่อตัวเอง (v1.1) เขียนใต้ชื่อคนถอน
```
เหตุผล: `phxPushActions` เขียนแถวใต้ชื่อผู้เขียนเท่านั้น (`_phxResolveTarget`, cross-user =
admin-only) → co-owner แก้ record ผู้สร้างไม่ได้ → แต่ละคนเขียนแถวตัวเอง = sync-legal +
**กันแกล้งแข็งกว่า** (ไม่มีใครเขียนทับ log คนอื่นบน server ได้)

**ที่สร้างใน v1 (Index.html):**
| ชิ้น | ฟังก์ชัน / ที่อยู่ |
|---|---|
| Reducer | `_jointRecords` + `_combinedJointMap` (ข้างๆ `_combinedUsedMap` ~3095) — อ่าน own(รวม draft)+public(ตัด draft), own ชนะ, 1 เวร=1 joint (createdAt เก่าสุดชนะ), ข้าม linked ที่หา base ไม่เจอ |
| Picker | `_jointCoOwnerPicker` (โคลน `_lwwNamePicker`, toggle-select + textarea โน้ต + "ยืนยัน N คน") |
| เมนู | ปุ่ม "🤝 ต่อเวรแบบเจ้าของร่วม" ใน `renderMenuStep` (เวรตัวเองเท่านั้น) → `_jointStartFromMenu` → `confirmPickJoint` |
| Confirm | `swfOpenConfirm` + `_swfSummaryHtml` กิ่ง `joint` (flow ร่าง→เผยแพร่เดิม) |
| Grid | `renderTable`: `_jointMap`/`_joint`/`_jointOwners` → `currentOwners.join(' + ')` + 📝 บน master row (ไม่แตะ `_strike`/`shift-used`) |
| Viewer | `_jointShowNote` (แตะ 📝) — ชิปรายชื่อ + ประวัติโน้ตล่าสุดบนสุด พร้อมใครแก้+เมื่อไหร่ — **นี่คือ timeline ของ joint** (ไม่อยู่ใน _g_ chain) และเป็นที่ที่ปุ่ม v1.1 จะไปลง |
| Poll | `_pbOverlaySignature` fold `owners/note/refActionId` (+ ลบ legs leftover เก่า) |
| กันชน | บล็อกสร้าง joint บนเวรที่ยก/แลกแล้ว · บล็อกยก/แลกเวรที่มี joint (`confirmPickName`/`confirmPickShift`) |
| Fix | `OverlayManager.getActions` fallback (pathBOverlays-derive) ส่ง `owners/note/refActionId` ต่อ — ไม่งั้น anonymous view เห็นชื่อเดียว (เจอจาก headless test จริง) |

**Server (`Phase_PathB_Global.js`):** whitelist เพิ่ม `owners` (array), `note` (string),
`refActionId` (string) — server change เดียวของทั้งฟีเจอร์

**Verified (headless, node static server + preview_eval):** สร้าง joint → grid
"สมชาย + สมหญิง + วิภา 📝" · joint_note override โน้ต + attribution ถูก · joint_leave หักชื่อถูก ·
draft ไม่รั่วขึ้นจอคนอื่น · picker toggle/commit ถูก · signature เปลี่ยนตามโน้ต · ไม่มี JS error

## ⏭️ NEXT SESSION

1. **Klui live-test v1 ก่อน** — ⚠️ ต้อง **สร้าง GAS deployment version ใหม่** (แก้
   `Phase_PathB_Global.js` — `/exec` เสิร์ฟ version ที่ pin ไว้; ไม่ deploy = คนอื่นไม่เห็นชื่อร่วม)
   - เครื่อง A: เมนูเวรตัวเอง → 🤝 → เลือก 2 คน + โน้ต → เผยแพร่ → ช่องโชว์ `A + B` + 📝
   - เครื่อง B (login คนละคน): เห็น `A + B` + แตะ 📝 เห็นโน้ต ภายใน ~1 poll
   - ยก/แลกเวรปกติยังทำงาน · เวรที่มี joint กดยก/แลกแล้วโดน toast บล็อก
2. **v1.1 — แก้โน้ต + ถอนชื่อตัวเอง + audit** (หลัง Klui รับ v1):
   - ปุ่ม "แก้โน้ต" + "ออกจากเวรร่วม" ใน `_jointShowNote` overlay
   - แก้โน้ต: เฉพาะ `currentOwners` → **log ก่อน mutate**
     `phxAuditLog('joint_note_edit', shiftKey, {note:before}, {note:after}, 'web')` →
     `addAction({action:'joint_note', _visibility:'public', refActionId, shiftKey, note})` →
     mirror เข้า `pathBOverlays` (สไตล์ `_pbEditRecipient`) → `triggerUpdate()`
   - ถอนชื่อ: **ต้องพาสเวิร์ด + เหตุผล** (Klui ตัดสินใจแล้ว — reuse gate ของ
     `swfCancelPublished`: reason radio + `phxVerifyPassword`) → log ก่อน →
     `addAction({action:'joint_leave', ...})` → เหลือ 1 คน = โชว์ชื่อเดียวปกติ
   - ⚠️ ใช้ `addAction` linked records + `phxAuditLog` ตรงๆ เท่านั้น — **ห้าม `updateAction`**
     (ไม่มี audit auto-wrap, gap ที่ `docs/DATA_MAP.md` §3 ข้อ 4 เตือน) · log-before-mutate
     ทั้ง 2 flow (อย่าเลียน `swfAdminCancelPublished` ที่ log ทีหลัง)
3. **v1.2 — ICS**: `_ecmBuildClientICS` (~12705) สอง block `descLines` (clinic ~12922, timed
   ~12998) → `เจ้าของร่วม: A, B` + `หมายเหตุร่วม: <note>` ผ่าน `escICS` · พิจารณาโชว์เวร joint
   บน grid ของ co-owner (ตอนนี้โชว์แค่แถว master owner)

## Gotchas / patterns
- **GAS deploy**: ต้อง NEW deployment version เสมอ (ไม่ใช่แค่ save) — สาเหตุอันดับ 1 ของ
  "ไม่เห็นผล" ในทุก live-test ที่ผ่านมา
- **detached HEAD**: เช็ค `git status -sb` ต้องเป็น `## main...origin/main` หลังทุก push
  (session นี้สะอาดตลอด)
- **Verify pattern**: node static server ใน scratchpad + `.claude/launch.json` ชั่วคราว
  (ลบทิ้งหลังใช้) + `preview_eval` — inject `pathBOverlays` สังเคราะห์ + override
  `getCurrentUser`/`getCurrentMonthId` แล้วเรียก `renderTable` ตรงๆ เชื่อถือได้กว่า screenshot
- `docs/DATA_MAP.md` = audit สถาปัตยกรรมข้อมูล (commit นี้เพิ่งเข้า repo) — ส่วน relay (§2.4)
  stale แล้วหลังลบ แต่ส่วน security/สถาปัตยกรรม (§3) ยังใช้ได้

## DEFERRED (เดิม ไม่เกี่ยว joint)
- Bottom nav 3 tabs (mockup ผ่านแล้ว) · หน้าแลกเวร swap-flow view (chip-chain ถูก reject,
  ต้อง redesign เป็นภาษาตาราง 4 คอลัมน์) · security items ใน DATA_MAP §3 (session หมดอายุ,
  phxRemoveAction ไม่เช็ค verify, LINE webhook ไม่ verify HMAC ฯลฯ)
