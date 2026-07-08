# HANDOFF v3.44 — LWW engine DONE + correct · blocker is SYNC

**วันที่:** 8 กรกฎาคม 2569 (อัปเดต — เดิม 7 ก.ค.)
**Worktree:** LOCAL `clever-zhukovsky-390ab9` · branch `work/v3.44-lww`
**สถานะ:** 🟢 LWW เสร็จ · 🟢 **SYNC fix (option ข) เทสผ่าน** (server round-trip + client 4 เคส) · 🟢 live-update overlay + ปุ่มรีเฟรช เพิ่มแล้ว · commit local แล้ว — **ยัง NOT PUSHED**

---

## 🆕 อัปเดต 8 ก.ค. — Sync fix + live-update overlay + ปุ่มรีเฟรช (commit local, ยังไม่ push)

**สรุปรอบนี้:** แก้ให้ publish ไปถึง server จริง (blocker เดิม) + ทำให้ overlay ของคนอื่นเด้งขึ้นเองไม่ต้องรีเฟรช + เพิ่มปุ่มรีเฟรชมือ. ทุกอย่าง flag/rollback ได้ · deploy = paste `Index.html` + `Phase_Z_B3_Sync.js` คู่กัน

### 1. SYNC fix (option ข) — ✅ เทสผ่านแล้ว
**Diagnosis เดิมผิดนิดหน่อย:** overlay **ขึ้น server จริง** (login-sync auto-push ตอน addAction) แต่เป็น **draft** — การพลิก draft→public ไปไม่ถึง server เพราะ (ก) `publishAction`/`unpublishAction` ไม่ถูก hook เข้า login-sync (มีแค่ add/remove) (ข) server `phxPushActions` **skip id ซ้ำ** (ไม่ upsert) → รีเฟรช `phxCloudPullAll` ดึง draft ทับ → ย้อนเป็น draft
- **`Phase_Z_B3_Sync.js`** `phxPushActions` skip→**UPSERT** (เขียนทับ cols 3-5 เมื่อ payload เปลี่ยนจริง; เหมือนเดิม=`unchanged` ไม่เขียน sheet). return เพิ่ม `updated`/`unchanged`. `testB3RoundTrip` + step [3b] พิสูจน์ upsert
- **`Index.html`** flag `window._syncPublish` + `setSyncPublish(on)` (localStorage `sync_publish`, ~L2510 ข้าง `setLwwEngine`) · wrap `publishAction`/`unpublishAction` ใน `_phxWrapOverlayForSync` (~L11660) → `_phxScheduleSync()` เมื่อ flag เปิด
- **เทสแล้ว:** server `testB3RoundTrip` เขียวรวม [3b] `updated=3` · client Klui เทสครบ 4 เคส (รับตรง/อ้อม + แลกตรง/อ้อม) ✅
- **default OFF** · flip 1 บรรทัด (`=== '1'`→`!== '0'`) = เปิดทุกคน · rollback `setSyncPublish(false)`. ⚠️ **deploy 2 ไฟล์คู่กัน** ไม่งั้น flip ไม่ถึง server

### 2. Live-update overlay — ✅ (บั๊ก "คนอื่นแก้แล้วไม่เห็นจนรีเฟรช")
**Root cause:** `getDataSignature` ([Index.html ~L5034](Index.html)) ดูแค่ **master schedule ไม่ดู overlays** → poll 30 วิ ข้าม overlay-only changes; Firebase ก็ **ไม่ขน overlay** (ขนแค่ `schedules/<key>`) → published overlay ไม่โผล่จน manual refresh
- Fix: `_pbOverlaySignature(pb)` (fingerprint รวม `_visibility` → จับ draft→public ที่ count เท่าเดิม) + poll เช็ก overlay แยกจาก master → `_pbRefreshInPlace(overlays)` (adopt `pathBOverlays` + retro-mirror + `triggerUpdate`). sync `_lastPbSignature` ที่ `fetchPathBOverlays` + `handleDataReceived`
- ผล: overlay ของคนอื่นเด้งเอง **≤30 วิ** (เดิม 1-2 นาที + ต้องรีเฟรช)

### 3. ปุ่มรีเฟรช (soft refresh) — ✅
`phxManualRefresh()` + ปุ่ม `#phxRefreshBtn` (ไอคอน `#phxRefreshIcon`) ในแถว **`#lwwViewToggle`** ("มุมมอง:" toggle, ชิดขวา `margin-left:auto`). ดึง `getScheduleData` 1 รอบ → master เปลี่ยน `handleDataReceived` / เหมือนเดิม `_pbRefreshInPlace`. หมุนไอคอน (`.phx-spinning`) + toast `_p2bShowToast('อัปเดตแล้ว')`. **หมายเหตุ:** อยู่ **หน้าตารางเท่านั้น** (ปฏิทินยังไม่มี — Klui รับทราบ)

### 4. Fix เล็ก
- **ยาม id เพี้ยน:** publish ([Index.html:3803/3833](Index.html)) เรียก `fetchPathBOverlays` ด้วย selector value (numeric id) แทน label id → stale-guard ไม่เตือนผิด/ไม่ตกไป cache
- **ชื่อเจ้าของแลกอ้อม:** `_lwwBackedGhosts` เก็บ `_ghostOrigOwner`=s.name (master); `_lwwAnnotateConflicts` เติม `— เวรเดิมของ X` เมื่อ origOwner ≠ partner ≠ viewer (แลก**ตรง**ไม่ขึ้น เพราะ origOwner=partner). ใช้กับ "รับ" ด้วย

### 🔥 Firebase "ดับ" = ไม่ได้ดับ
console จริง: **3/100 conn, <1% load, 0 errors**. log `[Bcast] 🔥 burst started (poll)` = ฟีเจอร์ broadcast-burst (poll เจอ master เปลี่ยน → เช็กประกาศ 60s×5min) **ไม่ใช่ error** (ไฟ 🔥 คือชื่อโหมด). อาการจริงที่ Klui เจอ = live-update overlay ไม่มา → **แก้ในข้อ 2 แล้ว**. ไม่ต้องไปยุ่ง Firebase reconnect (มันช่วย overlay ไม่ได้อยู่แล้ว)

---

## 🎯 TL;DR สำหรับ session ถัดไป

1. **LWW เสร็จและถูกต้อง** — อย่าไปแก้ LWW อีก มันทำงานถูกทุกเคส (พิสูจน์ 3 ทาง: Node tests, `LWWCompare` เขียว 2 เดือน, in-memory injection แสดงผลถูก)
2. **ปัญหาเดียวที่เหลือ = SYNC** (การทำให้ overlay เป็น public จริงบน server) — ทำ **option (ข)** ต่อ
3. **โค้ดทั้งหมด commit แล้ว 10 อัน แต่ยัง NOT PUSHED** — อยู่แค่ในเครื่อง `clever-zhukovsky-390ab9`
4. คุยกับ Klui เป็นภาษาง่าย + metaphor ชีวิตประจำวัน · Klui อ่านโค้ดได้แต่ไม่ใช่ dev อาชีพ · เป็น admin คนเดียวที่ใช้จริง · deploy ด้วยการ paste เอง (ไม่ใช้ clasp)

---

## ✅ ทำอะไรไปแล้ว (10 commits, local, unpushed)

```
142faba Path B — wire renderTable strikes to LWW too (was half-wired)
2b941eb Path B — persist _lwwEngine flag in localStorage
391a828 Path B — LWW-backed engine behind window._lwwEngine flag
39ce1d6 Step 4b — center name picker (mobile), replaces datalist
5538606 Step 4b — "รับจาก C" confirm dialog + draft-leak fix
48b78c1 Step 4a (rev) — toggle shows ต้นฉบับ, not LWW clean view
b2ababe Step 4a — LWW "current owner" view toggle (opt-in) [superseded by 48b78c1]
5c6e029 Step 3 — LWWCompare.runAll() all-month sweep
4ec9abf Step 2 — LWWCompare harness (OLD vs LWW)
d884474 Step 1 — LWW ownership resolver (parallel)
```
(base = `912aa18` = v3.43 code, บน `origin/work/v3.44-lww`)

### สิ่งที่มีในโค้ดตอนนี้ (ทั้งหมดใน `Index.html` block #1)

| ส่วน | ฟังก์ชัน | ทำอะไร |
|---|---|---|
| **LWW resolver** (`window.LWW`) | `currentOwner/ledger/ownershipMap/movedOwners/buildRecords/_resolveKey` | สมองกลาง: อ่าน overlays+master → "ตอนนี้ใครถือ" ต่อ slot (record ล่าสุดชนะ, resolve `_g_` chain → master slotKey) |
| **Compare harness** (`window.LWWCompare`) | `.run(monthId?)` · `.runAll()` | เทียบ OLD engine vs LWW ต่อคน (tuple `date¦pos¦range`) → เขียว = ตรงกัน. **มิ.ย.+ก.ค. เขียวหมด** |
| **Path B engine** (flag `window._lwwEngine`) | `setLwwEngine(on)`, `_lwwBackedGhosts`, `_lwwBackedUsedMap`, `_lwwViewerRecords`, `_lwwLatestMap`, `_lwwAnnotateConflicts` | LWW เป็นสมองของ render จริง. `buildGhostRows`+`_combinedUsedMap`+`renderTable` delegate ไป LWW เมื่อ flag เปิด |
| **View toggle** (Step 4a) | `setOrigView`, `_origBuildRows`, `renderOriginalTable` · UI `#lwwViewToggle` | ปุ่ม `[หลังแลก]`(เดิม, default) / `[ต้นฉบับ]`(rawData ดิบ ไม่มี overlay) |
| **Write UI** (Step 4b) | `_lwwTransferConfirm`, `_lwwNamePicker` (+`_lwwTransferClose/_lwwNamePickerClose/_lwwFmtAt2`) | ตอน add/swap เด้ง confirm: Level-1 (โชว์เจ้าของ+เวลา) + ช่อง "รับจาก/แลกกับ" (popup กลางจอ ค้นหาชื่อ) เก็บเป็น `partnerName` (ฟอร์แมตเดิม ไม่พังวิว) |
| **Draft-leak fix** (Step 4b) | ใน `PBOverlays.getUsedMap` + `buildGhostRows` Pass 0 | ข้าม record `_visibility==='draft'` → ร่างไม่รั่วไปหน้าคนอื่น |

### วิธีเปิด LWW engine (สำหรับเทส)
```js
setLwwEngine(true)   // เปิด (จำค่าใน localStorage 'lww_engine' — ไม่รีเซ็ตตอนรีเฟรช)
setLwwEngine(false)  // ปิด กลับ engine เดิมทันที (rollback 1 คำสั่ง)
```
default = OFF → คนอื่น 300 คนไม่กระทบ. พอมั่นใจ → แก้ default 1 บรรทัด (`localStorage.getItem('lww_engine') === '1'` → `!== '0'`) = เปิดให้ทุกคนอัตโนมัติ

---

## 🔴 ตัวบล็อกจริง: SYNC (นี่คืองานถัดไป = option ข)

**LWW ไม่ใช่ปัญหา** — ที่ Klui เทสแล้ว "เผยแพร่ไม่ติด / คนอื่นไม่เห็น / รีเฟรชกลับเป็น draft" เพราะ **overlay ไม่เคยขึ้น server จริง**

### รากของปัญหา: แอปมี sync ซ้อนกัน 2 ระบบ
| ระบบ | auth | ที่อยู่ | สถานะ |
|---|---|---|---|
| **1. `SYNC` object** (sync code) | `codeHash` (localStorage `siriraj_sync_code_v1`) | Index.html ~7628 | ❌ `enabled=false` (Klui จำ code ไม่ได้ + กู้ไม่ได้เพราะ server เก็บแค่ hash) |
| **2. login-based** | ชื่อ+รหัสผ่าน (P2B login) | `phxCloudSyncBoth`/`phxCloudPushAll`/`phxCloudPullAll` (~11266) → server `phxPushActions(name,pwHash,...)` | น่าจะเป็น**ตัวจริง** (server function ใช้ name+pwHash) |

**บั๊กหลัก:** `OverlayManager.publishAction` (Index.html ~2737) push ผ่าน `if (SYNC.enabled) SYNC.pushAction(...)` = ระบบ **1 ที่ปิดอยู่** → กดเผยแพร่แล้ว local=public แต่**ไม่มีอะไรขึ้น server** → รีเฟรช server ไม่มี → กลับเป็น draft

⚠️ Klui เข้าใจว่าเป็น "Firebase ดับ" — **ไม่ใช่**. Firebase = แค่กระดิ่ง live-update. ตัวส่งข้อมูลจริงคือ sync (GAS/sheet)

### 🚦 NEXT (option ข) — rewire publish ไป login-based
1. อ่าน `phxCloudPushAll` / `phxCloudPullAll` / `phxCloudSyncBoth` (Index.html ~11266+) ให้ครบ — ดูว่ามัน push local public actions ขึ้น server ยังไง (login auth)
2. ทำให้ `publishAction`/`unpublishAction`/`removeAction` วิ่งผ่าน**ระบบ login-based** (ที่ Klui login อยู่แล้ว) แทน `SYNC.*` (codeHash ที่ปิด/พัง)
   - หรือ: ทำให้ `SYNC.enabled` ผูกกับ login state แทน sync code
3. ตรวจ `phxPushActions` (Phase_Z_B3_Sync.js:47) ว่า upsert by actionId (ไม่ dup) — ก่อนแนะนำ re-upload
4. เทส: เผยแพร่ → รีเฟรช → ยังเป็น public → คนอื่นเห็น → ยกเลิกได้
5. ทำแบบ **flag/ถอยกลับได้** เหมือน Path B (Klui ระวัง 300 คนมาก)

**เช็ก state ปัจจุบัน (console):**
```js
SYNC.enabled                              // false = ระบบ code ปิด
localStorage.getItem('siriraj_sync_code_v1')  // null = ไม่มี code
typeof phxAuthIsLoggedIn === 'function' && phxAuthIsLoggedIn()  // Klui login อยู่ไหม
```

---

## ⚖️ Decisions ที่ล็อกแล้ว (อย่ารื้อ)
- **Scope B**: LWW เป็นสมอง, **หน้าตาเดิมที่ Klui ชอบ** (Klui ปฏิเสธวิว LWW แบบสะอาด — เก็บ ghost "รับจาก X" + ขีดฆ่าเหมือนเดิม)
- `at` = **server-stamp ตอน publish** (ยังไม่ทำ — ตอนนี้ใช้ createdAt client)
- กันชนกัน = **Level-1 อย่างเดียว** (โชว์เจ้าของ+เวลา ก่อนยืนยัน, ไม่มีไฟแดงอัตโนมัติ)
- ช่อง "รับจาก" = **dropdown + พิมพ์เพิ่มได้** (ทำแล้ว = `_lwwNamePicker`)
- ใครบันทึก = **user ทำเอง + admin override** (override ยังไม่ทำ = 4c)
- **"แลกกับ" (swap) ต่างจาก "รับจาก" (add):** swap คู่แลกต้องเป็นเจ้าของจริง (ไม่งั้น 3 เส้าเบี้ยว); add ใส่ชื่อใครก็ได้ (แค่ป้าย, เวรเข้าตัวคนรับเสมอ)

## 📋 งานค้าง (หลังแก้ sync)
- **4c**: admin override (ตั้งเจ้าของเป็นใครก็ได้ = 1 record ทับ) + server-stamp `at`
- **Path B ยังไม่ครบ**: swap pair-color dots, calendar view, export used-maps ยังไม่ผูก LWW (renderTable ผูกแล้ว) — ดู commit `142faba` note
- ปุ่ม "แก้ไขผู้รับ" บน record ที่บันทึกแล้ว (Klui ขอ — ยังไม่ทำ)
- guard เตือนเมื่อพิมพ์ชื่อนอกระบบ (มี "ใช้ชื่อ...(ไม่มีในระบบ)" ใน picker แล้ว แต่ยังไม่ warn ตอน swap)

---

## 🧪 เครื่องมือเทส (console, ต้องสลับ frame เป็น `userHtmlFrame` ก่อน)
- `LWWCompare.run()` / `await LWWCompare.runAll()` → เทียบ OLD vs LWW (เขียว = ตรง)
- `setLwwEngine(true/false)` → เปิด/ปิด LWW engine
- **พิสูจน์ render (ไม่ต้อง sync):** ฉีด public overlay เข้า `pathBOverlays` in-memory แล้ว `invalidateGhostCache(); triggerUpdate()` → เห็น render ถูก (refresh หายเอง)

## 🔗 Key numbers/paths
- Sheet ID: `1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM` · Overlay sheet: `PHX_Overlays_v2` (col5=payload JSON)
- makeShiftKey = `date|pos|origOwner|range` (master immutable = slotKey นิ่ง)
- ไฟล์แก้: `Index.html` (ทั้งหมด) — **ยังไม่ push** → session ถัดไปควรถาม Klui ว่า push ขึ้น `work/v3.44-lww` ไหม (Klui ยังไม่ตอบเรื่อง push ทั้ง session — เขา paste จาก local worktree `clever-zhukovsky-390ab9`)
- ⚠️ อย่า paste ผิด worktree — v3.44 อยู่ใน `clever-zhukovsky-390ab9` เท่านั้น

## 🎓 บทเรียนเรื่อง Klui (session นี้)
- เทสของจริงเก่งมาก + จับ edge case ได้ (chain, mobile UI, draft leak) — ฟังเขาแล้วมักเจอบั๊กจริง
- ชอบเห็นผลเป็นรูปธรรม (in-memory injection ทำให้เขามั่นใจ LWW) มากกว่าคำอธิบายลอย ๆ
- ระวัง: เขาอาจจำรายละเอียดเทสสลับ (ธีทัต↔ชลิสา) — ดู data จริงเสมอ อย่าเชื่อ recall
- ทุกครั้งที่เจออาการแปลก **ให้ dump ข้อมูลจริงก่อน** (pathBOverlays + OverlayManager local + LWW output) — session นี้เสียเวลาเพราะเดาก่อนดู
