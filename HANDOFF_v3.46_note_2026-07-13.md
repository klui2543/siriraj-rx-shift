# HANDOFF v3.46 — "โน้ตเวร" (per-shift note) แทน joint co-ownership

**วันที่:** 2026-07-13 · **commit:** `162dabc` (feature) + version bump (รอ commit นี้) · **branch:** main · **ไฟล์ที่แตะ:** `Index.html` เท่านั้น (+ `_SYNC_STAMP.js` version stamp)

---

## สรุป 1 บรรทัด
รื้อระบบ **joint / เจ้าของร่วม** (v1→v2.0) ออกทั้งหมด แล้วแทนด้วย **โน้ตเวรต่อคน** — เขียนข้อความอิสระติดบนเวรของตัวเอง เลือก **🌐 สาธารณะ (ทุกคนเห็น)** หรือ **🔒 ส่วนตัว (เครื่องเดียว)**. เวรยังเป็นของคนเดิม 100% — ไม่มี ownership semantics ใดๆ.

## ทำไม
Klui live-tested joint v2.0 แล้วบอก *"ไม่เวิร์ค ยากเกินที่ User เข้าใจ… แค่มีโน้ตต่อคนก็พอ"* → เลือก (AskUserQuestion) **รื้อ joint ออกหมด** + โน้ตเลือกได้ **ทั้ง public & private**. ดู [[project_v345_admin_cancel_and_nav]] (memory) สำหรับบทเรียนเต็ม.

## สิ่งที่ทำงานตอนนี้ (การใช้งาน)
1. แตะเวรตัวเอง → action menu ปุ่ม **"📝 โน้ตเวรนี้"** (อยู่ทั้ง `renderMenuStep` เวรปกติ + `renderGhostMenuStep` เวรที่รับมา)
2. `_noteEdit(shiftKey)` = textarea + radio 🌐 ทุกคนเห็น / 🔒 เห็นเฉพาะฉัน → บันทึก
3. เวรที่มีโน้ตแสดง **📝** (ส่วนตัว = 📝🔒) บนตาราง (`renderTable`) + ปฏิทิน (`renderCalendar`)
4. แตะ 📝 → `_noteView(shiftKey)` อ่านโน้ต; เจ้าของเห็นปุ่ม ✏️แก้ไข / 🗑️ลบ

## สถาปัตยกรรม (สำคัญสำหรับคนแก้ต่อ)
- **Data = record layer เดิม ไม่มี infra ใหม่.** action `{action:'note', shiftKey, note, _visibility}` เขียนผ่าน `OverlayManager.addAction`.
- **public/private แม็ปกับ sync gate ที่มีอยู่พอดี:** `addAction` (~บรรทัด 2960) push ขึ้น server เฉพาะ `_visibility === 'public'` → `'public'` = ทุกคนเห็น, `'private'` = อยู่ local เท่านั้น (ไม่เคยออกจากเครื่อง).
- **Save = upsert:** `_noteSave` ลบ note record เดิมของเราบน shiftKey นั้นก่อน (`removeAction` → ถอน public ออกจาก server ด้วย) แล้วค่อย add ใหม่. ลบ = ลบอย่างเดียว. → เปลี่ยน public→private หรือ ลบ ก็ถอนจาก server ถูกต้อง.
- **Reducer** `_shiftNoteMap(mid, viewer)` (แทน `_combinedJointMap`): อ่าน public `pathBOverlays` (ตัด `draft`+`private` ทิ้ง) + own `OverlayManager.getActions` (รวม private); own ชนะเมื่อ id ชนกัน; เอา createdAt ล่าสุดต่อ shiftKey; note ว่าง = ไม่แสดง. helper `_noteRecords`, `_noteMe`.
- **Marker tap** ใช้ `data-note-key` attribute + **1 capture-phase delegated `document` click handler** (ไม่ใช่ inline onclick — กันปัญหา escape shiftKey + ทำงานใน view mode ด้วย).
- ฟังก์ชันหลัก: `_noteEditFromMenu`, `_noteEdit`, `_noteView`, `_noteSave`, `_noteDelete`, `_noteForKey`, `_noteCanEdit`, `_noteCloseEdit`, `_noteCloseView` — อยู่ในบล็อก `// ═══ v3.46 per-shift note UI` (เดิมเป็นบล็อก joint UI).

## ⚠️ ฝั่ง GAS = ไม่แตะเลย
- `phxPushActions` เก็บทั้ง action เป็น JSON (ไม่มี whitelist action type) และ `phxGetAllActiveOverlaysForMonth` ส่ง `note`/`_visibility` ผ่านอยู่แล้ว; `_phxApplyOverlaysGlobally` จับแค่ give/add/swap → action `note` เฉยๆ ไม่กระทบ ownership.
- **แต่ Index.html เสิร์ฟโดย GAS** → ยังต้อง `clasp push` (hook ทำอัตโนมัติตอน stop → เข้า **`/dev`**) **+ สร้าง deployment version ใหม่** เพื่อให้ถึง **`/exec`** (แค่ push เฉยๆ /exec ยังเป็นของเก่า).
- joint records เก่าที่ค้างบน server (จากตอนเทสต์ @342) ตอนนี้ inert — ไม่มีโค้ดอ่าน action `joint*` แล้ว เวรกลับเป็นเจ้าของเดี่ยวปกติ.

## Verify ที่ทำแล้ว
- 9 inline `<script>` blocks `node --check` ผ่านหมด (ไม่มี syntax error)
- reducer unit tests **12/12 เขียว**: public เห็นทุกคน / private เห็นคนเดียว / draft ไม่โผล่ / ward-view = public-only / latest-wins / own-overrides-public / empty-drop / non-note ignored
- grep joint = 0 (เหลือแค่ comment header "replaces joint" + `🤝 ยืนยันการรับเวร` ซึ่งเป็น title รับเวรเดิม ไม่เกี่ยว joint)
- ⚠️ **ยังไม่ได้ทดสอบ end-to-end จริง** (login + `google.script.run` + grid จริง) — headless ทำไม่ได้. **Klui ต้อง live-test** ที่ `/dev`.

## TODO ถัดไป
- [ ] Klui live-test `/dev`: เขียน public+private → 📝/📝🔒 → อ่าน → แก้/ลบ → เพื่อนเห็น public ไม่เห็น private
- [ ] Klui ตั้งชื่อรุ่นใน `APP_CHANGELOG` (ตอนนี้ใส่ placeholder "โน้ตเวร — จดโน้ตบนเวรตัวเอง" ไว้ก่อน)
- [ ] สร้าง deployment version ใหม่เพื่อขึ้น /exec
- DEFERRED เดิม (ไม่เกี่ยว): bottom nav 3 tabs · swap-flow view redesign

## อย่าทำซ้ำ
joint / เจ้าของร่วม / ไม้ (relay) — **ลบไปแล้วทั้งคู่ อย่าสร้างใหม่.** ทั้งสองพังเพราะ mechanic ซับซ้อนเกิน mental model ของ user. โน้ตชนะเพราะไม่มี ownership semantics เลย.
