# HANDOFF — Session 3 (2026-07-14) → เตรียมงานใหญ่: "แลกเวรให้ง่ายขึ้น" + UI polish + ภาษาทางการ

**ไฟล์ที่แตะ:** `Index.html` (หลัก) + `calendar-sync-app/Code.js` (โปรเจกต์แยก คนละ deploy)
**HEAD:** `d58ac10` บน `origin/main` · ทุก commit push แล้ว · **ยังไม่ deploy GAS version ใหม่**
**ก่อนหน้า:** ต่อจาก `HANDOFF_v3.47_swap_nav_2026-07-14.md`

---

## ⚠️ อ่านก่อน — DEPLOY 2 ที่ (ค้างสะสมทั้ง session)
1. **แอปหลัก:** สร้าง GAS deployment version ใหม่ของ `Index.html` (Deploy → Manage deployments → ✏️ → New version → Deploy) ถึงจะขึ้น `/exec`
2. **calendar-sync-app:** clasp push / deploy **แยก** (คนละ scriptId) — งาน Google Calendar all-day + format อยู่ที่ `calendar-sync-app/Code.js`. แนะนำรัน `testB3RoundTrip` (ในไฟล์ Phase_Z_B3_Sync.js ของ **แอปหลัก**) ยืนยัน tombstone ด้วย
3. **CONCURRENCY:** session `calendar-sync-app` (อีก session) แก้ไฟล์คู่ขนาน — `git fetch` + `status -sb` ก่อน push เสมอ

---

## ✅ เสร็จแล้ว session นี้ (เก่า→ใหม่, ทั้งหมด push แล้ว)

**Sync ข้ามเครื่อง (สำคัญสุด):**
- `e630e75` **FIX ธุรกรรม/ยกเลิก ไม่ sync ข้ามเครื่องของ user เดียวกัน** — client periodic authoritative pull ใน poll (~60s, guarded) + `phxRemoveAction` retry + **SERVER TOMBSTONE** (`Phase_Z_B3_Sync.js`: mark `type=__deleted__` แทนลบแถว, pull ข้าม, push ปฏิเสธ id ที่ลบแล้ว → กันรายการที่ลบฟื้น) + `phxCloudPullAll` skipRenderIfUnchanged. verify 12/12+8/8+4/4

**เวรคลินิก + Export:**
- `8798e90` สีเตือนเวรคลินิกชนรอบ (`_clinicClashLevel`: จ–ศ รอบ1=แดง รอบ2=ส้ม รอบ3=ไม่ชน; ส/อา กลางวัน=แดง รอบ1–2=ส้ม รอบ3=ไม่ชน) ทาตาราง+ปฏิทิน + ICS all-day + สีตุ่ม timeline สดขึ้น
- `0c1686a` **FIX คลินิก vs รอบ3 ยังชน** → `checkShiftConflict` เปลี่ยน clinic-vs-regular เป็น round-based (เลิกใช้ time-based ที่ประเมินคลินิกกว้างไป) + ICS คลินิก→"เวลา: โปรดตรวจสอบจากตารางเวรอีกครั้ง"
- `01b9c11` + `6d2d3a8` (**Code.js**) Google Calendar sync = all-day event + format ลอกจาก ICS (title `<ตำแหน่ง> <ประเภท>`, ตัด "ประเภท:"/"ห้อง:", คลินิกไม่โชว์เวลา)

**Nav / Picker / หน้าฉัน:**
- `d6d5584` เลิกใช้แถบ undo/redo/เสร็จสิ้น (retire FAB cluster เกลี้ยง) + ยกเวรค้นชื่อเล่นได้ (`_nkNameMatches`) + ปุ่มรีเฟรช→ซ้ายเฟือง icon-only + placeholder "ค้นหาชื่อ..."
- `009a811` ซิงค์ปฏิทินกลับเป็น admin-only + ล้างทั้งหมดเข้า footer ของการ์ดตัวกรอง
- `b1fe331`→`32059e5` picker เลือกเวร: ตอนแรกโชว์เต็มเดือน แล้ว Klui สั่งให้ **ตัดเวรที่แลก/สลับไปแล้วออก** (โชว์เฉพาะเวรที่ actionable) + ปฏิทิน grid เหมือนหน้าหลัก (`#phxActPickCalGrid` เพิ่มใน grid CSS)
- `0c1686a` ตารางเวรไม่ค้าง edit mode (phxSetTab('schedule') เคลียร์ editModeActive)
- `dc03110` เอาแบนเนอร์ "เลือกได้ N เวรเดือนนี้" ออกจากปฏิทิน picker
- `4b62a2a` หน้าฉัน: ซ่อน section ปฏิทิน+ทั่วไป เมื่อยังไม่ login · `32059e5` ปุ่ม "เวรของฉัน" ซ่อนเมื่อไม่ login

**Register + UX bugs:**
- `6b8bf97` **register: ช่องชื่อเล่น (optional) + label ทุกช่อง + ดาวแดงบน required** (`.phx-flabel .req`). ชื่อเล่น stash `_phxPendingNick` (localStorage) → apply ตอน login ครั้งแรก (`phxAuthSetSession`→`nkSetPublic`)
- `d58ac10` **FIX scroll เด้ง** (`triggerUpdate` จับ `window.scrollY` ต้นฟังก์ชัน + restore ท้าย — ทุก re-render path ผ่าน triggerUpdate; `audit.verifiedAt=null` ใน getScheduleData → signature นิ่ง ไม่ re-render ทุก 30วิ) + **FIX auto-cursor รับเวร** (focus `#pickerSearchInput` แบบ synchronous ใน `openActionModalForAdd` ต่อจาก display='flex' — เดิม focus ใน setTimeout นอก tap gesture → มือถือคีย์บอร์ดไม่เด้ง)

---

## 🎯 NEXT — งานใหญ่ 3 อย่าง (Klui สั่ง + ยืนยันวิธีแล้ว)

### 1. ⭐ แลกเวรให้ง่ายขึ้น (โฟกัสหลัก — Klui บอกสำคัญสุด)
**ปัญหา (เคสคนกลาง):** เวรเปลี่ยนมือ (เอ๋ยกให้โต้ง) → คนใช้งงว่าจะแลกกับใคร. ต้องแลกกับ **โต้ง (คนถือตอนนี้)** ไม่ใช่ เอ๋ (เจ้าของเดิม).

**ทิศทางที่ผมเสนอไว้ (ยังไม่ยืนยัน — Klui บอก "handoff ไปแชทหน้า"):**
| จุด | ตอนนี้ | เสนอ |
|---|---|---|
| หน้าเลือกเวรคนอื่น | เห็นคนถือ แต่ไม่เด่น | **"ถืออยู่: โต้ง"** ตัวใหญ่ + *(เดิมของ เอ๋)* ตัวเล็ก |
| ก่อนยืนยัน | สรุปมีศัพท์ | ภาษาชาวบ้าน "คุณจะสลับกับโต้ง — ให้เวร X รับเวร Y" |
| เวรที่เปลี่ยนมือ | ต้องกดดูประวัติ | รอยทางสั้น "เอ๋ → โต้ง → คุณ" บรรทัดเดียว (**ไม่ทำกราฟ** — Klui เคย reject network graph) |

**⚠️ 2 คำถามที่ยังไม่ได้คำตอบ (session หน้าถาม Klui ก่อน):**
- ทิศทาง 3 จุดข้างบน โอเคไหม / ปรับตรงไหน
- **"Dummy"** ที่ Klui พูด ("หาเทคนิคต่างๆ มาใช้ เช่น Dummy") หมายถึงอะไร — preview/dry-run ก่อนยืนยัน? ตัวอย่างสอนใช้? ต้องถาม
- **วิธีทำ = sample-first** (Klui เลือกเอง): สร้าง sample หน้าจอจริง (สไตล์แอป Kanit) ให้ดูก่อนลงโค้ด

**Technical context สำหรับงานนี้:**
- คนถือปัจจุบัน resolve ผ่าน `_pbHolderOf(shift, usedMap)` (~Index.html) + LWW ledger + PBOverlays chain (`buildRecords`/`PBOverlays.buildChain`). label "เดิมของ" มีอยู่แล้วใน picker (`updatePickerListContent` ~5586-5591)
- swap flow: 4 ปุ่ม (`phxSwapAction`) → `_phxActionPicker` (เลือกเวรตัวเอง) → `openActionModalForKey` + `actionGoTo`; สลับ→`renderShiftPickerShell` (เลือกเวรคนอื่น), ยก→`renderNamePickerShell` (เลือกผู้รับ)
- สรุปก่อนยืนยัน: `_swfSummaryHtml(act, viewer, myShift, tgtShift)` + `swfOpenConfirm` (~6045). นี่คือจุดใส่ "ภาษาชาวบ้าน"
- timeline/chain: `buildTimelineHTML`/`_buildPBTimelineHTML`/`openTimelineModal`. รอยทางสั้นๆ อาจดึงจาก chain นี้

### 2. UI polish — Swiss-inspired / Grid-Based Technical Minimalism (ระดับ รพ.)
- **วิธี = sample-first** (Klui เลือก): ทำ design system (typography scale / spacing grid / color tokens) แล้ว apply **หน้าเดียวก่อน** (แนะนำ = แท็บแลกเวร หรือ login modal) ให้ Klui ดู ถูกใจค่อย roll out — **อย่ารื้อทั้งแอปทีเดียว** (Klui เคย reject mockup)
- ค้างเกี่ยวข้อง: **picker table ยังไม่เหมือน main table** (screenshot Klui) — main มี left-border สี + chevron/dot; picker (`_swapRow`/`.swf-tbl`) แบน. ควรตัดสินใจว่า "เหมือน" แค่ไหน (แนะนำ: เอาแค่ left-border สีตามชนิดเวร + spacing ไม่เอา chevron/timeline ที่เป็น interactive ของ main)

### 3. ภาษาให้เป็นทางการมากขึ้น
- Klui: "ภาษายังเข้าใจยากสำหรับคนไทย" — ต้องรีวิว user-facing strings แล้วเขียนใหม่ให้เป็นทางการ/ชัด. ทำเป็น pass แยก (grep ข้อความไทยใน Index.html). ควรทำ sample ให้ดู tone ก่อน (Klui อาจอยากคุมเอง)

---

## 🔧 Verify method (ไม่มี GAS backend ในมือ)
- `node --check` ทุก `<script>` inline (extractor นับ regex, คาดหวัง **10 บล็อก 0 error**)
- Harness: extract ฟังก์ชันจริงด้วย brace-matcher → eval + mock globals → assert (ทำมาตลอด session, เช่น clinic-conflict 5/5, tombstone 12/12). วางที่ scratchpad หรือชื่อ `_h_*` เท่านั้น (`.claspignore` กัน) แล้วลบทิ้ง
- `calendar-sync-app/Code.js` = `node --check` ได้ (syntax) แต่ทดสอบ CalendarApp runtime ไม่ได้ → Klui live-test

## Gotchas
- LF→CRLF warning ตอน commit = ปกติ (ไม่กระทบ)
- `.claude/.last-clasp-push-calendar.hash` = state ของ Stop-hook (auto-managed) อย่า commit รวมกับโค้ด
- round detection = substring บน `shift` field ("รอบ 1/2/3", "กลางวัน"/"เช้า"); DOW จาก `date` `(จ./อ./พ./พฤ./ศ./ส./อา.)`; **ไม่มี** field round เป็นเลข
- edit mode: cluster ลบแล้ว, เข้า edit ได้แค่ผ่าน action-first flow (แลกเวร tab); ตารางเวร view-only

**Memory:** `project_v344_nicknames_and_nav.md` (รายละเอียดครบทุก commit + เหตุผล)
