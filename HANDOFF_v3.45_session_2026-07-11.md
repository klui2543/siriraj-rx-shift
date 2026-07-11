# HANDOFF — v3.45 session 2026-07-11 (swap-flow draft→เผยแพร่ + nickname quick-edit)

Branch **`work/v3.44-lww`** — 6 commits this session (`1308c2f` → `4c44f78`), 2 files:
`Index.html` + `Phase_Z_B1_Auth.js` (new `phxVerifyPassword`).
Base = `d771e05` (prev session handoff 2026-07-10). All pushed to origin.

Commits: `1308c2f` (swf 1/4) · `0f02a85` (2/4) · `6e9d2e2` (3/4) · `5e8d07f` (4/4) ·
`3b2e1f8` (this handoff, then updated) · `4c44f78` (nickname quick-edit pencil).

---

## 🚀 DEPLOY (paste into GAS, then **create a NEW deployment version — not just Save**)

| repo file | GAS file | why |
|---|---|---|
| `Index.html` | **Index** | everything below (swap flow + nickname pencil) |
| `Phase_Z_B1_Auth.js` | **Phase_Z_B1_Auth** | new `phxVerifyPassword` (cancel-published identity check) |

No RTDB rules change. No new sheets. (Nickname pencil = `Index.html` only.)

**Verify a deploy took:** in edit mode the FAB cluster must have **NO 🌐 button**
(undo/redo/[floppy]/เสร็จสิ้น only). Console: `typeof swfOpenConfirm === 'function'`
and `typeof nkQuickEdit === 'function'`.

---

## ✅ WHAT SHIPPED (user-requested flow, Klui-approved mockup v3)

**คำขอจาก user จริง:** หลังเลือกชื่อใน picker → แสดงจอยืนยันธุรกรรม; ค้างเป็น draft
จนกด "เสร็จสิ้น" (กันเน็ตหลุด + กันลืมเผยแพร่); ยกเลิกต้องมีเหตุผล + password + ลงประวัติ;
undo/redo มีผลกับ draft เท่านั้น (กันเชนพัง/กันโกง)

### `1308c2f` (1/4) จอยืนยันธุรกรรม — `swfOpenConfirm`
- ทุก pick (give/add/swap) ยังสร้าง draft ทันทีเหมือนเดิม (localStorage — เน็ตหลุดไม่หาย)
  แล้วเปิด dialog: **action summary กึ่งกลาง** ("ขลุ่ย แลก 06 ↔ 09 กับ กล้วยหอม" — wording
  เดียวกับ timeline) + **ตาราง 4 คอลัมน์ format เดียวกับตารางหลัก** (วันที่|ชื่อ|ตำแหน่ง|รอบเวลา,
  แถวตัวเอง highlight + "(คุณ)") ตาม mockup ที่ Klui อนุมัติ
- ปุ่ม: **เก็บร่างไว้ก่อน** (ปิดเฉยๆ) / **✓ เสร็จสิ้น·เผยแพร่** (`_pbPopupPublish` — เผยแพร่ทั้งเชน)
  / **ยกเลิกรายการนี้ (ทิ้งร่าง)** (removeAction, ไม่ต้อง password เพราะยังไม่ public)
- ไม่ login → เสร็จสิ้น = toast "ต้อง login ก่อนเผยแพร่ — บันทึกร่างไว้แล้ว"
- give เดิมไม่มีจอยืนยัน → ตอนนี้ทุกชนิดผ่าน path เดียวกัน (add/swap ยังผ่าน
  `_lwwTransferConfirm` เลือก "รับจาก/แลกกับ" ก่อน แล้วค่อยเจอจอนี้)

### `0f02a85` (2/4) เด้งเตือนร่างค้าง — `swfShowPendingDrafts`
- กดดินสอเข้าโหมดแก้ไข + login + มี draft เดือนนั้น → popup รายการค้าง
  (1 แถวต่อเชน — collapsing เดียวกับ publish modal), ปุ่ม **ทำต่อ ›** (เปิดจอยืนยันของรายการนั้น)
  / **เผยแพร่ทั้งหมด** (`_pbPublishAllDrafts`) / **ไว้ก่อน**
- delayed 150ms — รอ repaint ที่อาจ auto-disable edit mode (non-owner) ก่อน

### `6e9d2e2` (3/4) ยกเลิก published tail — `swfCancelPublished` + backend
- **`Phase_Z_B1_Auth.js` ใหม่: `phxVerifyPassword(name, pw)`** — hash+compare อย่างเดียว
  (read-only, ไม่แตะ session/lastSeen)
- timeline ✕ เดิมโชว์เฉพาะ draft tail → ตอนนี้โชว์บน **published tail ด้วย (เฉพาะ author
  ที่ login)** → dialog: เหตุผลแบบ **radio** (ตกลงกันใหม่/เลือกผิด/อีกฝ่ายไม่รับแล้ว/อื่นๆ→ช่องกรอก)
  + **password** → verify ฝั่ง server → `phxAuditLog('cancel_published', id, action,
  {reason}, 'web')` **ก่อน** removeAction (local + `SYNC.removeAction` ลบ server)
- **tail-only guard:** hop ที่มีลูก (`_g_<id>` referenced) ปฏิเสธ — ห้ามตัดกลางเชน

### `5e8d07f` (4/4) undo = draft-only + ตัด 🌐
- `phxCanUndo`/`phxUndoAction`: undo ได้เฉพาะเมื่อ **action ล่าสุดเป็น draft**; published
  tail = ปุ่มดับ + toast ชี้ไปที่ ✕ ในประวัติ (Ctrl+Z ก็โดน gate เดียวกัน)
- `confirmUndo` (แตะแถวขีดฆ่า/ghost → "ยกเลิกการรับเวร"): draft = ลบเหมือนเดิม;
  **published = route ไป `swfCancelPublished`** — ปิด cheat path สุดท้าย
- **ตัดปุ่ม 🌐 ออกจาก FAB** — เผยแพร่เหลือ 2 ทาง: จอยืนยัน (เสร็จสิ้น) + popup รายการค้าง
- **พลอยได้:** popup + `_pbPublishAllDrafts` มองเห็น **retro drafts** (`_retroBy` = คน login)
  ด้วย — retro chains ไร้ปุ่มเผยแพร่มาตั้งแต่ v3.44 ตัด inline 🌐 (bug เก่า แก้แล้ว)

### `4c44f78` NICKNAME — ดินสอแก้ชื่อเล่นเร็วใน banner — `nkQuickEdit`
- **✎ ท้ายชื่อใน personal-summary banner** (`renderBanner`, "แฮรี่พอตโตะ ✎ ปฏิบัติงาน
  เดือนนี้: N เวร") — โผล่เฉพาะตอน login (`_nkMyName()` มีค่า)
- แตะ → dialog เล็ก `nkQuickEdit(targetName)` ฉลาดตามบริบท: **ดูตัวเอง → public nickname**
  (`nkSetPublic`), **ดูคนอื่น → private alias** (`nkSetPrivate`) — resolution เดียวกับ
  `displayName` (private ของฉัน > public ของเขา > ชื่อจริง). prefill ค่าเดิม, ปุ่ม
  ล้างชื่อเล่น (ถ้ามี), Enter=บันทึก
- write path เดิม (`_nkWrite` → Firebase + Sheet ทั้งคู่) — เมนูชื่อเล่นเต็ม (`nkOpenModal`,
  ตั้งให้เพื่อนหลายคน) ยังอยู่ครบ อันนี้แค่ทางลัด. เหตุผล: Klui บอก "ขุดจากเมนูลึกไป"
- click ผูกแบบ delegated (`[data-nk-quickedit]`, capture) เพราะ banner re-render ทุก paint

---

## 🧪 VERIFIED
- `node --check` ทุก script block (9 blocks) ทุก commit + `Phase_Z_B1_Auth.js`
- **swf_harness 29 checks ALL PASS** — summary wording 3 ชนิด, table row (mine/badge),
  phxCanUndo 5 กรณี, phxUndoAction gate, confirmUndo routing, pending popup filter
  (own+retro เท่านั้น), cancel tail-only guard, no-reason block, password verify → audit
  → remove, wrong-password block
- **nk_harness 9 checks ALL PASS** — self→public / other→private routing, prefill,
  ล้าง→save '', not-logged-in→no dialog
- ยังไม่ได้ทดสอบกับ GAS backend จริง — **Klui ต้อง UI-test หลัง deploy** (โดยเฉพาะ
  phxVerifyPassword round-trip + SYNC ลบ server หลัง cancel; nickname save round-trip)

## ⚠️ GOTCHAS / DECISIONS
- **Cancel published = author เท่านั้น** (ผ่าน timeline ตัวเอง) — admin cancel ของคนอื่น
  ยังไม่ทำ (ต้องมี actingAs delete path; admin มี override ✎ ชื่ออยู่แล้ว) — งานต่อถ้าอยากได้
- **Publish modal (`openPublishModal`) unreachable แล้ว** (ปุ่มเดียวที่เรียกคือ 🌐 ที่ถูกตัด)
  — โค้ดยังอยู่ ไม่ลบ เพราะ `renderPublishModal` ถูกเรียกจาก `_pbPopupPublish` (repaint
  กล่องซ่อนอยู่ — harmless) การ **unpublish** จึงหายไปจาก UI ด้วย = จงใจ (unpublish คือ
  cheat path แบบเดียวกับ undo published)
- **Legacy actions ไม่มี `_visibility`** = ถือเป็น public ทุกที่ → undo ดับ, ✕ = cancel flow — ถูกต้องตาม spec
- draft ทิ้งจากจอยืนยัน = ไม่ต้อง password (ยังไม่ public โดย design)
- `_swfResolveShift` เดิน `_g_` chain ผ่าน `LWW._resolveKey` → จอยืนยันโชว์แถว master จริงแม้เป็นเวรที่รับต่อมา

## ⏳ REMAINING (เรียง priority — ถาม Klui ก่อนเริ่ม)
1. **Bottom nav 3 แท็บ** (ตารางเวร/แลกเวร/ฉัน) — mockup app-native เดิม accepted แล้ว;
   แท็บ 1 = UI เดิมไม่แตะ, ยก FAB (bottom-right, z-index 4500) ให้ลอยเหนือ bar. ← ตัวเลือกถัดไปที่คุยค้างไว้
2. **หน้าแลกเวร (swap-flow view)** — Klui **ไม่ปลื้ม**ดีไซน์ chip-chain ที่เสนอ (mockup
   `swapflow_mockup.html`); ต้อง **redesign**. จะไปอยู่ในแท็บ "แลกเวร" ของ bottom nav.
   ข้อมูลจาก `LWW.ledger(slotKey)` (ต้นทาง=เจ้าของ master, แต่ละ hop=newOwner, สุดท้าย=currentOwner)
3. Admin cancel published ของคนอื่น (ดู gotcha — ต้อง actingAs delete path)

## 💡 mockup workflow ที่ Klui ชอบ (ทำตามนี้)
Klui ชอบ **เห็นภาพก่อน build** และคุ้นกับ **format เดิมของแอป** (แถวตาราง 4 คอลัมน์
วันที่|ชื่อ|ตำแหน่ง|badge + บรรทัด action "X แลก A ↔ B กับ Y" แบบ timeline). อย่าประดิษฐ์
layout ใหม่ที่หลุดจากภาษาของแอป — เขา reject swap-flow chip design เพราะเหตุนี้.
วิธี: เขียน mockup HTML (Kanit + CSS vars จาก Index.html + รองรับ dark) → `SendUserFile`
display:render → รอ approve → ค่อย wire เข้า Index.html.

## 📁 Harness (session-local `/tmp/.../scratchpad/`, ไม่ commit — extract-and-run)
- `swf_harness.js` (29 checks), `nk_harness.js` (9 checks), `check_scripts.js`
  (node --check ทุก inline `<script>`). เขียนใหม่ได้จากคำอธิบายใน VERIFIED.
