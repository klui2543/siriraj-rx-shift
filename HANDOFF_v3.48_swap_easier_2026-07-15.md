# HANDOFF — v3.48 "แลกเวรให้ง่ายขึ้น" · ดีไซน์ผ่านแล้ว (2026-07-15)

**สถานะ:** ดีไซน์ (sample-first) **Klui approve แล้ว** — ยังไม่ลงโค้ดจริง
**ไฟล์ mockup:** `swap_easier_mockup.html` (repo root · ถูก `.claspignore` กันไม่ให้ขึ้น GAS)
**Artifact (เก็บถาวร):** https://claude.ai/code/artifact/5860fa3f-4427-46f8-9f27-d5cd50e13cf3 (v13)
**ต่อจาก:** `HANDOFF_v3.47_session3_2026-07-14.md` (งานใหญ่ข้อ 1)

---

## 🎯 โจทย์ที่ Klui สั่ง
คนใช้ **ไม่เข้าใจ "สัมปทานเวร"** (เวรเปลี่ยนมือหลายทอด — เอ๋ยกให้โต้ง แล้วเราไปสลับ ต้องสลับกับ
โต้งคนถือ ไม่ใช่เอ๋เจ้าของเดิม). ต้องทำให้เห็น **ทิศทาง + ใครเกี่ยวข้อง** ชัด และเห็น
**ตั้งแต่ตอนเลือก** (dynamic) ไม่ใช่รอถึงหน้าเผยแพร่.

## ✅ ดีไซน์ที่ผ่านแล้ว (mockup v13)

### 1. หน้าเมนู = ตาม `phxViewSwap` จริง
`แลกเวร` + `เลือกสิ่งที่ต้องการทำกับเวรของคุณ` + 4 ปุ่ม (🔄 สลับ / 🎁 ยกให้ / 🤝 รับ / ↩️ ยกเลิก) + recap.

### 2. Flow ตรงของจริง (สำคัญ — เคยวางผิดตำแหน่ง)
| การกระทำ | ลำดับ | มีขั้น "ระบุชื่อผู้สัมปทานเวร"? |
|---|---|---|
| 🔄 สลับ | เลือกเวรคุณ → เลือกเวรคนอื่น → **ระบุชื่อผู้สัมปทานเวร (แลกกับ ▾)** → เผยแพร่ | ✅ |
| 🤝 รับ (add) | เลือกเวรที่เสนอ → **ระบุชื่อผู้สัมปทานเวร (รับจาก ▾)** → เผยแพร่ | ✅ |
| 🎁 ยกให้ | เลือกเวรคุณ → เลือกผู้รับ → เผยแพร่ | ❌ |
| ↩️ ยกเลิก | เลือกเวรที่ยกเลิก → ยืนยัน | ❌ |

> ขั้นสัมปทาน = `_lwwTransferConfirm` เดิม (มีอยู่แล้ว!) เรียกจาก `confirmPickShift` หลังเลือกเวร
> เฉพาะ `step==='swap'` และ `step==='add'`. **ไดอะแกรมทิศทางไปฝังบน dialog นี้.**

### 3. ไดอะแกรม A → B → C (หัวใจ)
- ไอคอนคน 👤 เหมือนกันทุกคน (ตัวเรา = สีฟ้า), ลูกศรบอกทิศ
- **A = ชื่อในตาราง/เจ้าของเดิม · B = คนถือจริง/ผู้ให้จริง (●) · C = คุณ**
- **กติกาแสดง A:** ขึ้น A→ เมื่อ "คนถือจริง (ค่าในช่อง แลกกับ/รับจาก) ≠ ชื่อในตาราง"
  - สลับ: `A → B ⟷ C` (⟷ = สลับ)
  - รับ: `A → B → C` (→ = รับมา)
  - ถ้าตรงกัน (ไม่มีสัมปทาน) → เหลือ 2 คน `B ⟷ C` / `B → C` (ประหยัดพื้นที่)
- **อัปเดตสดทันที** เมื่อแตะช่อง "แลกกับ/รับจาก ▾" เปลี่ยนชื่อ (ยังไม่ต้องถึงหน้าเผยแพร่)
- **ยก/ยกเลิก** ก็ใช้เส้นคนแบบเดียวกัน (คุณ → ผู้รับ / คุณ ↩ เจ้าของเดิม) เพื่อความสม่ำเสมอ

### 4. หน้าเลือกเวร = ตัวกรองครบตาม `renderShiftPickerShell`
เลือกคน (ทุกคน) · เลือกวัน (ทุกวัน) · ค้นหารหัสตำแหน่ง + นับจำนวน + ลิสต์ทั้งเดือน.

---

## 🔧 จุดที่ต้องแก้ในโค้ดจริง (`Index.html`) — ยังไม่ทำ
1. **`_lwwTransferConfirm` (~5878)** — เพิ่มไดอะแกรม A→B→C ใต้ช่อง field, re-render สดใน
   callback ของ `_lwwNamePicker` (onPick). ตรรกะ A: `fromName !== holder ? A=holder : (orig? A=orig : none)`.
   - `holder` = `_curHolder` (`_pbHolderOf`) ที่ส่งเข้ามาเป็น `defaultFrom` แล้ว
   - `orig` = เจ้าของเดิมของ shift (จาก `_ghostOrigOwner` / master owner ของ targetShift)
2. **สรุปภาษาชาวบ้าน** — ปรับ `_swfSummaryHtml` (~6125) ให้เข้ากับ tone เดียวกัน (ให้/ได้ ชัด)
3. **ยก/ยกเลิก** — อาจเพิ่มไดอะแกรมเล็กใน `swfOpenConfirm`/`renderUndoStep` (ไม่มีขั้นสัมปทาน)
4. **CSS** — port `.pline/.pp/.par` (เส้นคน) + person icon `<symbol id="usr">` เข้า `<style>` หลัก

### ✍️ Wording — Klui บอก "ปรับแก้คำทีหลัง"
ข้อความ user-facing รวมอยู่ที่ `diagramHTML()`/`concessionHTML()` ใน mockup (sub labels: เจ้าของเดิม/
คนถือจริง/ผู้ให้จริง/เรา · result lines). แก้จุดเดียว ไม่กระทบ logic. รอ Klui เคาะคำสุดท้าย.

---

## 📋 งานที่เหลือทั้งหมด (ภาพรวมโปรเจกต์ — กวาดจากทุก handoff)

### 🔴 LAUNCH ศุกร์ 17 ก.ค. 2569 (เหลือ ~2 วัน) — Security prelaunch
ที่มา: `HANDOFF_security_prelaunch_2026-07-14.md` + `docs/DATA_MAP.md §3`. **ยังไม่แก้อะไรเลย.**
Klui ต้องเคาะว่าอันไหนแก้เต็ม / อันไหน mitigation / อันไหนเลื่อน. ลำดับที่ handoff แนะนำ:
| # | เรื่อง | แนะนำ |
|---|---|---|
| 1 | ยกเลิกเวรที่เผยแพร่แล้ว **ไม่เช็ครหัสผ่านจริงฝั่ง server** | ✅ แก้เต็มก่อน Friday (scope เล็ก, token 2-5 นาที ผูก session hash) |
| 2 | "เดือน" มี ID **3 สูตรไม่ตรงกัน** (รากของ "Firebase ดับ") | 🟠 mitigation ก่อน Friday (แก้เต็มเสี่ยง regression) |
| 3 | แอดมินแก้ผู้ให้/ผู้รับ **ไม่มี audit log** | แก้ถ้ามีเวลา (เล็ก ไม่เสี่ยง) |
| 4 | **Session ไม่หมดอายุ** | soft-expiry ถ้ามีเวลา (col `lastSeen` ใน `PHX_Pharmacists` มีแล้ว) |
| 5 | **LINE webhook ไม่ verify ลายเซ็น** | รอได้ถ้า bot ยังไม่ user-facing — **ถาม Klui ว่าเปิด LINE ศุกร์นี้ไหม** |
| 6 | LWW record ไม่ถูกบันทึกจริง (คำนวณสด) | ไม่รีบ (LWW เป็น flag opt-in, prod ใช้ตัวเก่า) |
| — | Password salt เดียวกันทุกคน · Firebase rules ไม่อยู่ใน repo | เลื่อนหลัง launch (งาน migration ใหญ่) |

### ⚠️ ค้าง DEPLOY (สะสม — โค้ดแก้แล้วแต่ยังไม่ deploy → Klui ยังเห็นของเก่า)
1. **แอปหลัก:** GAS deployment version ใหม่ของ `Index.html` (Deploy → Manage deployments → New version)
2. **calendar-sync-app:** clasp push/deploy แยก (คนละ scriptId) — Google Calendar all-day
- ของที่รอ deploy ถึงจะเห็นผล: banner "เลือกได้ N", cursor รับเวร, scroll เด้ง (`d58ac10`/`dc03110`)

### งานพัฒนา / UX (เตรียม launch)
- **[ดีไซน์ผ่าน ✅] แลกเวรให้ง่ายขึ้น (A→B→C)** → ลงโค้ดจริงตาม §จุดที่ต้องแก้ + ปรับ wording (Klui เคาะทีหลัง)
- **[pending] UI polish** — picker table ให้เหมือน main table (left-border สีตามชนิดเวร + spacing)
- **[pending] ภาษาทางการ** — รีวิว user-facing strings เขียนใหม่ให้ชัด (ทำ sample tone ก่อน)
- **[pending] joint v2.1** — "ต่อเวรแบบเจ้าของร่วม" เหลือ **per-person work-time labels + ICS export**
  (ที่มา `HANDOFF_v3.47_joint_v2.0`; v1→v2.0 ship แล้ว, deployed `@342`). หมายเหตุ: ระบบ **ไม้/relay
  ถูกแทนที่ด้วย joint แล้ว** — relay handoffs เก่าถือว่า deprecated

### Perf / tech debt
- **picker list ช้าตอนเวรเยอะ** → pagination / pre-cache `_pbHolderOf` (เสนอไว้ ยังไม่ทำ)
- `New Text Document.txt` ค้างสถานะลบใน working tree (ไฟล์เปล่า) — ลบ commit ทิ้งได้

### หมายเหตุ sync / git hygiene
- branch นี้ (`claude/mobile-work-continuation-7b7q1t`) นำหน้า main → เมื่อพร้อม **merge เข้า main** กันแตกกิ่งค้าง
- 3 branch นำหน้า main: `app-design-hospital-scale` (+73), `existing-system-assistants` (+12),
  `work/v3.44-lww` (+62) — **ยังไม่ตรวจ/ไม่แตะ** รอ Klui สั่งว่าจะรวมอันไหน
- ⚠️ มีงานคู่ขนานแก้ `Index.html` เดียวกัน (calendar-sync-app) — `git fetch` ก่อนแก้โค้ดจริงเสมอ

---

## Verify (ไม่มี GAS backend ในมือ)
- `node --check` ทุก `<script>` inline · harness `_h_*` (claspignore กันแล้ว) แล้วลบทิ้ง
- mockup: `node --check` script ผ่านทุกครั้ง (v13)
