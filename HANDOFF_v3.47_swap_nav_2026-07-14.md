# HANDOFF — Bottom Nav + แลกเวร Action-First Overhaul (v3.47)
**วันที่:** 2026-07-14 · **ไฟล์เดียวที่แตะ:** `Index.html` (frontend-only, **ไม่แตะ GAS .js**)
**สถานะ:** ทั้งหมด commit + push ขึ้น `origin/main` แล้ว · verified ใน harness · **ยังไม่ deploy GAS version ใหม่** · Klui บอก "เกือบดี ยังมีที่ต้องแก้อยู่" (ยังไม่ระบุว่าอะไร — session ถัดไปถาม Klui ก่อน)

---

## ⚠️ อ่านก่อน (2 เรื่องสำคัญ)
1. **DEPLOY:** ทุกอย่างในไฟล์นี้ = แก้ `Index.html` เท่านั้น → ต้อง **สร้าง GAS deployment version ใหม่** (Deploy → Manage deployments → ✏️ → New version → Deploy) ถึงจะขึ้นที่ `/exec`. HEAD สะอาด+ล่าสุดแล้ว.
2. **CONCURRENCY:** มี **อีก session** (งาน `calendar-sync-app/` + ปุ่มซิงค์ Google Calendar) กำลังแก้ `Index.html` **ไฟล์เดียวกันคู่ขนาน**. รอบนี้ commit ชนกันครั้งนึง (โค้ด action-first ของ swap ไป bundle อยู่ใน commit `94df934` ของเขา — โค้ดครบไม่หาย). **อย่ารัน 2 session แก้ Index.html พร้อมกัน** — ถ้าเลี่ยงไม่ได้ ให้ `git fetch` + เช็คบ่อยๆ.

---

## สิ่งที่ทำเสร็จ (commit บน main, เก่า→ใหม่)
| commit | งาน |
|---|---|
| `a04c044` | **Bottom nav 3 แท็บ** (ตารางเวร / แลกเวร / ฉัน) — `phxSetTab()`, body[data-tab] |
| `9a36ea5` | แลกเวร = edit portal (template `.swf-tbl`) + สรุป |
| `8589027` | ปุ่มโน้ต FAB (แทนดินสอ) + ลบ toggle "ต้นฉบับ" + ย้าย Audit ใต้ version + fix login/logout ไม่รีเฟรช |
| `a62bc72` | ปฏิทินส่วนตัวในแท็บ (toggle) + refactor `renderCalendar(name)→(name,opts)` + fix badge บาง |
| `dcb1d41` | toggle ตาราง/ปฏิทิน ใน picker + `renderCalendar` opts.onlyKeys |
| `94df934`* | **action-first buttons** (สลับ/ยก/รับ/ยกเลิก) + `_phxEnsureEditFor` (*bundled กับ calendar-sync) |
| `b6c2f1a` | แท็บเหลือแค่ ปุ่ม action + สรุป "แลกเวรเดือนนี้ไปแล้ว" (ลบตาราง "เวรของฉัน" + toggle บนแท็บ) |
| `047c43a` | แถบสรุปจำนวนเวร (`.personal-summary`) ในปฏิทิน picker |
| `ddf10b2` | fix: ยกเลิก→หน้ายืนยันตรงๆ (cancel go='undo') + สลับไม่มีเมนูแวบ (synchronous actionGoTo) |
| `33215c0` | perf: โมดัลเลือกเวรขึ้นทันที (defer `updatePickerListContent` 1 tick + "กำลังโหลด…") |

**เวอร์ชันในโค้ด ยังเป็น v3.46** (Klui ตั้งชื่อ release เอง — ยังไม่ bump).

---

## สถาปัตยกรรม แท็บแลกเวร (ปัจจุบัน)
ทุกอย่างอยู่ใน **IIFE ก้อนเดียว** ("v3.47 — Bottom-nav tab controller") ใน `<script>` ก่อน `</body>`.

**Markup** `#phxViewSwap` (~บรรทัด 2143): title + sub + `#phxSwapActions` (ปุ่ม 4) + `#phxSwapBody` (สรุปอย่างเดียว). **ไม่มี** toggle/ปฏิทินบนแท็บแล้ว (ย้ายไป picker).

**ปุ่ม action → `phxSwapAction(kind)`** (kind = swap|give|receive|cancel):
- ทุก kind เรียก **`_phxEnsureEditFor(me)`** ก่อน = ตั้ง `editModeActive=true` + **pin `selectedPharmacists=[me]`** ตรงๆ (ไม่ผ่าน `toggleEditMode`). **สำคัญ:** `openActionModalForKey` ต้องการ editModeActive + `findShiftByKey` ของ ghost `_g_` คีย์ด้วย `getCurrentUser()` → ถ้า admin ไม่กรองชื่อตัวเอง getCurrentUser()=null จะพัง. pin filter แก้หมด.
- `receive` → `openActionModalForAdd()` (step 'add' = "ยืนยันการรับเวร").
- `swap`/`give`/`cancel` → `_phxActionPicker(...)` (bottom-sheet เลือกเวร) → onPick:
  - `openActionModalForKey(key)` แล้ว **synchronous** `actionGoTo(cfg.go)` (guard: `#actionModal` display==='flex')
  - go: swap→'swap', give→'give', **cancel→'undo'** (renderUndoStep = หน้ายืนยันยกเลิกตรงๆ ทั้ง used และ ghost)
  - synchronous (ไม่ setTimeout) → เมนูกลางทาง**ไม่แวบ** (browser วาดแค่ step ปลายทาง)

**`_phxActionPicker(opts)`** = bottom-sheet มี toggle ตาราง/ปฏิทิน:
- ตาราง = `_swapTable`/`_swapRow` (rows `phx-act-pick` + `data-act-pick-key`)
- ปฏิทิน = `phxActPickMode('calendar')` → `_phxRenderActPickCalendar()` → `renderCalendar(me, {gridEl:#phxActPickCalGrid, ..., swapTap:true, onlyKeys})` + แถบสรุป `#phxActPickCalBanner`
- **onlyKeys** = เซ็ตคีย์ของเวรที่เลือกได้ (swap/give=`sets.held`, cancel=`sets.changed`) → ปฏิทินโชว์เฉพาะเวรพวกนี้
- เลือกเวร: table row (`data-act-pick-key`) หรือ calendar badge (`data-swap-cal-key` → handler route ไป `_phxActPickCb` ถ้า `#phxActPickOverlay` เปิด) → เรียก `onPick(key)`

**`_phxMyShiftSets(me)`** → `{held, changed, noteMap}`: held = เวรของฉันที่ยังถืออยู่ (`!usedMap`) + ghosts รับมา; changed = ยกไป (`usedMap`) + ghosts รับมา.

**ปุ่มโน้ต FAB (`#phxFab`)** → `phxNoteFabTap()` = picker (ยังใช้ `phx-note-pick`/`phxNotePickClose` ของตัวเอง — **ไม่ได้รวมกับ `_phxActionPicker`**) → `_noteEdit(key)`. `phxUpdateFabUI` ยังคุมโชว์/ซ่อน FAB (canEdit && !editOn).

**`renderCalendar(name, opts)`** (~7879) — refactor รับ opts (default = ของหลัก → caller เดิม 2 จุด @7617/@9037 ไม่กระทบ): `gridEl/headerEl/noticeEl/wrapperEl/viewer/mid/swapTap/onlyKeys`. swapTap → badge ได้ `data-swap-cal-key`, suppress `data-cal-day`/phx-triggers.

---

## จุด render/sync
- `phxSetTab(tab)` → set body[data-tab] + เรียก `phxRenderSwapView()`/`phxRenderMeView()`
- `renderTable` (ตารางหลัก) ท้ายฟังก์ชันเรียก `phxRefreshActiveTab()` → แท็บ swap/me sync ทุกครั้งที่ตาราง render
- `phxAuthSetSession`/`phxAuthClearSession` เพิ่ม `phxRefreshActiveTab()` → login/logout อัปเดตทันที

## Dead code (ปลอดภัย ปล่อยไว้ได้ / เก็บกวาดได้)
- `phxSwapMode` + `_phxRenderSwapCalendar` (ปฏิทินบนแท็บ) — ไม่มี caller แล้ว (ลบ toggle บนแท็บไป), guarded no-op
- `phxSwapEnterEdit` — เดิมปุ่ม empty-state (เอาออกแล้ว)

---

## 🔧 ยังต้องแก้ / ตรวจ (session ถัดไป — **ถาม Klui ก่อนว่าอะไรบ้าง**)
Klui บอก "เกือบดี ยังมีที่ต้องแก้อยู่" ยังไม่ระบุ. รายการที่ผม**สงสัย/สังเกตเอง** (เป็น lead):
1. **badge เขียวหลังชื่อทุกแถว** — ในสกรีนช็อตตาราง/สรุป เห็น badge เขียวเล็กๆ หลัง "ขลุ่ย" **ทุกแถว** (ไม่น่าใช่ "รับมา" ที่ควรขึ้นเฉพาะ ghost). อาจเป็น nickname display หรือ tag bug — **ควรเช็ค `_swapRow` + `displayName`**.
2. **picker list ยังช้าตอนเวรเยอะจริง** — เสนอ Klui ไว้: ทำ pagination / cache `_pbHolderOf` ล่วงหน้า (ยังไม่ทำ).
3. **ปุ่มโน้ต FAB โผล่ทุกแท็บ** (ที่เลือกชื่อ + ไม่ edit) — Klui อาจอยากให้โผล่แค่บางแท็บ.
4. **note FAB picker ยังแยกจาก `_phxActionPicker`** — ถ้าจะให้ note picker มี toggle ตาราง/ปฏิทินด้วย ต้อง refactor มาใช้ `_phxActionPicker` (ตอนนี้ยังใช้ `phx-note-pick` เดิม).
5. **`New Text Document.txt`** ค้างสถานะลบใน working tree (ไม่ใช่งาน swap — ไฟล์เปล่า) — ลบ commit ทิ้งได้ถ้า Klui โอเค.

---

## ✅ วิธี verify (ไม่มี GAS backend ในมือ)
1. `node --check` ทุก `<script>` inline (extractor นับ regex `<script>...</script>`) — คาดหวัง **10 บล็อก 0 error** + เช็ค `<div>/<button>` balance
2. **Harness แยก:** extract `<style>` + `renderCalendar` (จริง) + IIFE (จริง) + `#phxViewSwap` markup → เขียน `_h_mocks.js` (mock: rawData/getCurrentUser/P2B/OverlayManager/buildGhostRows/_combinedUsedMap/openActionModalForKey/openActionModalForAdd/actionGoTo/getEffectiveData/parseRangeToMinutes ฯลฯ) → serve ผ่าน node static server → ทดสอบด้วย `mcp__Claude_Browser__javascript_tool` (assert DOM/behavior)
   - **⚠️ วาง harness ที่ scratchpad หรือชื่อ `_h_*`/`_nav_test*`/`*_tmp.*` เท่านั้น** — `.claspignore` กันไฟล์พวกนี้ไม่ให้ Stop-hook `clasp push` ดันขึ้น GAS (เคยหลุด `_h_iife.js` ขึ้น GAS → "window is not defined" server-side). ลบทิ้งหลังเทสทุกครั้ง.
   - screenshot ของ preview pane **มักค้าง** (ไม่ใช่บั๊กโค้ด) → ใช้ `javascript_tool` assert DOM แทน

---

## Gotchas
- Stop-hook `.claude/hooks/clasp-autopush.sh` auto `clasp push` เมื่อ hash โค้ดเปลี่ยน (นับ `*.js/*.gs/*.html/*.json`). `.claspignore` = ปิดหมด แล้วเปิด `!*.js/!*.html` → **ไฟล์ .js/.html ใน root ทุกตัวขึ้น GAS** (ระวัง temp files).
- `openActionModalForKey` gate: `!editModeActive` return เงียบ; ถ้า login แล้ว shift ต้อง `===P2B.boundName`. `findShiftByKey` ของ `_g_` คีย์ด้วย `getCurrentUser()`.
- ตาราง badge หลัก (renderTable ~7473): `<div class="inline-flex ... badge-* ... font-bold ...">` + span `font-bold tracking-tight`/`font-light ...` (flowbite CSS โหลด @บรรทัด 12 → utility ทำงาน). `_swapRow` ใช้ markup เดียวกันแล้ว.

**Memory:** ดู `project_v344_nicknames_and_nav.md` (มีรายละเอียดครบทุก commit + เหตุผล).
