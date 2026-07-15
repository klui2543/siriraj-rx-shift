# HANDOFF — แผน "สมุดส่วนตัว" + งานก่อน Launch (2026-07-15, mobile → ทำต่อบนคอม)

**Launch เป้าหมาย: ศุกร์ 17 ก.ค. 2569 (เหลือ ~2 วัน)**
**สถานะ:** ตัดสินใจ/ออกแบบครบใน session นี้ — **ยังไม่ได้ลงโค้ด** (Klui จะทำต่อบนคอม)
**Branch:** `claude/mobile-work-continuation-7b7q1t` (นำหน้า main ~3 commit = เอกสาร/mockup)
**ต่อจาก:** `HANDOFF_v3.48_swap_easier_2026-07-15.md` (ดีไซน์ A→B→C)

> ⚠️ **git fetch ก่อนแก้ทุกครั้ง** — มีงาน `calendar-sync-app/` แก้ `Index.html` เดียวกันคู่ขนาน (เคย commit ชนกัน)

---

## 🎯 การตัดสินใจใหญ่ของ session นี้: ปิด "สมุดกลาง" → กลับเป็น "สมุดส่วนตัว" สำหรับ launch

**เหตุผล:** โมเดล "ทุกคนเก็บ route ส่วนตัวหลายสเต็ป แล้วเผยแพร่ทีหลังพร้อมกัน" ทำให้เกิด conflict ข้ามคนที่
**ซับซ้อนและเปราะ** (ต้องมี override/รหัส/atomic route). Klui ตัดสินใจ **ถอยกลับ concept เดิม = สมุดของแต่ละคน**
→ ไม่มีสมุดกลาง = **ไม่มี conflict ข้ามคนตั้งแต่ต้น**

### สิ่งที่ต้องการ (ยืนยันกับ Klui แล้ว)
- **ปิด:** ฟังก์ชันเผยแพร่ขึ้นสมุดกลาง + ซ่อน overlay ที่คนอื่นเคยเผยแพร่ (ตอน test)
- **เก็บไว้:** ซิงค์สมุดตัวเองข้ามเครื่อง · ICS · Google Calendar · Export (อ่าน effective data ของตัวเอง)
- **โมเดล:** "ทุกอย่างเป็นร่างในสมุดตัวเอง" — **ไม่มี toggle 2 โหมด** (idea toggle ถูก reject)
- **รับทราบผล:** ยก/แลก/รับ **ไม่วิ่งไปหาอีกฝ่ายอัตโนมัติ** — ต่างคนต่างจดในสมุดตัวเอง ตกลงกันนอกแอป (Klui ยอมรับ)

### ✅ ข่าวดีจากโค้ด (ทำให้ปลอดภัย + ย้อนกลับได้)
- **Publish ไม่เขียนทับ master data** — เป็นแค่ flag `_visibility: 'draft' ↔ 'public'` บน overlay
  → "ซ่อน" = กรอง ไม่ใช่ลบ → flip flag กลับได้ 100% ไม่มีข้อมูลหาย
- "สมุดกลาง" = overlay ที่ `_visibility==='public'` ของคนอื่น (ใน `pathBOverlays`). draft ไม่โผล่ให้คนอื่นอยู่แล้ว

### A→B→C ยังเก็บไว้ (Klui ยืนยัน — มีประโยชน์แม้โหมดส่วนตัว)
ทำงานได้โดย**ไม่ต้องเห็นข้อมูลคนอื่น**: **A**=ชื่อในตาราง (base roster) · **B**=คนที่ดีลด้วยจริง (Klui พิมพ์เองในช่อง
"แลกกับ/รับจาก ▾" = `_lwwTransferConfirm`) · **C**=คุณ. เคส: แลกกับ B ที่เอาเวรของ A มา → รู้ว่าได้จาก B ไม่ใช่ A

---

## 🔧 แผนลงมือ — แบ่งเป็นก้อน (อย่าทำรวดเดียว, verify+commit แยกก้อน)

### ก้อน A — ปิด publish → สมุดส่วนตัว ⭐ เริ่มก้อนนี้ก่อน (client-only, ย้อนกลับได้)
เพิ่ม flag `window._publishEnabled = false` (ตาม pattern `_syncPublish`/`_relayEnabled`) แล้ว:
1. **ซ่อนจุดเผยแพร่** เมื่อ flag ปิด:
   - FAB "🌐 เผยแพร่" → `openPublishModal` (`Index.html:3519`) + ปุ่มที่เรียกมัน
   - ปุ่มใน `swfOpenConfirm` (~`Index.html:6178`): "เสร็จสิ้น · เผยแพร่" (`swfDone`→`_pbPopupPublish` 3541) + "เผยแพร่ทั้งหมด" (`_pbPublishAllDrafts` 3555)
2. **confirm dialog เปลี่ยนคำ** → "บันทึกในสมุดของฉัน" (แค่เก็บ draft ไว้, ไม่ publish)
3. **กรอง overlay public ของคนอื่นออกจาก view** — ใน `getEffectiveData` (`Index.html:3049`) path ที่ไม่มี name filter
   วน `pathBOverlays` recipients (~3060-3080): เมื่อ flag ปิด ให้เหลือเฉพาะ `viewerName===ตัวเอง`
   (ดู `_visibility` filter ~2951, "drafts don't synth ghosts for others" ~2771)
4. **กัน push public ขึ้น server** — ตั้ง `_syncPublish=false` ตอน flag ปิด (`Index.html:2943`)
5. **คงไว้ (อย่าแตะ):** own cross-device sync, ICS, Google Calendar, Export — อ่าน effective data ของตัวเอง
- verify: `node --check` inline scripts + harness `_h_*`; **Klui live-test** cloud/ซิงค์/ซ่อนคนอื่นหลัง deploy

### ก้อน B — security #2: month-ID 3 สูตรไม่ตรง (server, ต้อง live-test) 🟠 เกี่ยวกับ sync สมุดตัวเอง!
**สำคัญ:** ซิงค์สมุดตัวเองที่เก็บไว้ ใช้ month key นี้ → ถ้า key เพี้ยน สมุดอาจ "ไม่ซิงค์/หาย" = อาการ "Firebase ดับ"
- 3 สูตร: Sheet=timestamp · Firebase=`"m_"+ชื่อเดือนไทย` (server เขียน `pushToFirebase_` `code.js:511` / client อ่าน `fetchMonthData` `Index.html:7108` คำนวณแยกกัน) · ปฏิทิน=สูตร 3 (`_p2c_appendSyncRow` `Phase2C.js:201`)
- **Mitigation แนะนำ (ไม่ใช่แก้เต็ม):** รวมสูตร label→key เป็น**ฟังก์ชันเดียว** ที่ server+client เรียกร่วม (กันเพี้ยน**ใหม่**) + เปลี่ยนข้อความ fallback ("กำลังโหลด…" แทน "ระบบล่ม")

### ก้อน C — security #3 + #4 (ส่วนใหญ่ client)
- **#3 admin แก้เวรคนอื่น + audit:** ปัจจุบัน block ทุกคนที่ไม่ใช่เจ้าของที่ `Index.html:5185-5192` (**ไม่มี bypass admin**)
  → (ก) เพิ่มเงื่อนไข `u.role==='admin'` (role check ที่ 6598/12287, `isAdmin()` 17621) ให้ผ่าน block ได้
  → (ข) บังคับเหตุผล + `phxAuditLog('admin_override', before/after, reason)` (wrapper `Index.html:14421`, server `phxLogAudit` `Phase_G_AuditLog.js:97`).
     มี `_pbAdminOverride` (3658) / `_pbEditRecipient` (3323) อยู่แล้วแต่**ไม่ได้ call audit**
- **#4 session หมดอายุ 24 ชม.:** col `lastSeen` มีใน sheet `PHX_Pharmacists` แล้ว — เทียบเวลาตอน verify session

### ก้อน D — post-launch (ไม่เร่ง)
- **Export preset** (ไอเดีย Klui ชอบ): เซฟชุด `window.selectedPharmacists` (`_ecmGetExportTargets` 12201) เป็นพรีเซ็ตตั้งชื่อ,
  + เพิ่มชื่อ (ค้นหา+แตะ), **เอกเทศต่อคน** (เก็บใน `Phase_Z_H_Preferences.js`). mock: artifact ด้านล่าง
- **ดาวน์โหลด Excel ต้นฉบับ** ใน export section — import อยู่ server (`code.js:125`), gen .xlsx จาก Sheet ปัจจุบัน (server)
- **A→B→C diagram** ลงโค้ดจริง (ดีไซน์ผ่านแล้ว, HANDOFF v3.48) — ต่อยอด `_lwwTransferConfirm` + `_swfSummaryHtml`

---

## 🔒 Security prelaunch — สถานะล่าสุด (Klui อัปเดต session นี้)
| # | เรื่อง | สถานะ |
|---|---|---|
| 1 | ยกเลิกเวรเผยแพร่ ไม่เช็ครหัส server | ✅ **Klui แก้แล้ว** |
| 2 | เดือน ID 3 สูตร (Firebase ดับ) | → ก้อน B (mitigation) |
| 3 | admin แก้เวรคนอื่นไม่ได้ + ไม่มี audit | → ก้อน C |
| 4 | session ไม่หมดอายุ | → ก้อน C (24 ชม.) |
| 5 | LINE webhook ไม่ verify | **รอได้** — Klui ยังไม่เปิด LINE/ประกาศอัตโนมัติช่วง launch (ปิด publish = ไม่ยิงอยู่แล้ว) |
| 6 | LWW record ไม่บันทึกจริง | ไม่รีบ (flag opt-in, prod ใช้ chain-walk) |

---

## 📎 Mockup (เก็บถาวร)
- **แลกเวร A→B→C (approve v13):** `swap_easier_mockup.html` · https://claude.ai/code/artifact/5860fa3f-4427-46f8-9f27-d5cd50e13cf3
- **สมุดส่วนตัว(ร่าง)+conflict+พรีเซ็ต export:** `mode_export_mockup.html` · https://claude.ai/code/artifact/f71631e0-df7d-4118-95a7-06a47dbd97b0
  (หมายเหตุ: conflict UI ในmock นี้ = แนวทางเก่าที่ **ยกเลิกแล้ว**; ยึด "สมุดส่วนตัว ไม่มี conflict" ตามด้านบน)

## ⚠️ ค้าง Deploy (ต้องทำถึงจะเห็นผล)
- แอปหลัก `Index.html` GAS version ใหม่ · `calendar-sync-app` clasp push แยก
- ของเดิมที่รอ deploy: banner "เลือกได้ N", cursor รับเวร, scroll เด้ง (`d58ac10`/`dc03110`)

## git hygiene
- branch นำหน้า main อยู่ → เมื่อพร้อม merge เข้า main (มี 3 branch อื่นค้างด้วย: app-design +73, existing-system +12, work/v3.44-lww +62 — รอ Klui สั่ง)
