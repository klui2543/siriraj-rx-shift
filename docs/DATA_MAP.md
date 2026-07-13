# Data Map — Siriraj Rx Shift (v3.45)

**สถานะ:** เอกสารสำรวจ (audit) — บันทึกว่า "ตอนนี้" ข้อมูลแต่ละก้อนเก็บอยู่ที่ไหนบ้างจริงๆ ในโค้ด ไม่ใช่แผนสถาปัตยกรรมใหม่
**ทำไมต้องมีเอกสารนี้:** ระบบโตขึ้นทีละฟีเจอร์ (overlay → LWW → draft/publish → relay legs → nicknames) โดยไม่เคยมีใครนั่งไล่ทีเดียวว่า "ข้อมูลชนิดนี้ควรอยู่ที่ไหน" — ผลคือมีจุดที่ข้อมูลชนิดเดียวกันถูกเก็บซ้ำหลายที่โดยไม่ตั้งใจ, มี key ให้ความหมายเดียวกันแต่คำนวณคนละสูตร, และมี flag ที่ชื่อบอกว่าคุมทั้งหมดแต่จริงคุมแค่บางส่วน
**อิงโค้ด ณ:** v3.45 (commit `d9a0738`, main) — สำรวจโดยอ่านโค้ดจริงทุกไฟล์ ไม่ได้เดาจาก HANDOFF/DESIGN doc (เอกสารเก่าบางฉบับ "ไม่ตรง" กับโค้ดจริงแล้ว จุดที่พบจะระบุไว้)
**ขอบเขต:** เฉพาะระบบปัจจุบัน (หน่วยงานเดียว) — ไม่รวมแผน multi-unit ในอนาคต (ดู [`DESIGN_hospital_scale.md`](DESIGN_hospital_scale.md) ถ้าต้องการอ่านแผนอนาคต)

---

## 1. ภาพรวม: ข้อมูลเก็บอยู่ใน "4 ห้อง" อะไรบ้าง

คิดง่ายๆ เหมือนบ้าน 4 ห้องที่ข้อมูลเดินเข้าออกได้:

```
┌───────────────────────────┐     ┌───────────────────────────┐
│  1. Google Sheets           │     │  2. Firebase RTDB           │
│  "ห้องเก็บของถาวร"          │────▶│  "ห้องอ่านเร็ว" (mirror)     │
│  ต้นฉบับตารางเวร/บัญชี/audit │ sync │  frontend อ่านตรงจากที่นี่     │
└───────────────────────────┘     └───────────────────────────┘
              ▲                                  │
              │ GAS fallback (เมื่อ Firebase ดับ)   │
              │                                  ▼
┌───────────────────────────┐     ┌───────────────────────────┐
│  4. ตัวแปรในหน่วยความจำ      │◀────│  3. localStorage/           │
│  "กระดาษทด" — หายเมื่อ       │     │     sessionStorage          │
│  รีเฟรชหน้า/ปิดแท็บ           │     │  "กระเป๋าส่วนตัวเบราว์เซอร์"  │
└───────────────────────────┘     └───────────────────────────┘
```

- **Google Sheets** = ที่เดียวที่ถือว่าเป็น "ความจริง" ได้จริง (schedule master, บัญชีผู้ใช้, audit log, overlay/action ทุกชนิด, การตั้งค่า reminder ฯลฯ)
- **Firebase RTDB** = สำเนาไว้อ่านเร็ว ไม่ใช่ต้นฉบับ — ปัญหาคือบางจุด (schedule, nicknames) มันกลายเป็น "ต้นฉบับโดยพฤตินัย" เพราะ client อ่านจากตรงนี้เป็นหลัก ทั้งที่ยังไม่มี reconciliation job คอยเช็คว่าตรงกับ Sheet เป๊ะ
- **localStorage/sessionStorage** = ของเบราว์เซอร์เครื่องนั้นเครื่องเดียว **ไม่ตามผู้ใช้ข้ามเครื่อง** — จุดสังเกตสำคัญ: มี flag/ค่าหลายตัวที่ "ควร" ผูกกับบัญชีแต่ดันเก็บที่นี่ (ดู §4)
- **ตัวแปรในหน่วยความจำ (JS variable)** = ชั่วคราวจริงๆ หายเมื่อรีเฟรชหรือปิดแท็บ เหมาะกับ UI state ระหว่างแก้ไขเท่านั้น

---

## 2. แผนที่ข้อมูลแยกตามโดเมน

### 2.1 ตารางเวรหลัก + Config + Log การใช้งาน

| Entity | ความหมาย | เก็บที่ไหน (ทุกที่) | โครงสร้าง key | เขียนที่ | อ่านที่ | จุดสังเกต/ความเสี่ยง |
|---|---|---|---|---|---|---|
| ตารางเวรรายเดือน | กะเวรของเภสัชกรแต่ละคนแต่ละวัน | (1) Sheet `SCHEDULE_SHEET_ID` 1 tab/เดือน (ต้นฉบับ warning-only); (2) Firebase `schedules/{monthId}`; (3) Drive JSON `DB_{label}.json` (legacy fallback ยังเขียนทุก upload) | **Sheet**: `monthId` = random timestamp (ผ่าน Schedule_Index) ≠ **Firebase**: `monthId` = label-derived `"m_"+label.replace(/\s+/g,'_')` — คนละ scheme, เชื่อมกันด้วย string label เท่านั้น | `writeScheduleToSheet_` code.js:1190; `pushToFirebase_` code.js:511 | `getScheduleData` code.js:175; client `fetchMonthData` Index.html:7108 | Whitespace เพี้ยนจาก Excel = หาไม่เจอ. `deleteMonth`/`deleteAllData` (code.js:859) ลบแค่ MONTH_LIST+Drive JSON **ไม่ลบ Firebase node หรือ Sheet tab** — เดือน "ลบแล้ว" ยังโผล่ได้ |
| MONTH_LIST | metadata เดือนที่มีในระบบ | PropertiesService key `MONTH_LIST` (JSON array) | unique by `label` (ไม่ใช่ `id`) | `saveMonthToDatabase_` code.js:269 | `getAvailableMonths` code.js:163 | เขียนคู่ขนานกับ Schedule_Index คนละ call ไม่มี transaction เชื่อม |
| Schedule_Index | ดัชนี tab ของแต่ละเดือน | Sheet tab "Schedule_Index" | col A = month_id | `updateScheduleIndex_` code.js:1523 (schema 9-col) | `readScheduleFromSheet_` code.js:1547 | Header เคยเปลี่ยน 6→9 คอลัมน์กลางทาง — โค้ดสร้าง sheet ใหม่ (code.js:965) ยังเขียน header 6-col เก่า มี migration script แก้ไขดริฟท์นี้แยกต่างหาก (`phxMigrateToSingleTab_*`) — หลักฐานว่าเคยพังจริง |
| Master Time/People reference | ตำแหน่ง↔ช่วงเวลา + รายชื่อยืนยันแล้ว | Sheet `MASTER_TIME_SHEET_ID` (แก้มือ) + cache `MASTER_DATA_CACHE` (TTL 1 ชม.) | keyed by normalized pos code/name | แก้บน Sheet เอง | `transformBlobData_` code.js:596 | Column detection เดาจากข้อความหัวตาราง — เปลี่ยนคำแล้ว silently หาไม่เจอ; cache 1 ชม. ทำให้แก้แล้วไม่มีผลทันที |
| Upload/transform stats log | log สถิติทุก upload | Sheet `STATS_SHEET_ID`, append ที่ range `"A1"` (ไม่ระบุชื่อ tab) | append-only | `logStatisticsToSheet_` code.js:842 | ไม่มีจุดอ่านกลับ (write-only) | Range "A1" ไม่ qualify tab → เขียนลง sheet **แรก** เสมอ — สลับลำดับ tab แล้ว log หลุดไปผิด tab แบบเงียบๆ |
| DeviceLog | สัดส่วนอุปกรณ์ที่เข้าใช้ | Sheet `STATS_SHEET_ID` tab "DeviceLog" | append-only, throttle 1/browser/วัน | `logDeviceType` code.js:1841 ← Index.html:6771 | ไม่มีจุดอ่านกลับ | เรียกโดยไม่ส่ง email → ทุกแถว email = `"(anonymous)"` เสมอ คอลัมน์นี้ไม่มีข้อมูลใช้งานจริง |
| Admin password hash | hash รหัสผ่านแอดมิน | PropertiesService `ADMIN_PASSWORD_HASH`; fallback = **hardcoded hash ในซอร์สโค้ด** code.js:9 | ค่าเดียว | `changeAdminPassword` code.js:798 | `getAdminHash_` code.js:782 | ⚠️ ถ้าไม่เคยเปลี่ยนรหัส ระบบ fallback ไปใช้ hash ที่ hardcode อยู่ใน repo |
| Client in-memory cache | สำเนาตารางที่กำลังแสดงผล | JS var `rawData`/`availableMonths` (memory only) | array index | `handleDataReceived` Index.html:7045 | render ทั่วหน้า | รีเฟรช = โหลดใหม่หมดทุกครั้ง, ถ้า Firebase key ไม่ตรงหน่วง 6 วิ ก่อน fallback ไป GAS |

### 2.2 LWW Ownership ("ใครถือเวรอยู่ตอนนี้") + Path B overlay

> **สิ่งที่ต่างจากที่เอกสาร design เดิมอ้าง:** `DESIGN_LWW_ownership_v3.44.md` เขียนว่า "design only — NOT coded" แต่จริงๆ ตัว resolver ทำงานแล้วฝั่ง client (Index.html:3573-3855) เพียงแต่ **"ownership record" ที่สเปคไว้ไม่เคยถูกบันทึกที่ไหนเลย** — มันถูกสังเคราะห์สดทุกครั้งจาก transfer-action (give/add/swap) แถวเดิมที่ระบบเก่าใช้อยู่แล้ว สมุดบันทึกถาวรที่ design doc สัญญาไว้ยังไม่มีจริง

| Entity | ความหมาย | เก็บที่ไหน (ทุกที่) | โครงสร้าง key | เขียนที่ | อ่านที่ | จุดสังเกต/ความเสี่ยง |
|---|---|---|---|---|---|---|
| Transfer action record (give/add/swap) | บันทึกการโอน/แลก/รับเวร 1 ครั้ง — คือหน่วยข้อมูลจริงที่ถูกเก็บถาวร | (1) localStorage `siriraj_shift_overlay_v4`; (2) Sheet `PHX_Overlays_v2` (payload JSON); (3) localStorage cache `siriraj_pb_overlays_{monthId}`; (4) in-memory `pathBOverlays` — **4 ที่ ไม่มี Firebase copy** | `ovl_<ts>_<rand5>`, field `{shiftKey, partnerName, originalOwner, createdAt, _visibility}` | `OverlayManager.addAction` Index.html:2942; server `phxPushActions` Phase_Z_B3_Sync.js:47 | `OverlayManager.getActions` Index.html:2893; server `phxPullAll` Phase_Z_B3_Sync.js:139 | Sync debounce 1.5s, gate ด้วย `_visibility==='public'` **และ** `_syncPublish` — draft ตั้งใจไม่ให้ออกจากเครื่อง (ดู §2.3 ที่พบว่าจริงๆ หลุดอยู่) |
| slotKey / shiftKey | กุญแจระบุ "แถวเวรต้นฉบับ" 1 แถว — นิ่งเพราะ master immutable | ไม่เก็บแยก — คำนวณสดทุกครั้ง (derived) | `[date, pos, origOwner, range].join('\|')` — client `makeShiftKey()` Index.html:2350, server `_phxPBKey()` Phase_PathB_Global.js:231 | (derived) | เรียกใช้ 10+ จุดทั้ง client/server | **มี 2 implementation แยกกัน** (client vs server) ต้องตรงกันทุก byte โดยไม่มีจุดรวมศูนย์เดียว — แก้จุดหนึ่งไม่แก้อีกจุด key จะไม่ match กันแบบเงียบๆ |
| LWW ownership record (ตามสเปค) | "ใครถือเวรนี้ตอนนี้" สมุดเซ็นชื่อ | **ไม่ถูกเก็บที่ไหนเลย** — สังเคราะห์สดจาก transfer-action rows | slotKey เดียวกับข้างบน | ไม่มี write path | `LWW.currentOwner()`/`LWW.ledger()` Index.html:3669/3679 | `at` ยังใช้ client-clock ไม่ใช่ server-stamp ตามที่ design doc เองเคยตั้งเป็น open item — ไม่ถูกแก้ |
| LWW engine flag | สวิตช์เลือก resolver เก่า (chain-walk) หรือใหม่ (LWW) | localStorage `lww_engine` | `'1'`/`'0'` | `setLwwEngine()` Index.html:2700 | `buildGhostRows()` Index.html:2486 | **Default OFF** — production ใช้ engine เก่า แต่ LWW ถูกเรียกแบบไม่มีเงื่อนไขในบางจุด UI อยู่ดี → มี harness เปรียบเทียบ (`LWWCompare`, Index.html:3722) ที่สร้างขึ้นเพราะเคยพบว่า 2 engine ให้คำตอบไม่ตรงกัน |
| `_phxApplyOverlaysGlobally` | ฟังก์ชัน apply overlay ฝั่ง server ตามคอมเมนต์ | ไม่มี storage — pure function Phase_PathB_Global.js:106 | ใช้ `_phxPBKey` เดียวกับข้างบน | เรียกจาก test เท่านั้น | ไม่ถูกเรียกจาก `getScheduleData_` จริง | **โค้ดที่ตายแล้วในโปรดักชัน** — เคยถูก wire ไว้ (ดู HANDOFF v3.40) แล้วถูกถอดออก แต่ design doc ยังพูดถึงว่า "ต้อง rewrite" อยู่ ทั้งที่ตอนนี้ไม่มีผลอะไรกับระบบจริง |

### 2.3 Draft/Publish + การยกเลิกที่ต้อง governance

> **จุดที่พลิกความเข้าใจเดิม:** draft กับ published **ไม่ใช่คนละที่เก็บ** — เป็นแถวเดียวกันใน Sheet `PHX_Overlays_v2` แยกกันแค่ field `_visibility` ที่ฝังอยู่ใน payload JSON การกันไม่ให้คนอื่นเห็น draft เป็นแค่ **client-side `.filter()`** กระจายอยู่ ~8 จุด ไม่ใช่ขอบเขตความปลอดภัยจริง — และตรวจพบว่า draft ของผู้ใช้ที่ login + เปิด cloud sync จริงๆ แล้ว **หลุดขึ้น server** ทั้งที่คอมเมนต์ในโค้ดบอกว่าไม่หลุด (เพราะมี sync path 2 เส้นทางที่ gate ไม่เหมือนกัน)

| Entity | ความหมาย | เก็บที่ไหน (ทุกที่) | เขียนที่ | อ่านที่ | จุดสังเกต/ความเสี่ยง |
|---|---|---|---|---|---|
| Draft action record | ร่างที่ยังไม่เผยแพร่ | เหมือน public — แถวเดียวกันใน `PHX_Overlays_v2`, path ที่ไม่กรอง visibility | sync-wrap Index.html:13627 → `phxPushActions` (ไม่กรอง `_visibility`) | client filter `_visibility!=='draft'` (~8 จุด) | **ยืนยันแล้ว:** draft หลุดขึ้น server จริงสำหรับ user login+cloud-sync แม้คอมเมนต์บอกว่าไม่หลุด |
| Published action record | รายการที่เผยแพร่แล้ว | Sheet แถวเดียวกัน (flip `_visibility`) + สำเนา local publisher + `pathBOverlays` ทุกเครื่อง | `OverlayManager.publishAction` Index.html:2976 | `phxGetAllActiveOverlaysForMonth` → `getScheduleData` → `pathBOverlays` | local copy กับ server row reconcile กันด้วย debounce 1.5s เท่านั้น |
| `_syncPublish` flag | คุมว่า publish/unpublish sync ขึ้น server ไหม | localStorage `sync_publish`, default ON | `setSyncPublish()` Index.html:2717 | gate เฉพาะ publish/unpublish + edit-mirror push | **ชื่อสื่อว่าคุมทั้งหมดแต่จริงคุมแค่ visibility-flip** — ไม่ gate `addAction`/`removeAction` — เหมือนบั๊กเดิมที่เคยแก้ (`9fe6703`) แค่คนละมุมของ flag เดียวกัน |
| Session credential (password hash) | ตัวยืนยันตัวตนของทุก sync call | server `PHX_Pharmacists`; client localStorage `siriraj_logged_in_hash` | `phxAuthSetSession` Index.html:11904 | `_phxVerifyAuth` ทุก push/pull/remove เช็คแค่ hash ตรง sheet | hash คือ bearer token ถาวร — ใครขโมยค่านี้เรียก API ลบ/แก้ได้เลย |
| Password re-verification (destructive gate) | บังคับพิมพ์รหัสซ้ำก่อนยกเลิก published | ไม่เก็บที่ไหน — read-only check | เรียกจาก `swfCancelPublished`/`swfAdminCancelPublished` ก่อน `phxRemoveAction` | `phxVerifyPassword` Phase_Z_B1_Auth.js:220 | ⚠️ **เป็น gate ฝั่ง client เท่านั้น** — `phxRemoveAction` จริงไม่เช็คว่าถูกเรียกหลัง verify ผ่านหรือไม่ ข้ามได้ผ่าน console ถ้ามี session hash |
| Publish/cancel audit entries | บันทึกถาวรว่าใครทำอะไร | Sheet `PHX_AuditLog` | `phxLogAudit` Phase_G_AuditLog.js:97 | `phxAuditQuery` (admin only) | `swfCancelPublished` เขียนซ้ำ 2 แถว (`cancel_published` + `undo` ที่ label ผิดความหมาย); `swfAdminCancelPublished` ไม่ซ้ำ — 2 flow ที่ควรเหมือนกันพฤติกรรม audit ต่างกัน |
| Admin override metadata (`_overrideBy/At/Reason`) | ใครแก้ผู้ให้/ผู้รับบน record ที่เผยแพร่แล้ว | ฝังใน payload column เดียวกัน ไม่มี table แยก | `_pbEditRecipient`/`_pbAdminOverride` Index.html:3323/3400 | badge render `_buildPBTimelineHTML` | ⚠️ **ไม่เข้า `PHX_AuditLog` เลย** ทั้งที่บังคับกรอกเหตุผล — ร่องรอยเดียวคือ field ที่เขียนทับได้เรื่อยๆ ไม่มี history |

### 2.4 Relay legs (ไม้ต่อเวลา, กำลังสร้าง) + ระบบชื่อเล่น

| Entity | ความหมาย | เก็บที่ไหน (ทุกที่) | เขียนที่ | อ่านที่ | จุดสังเกต/ความเสี่ยง |
|---|---|---|---|---|---|
| Relay flag `_relayEnabled` | สวิตช์เปิด/ปิดฟีเจอร์แบ่งเวรเป็นไม้ | `localStorage['relay_legs']` เท่านั้น — **ไม่มีที่เก็บฝั่ง server** | `window.setRelayLegs` Index.html:2727 | ทุกจุดที่ gate `_relayEnabled` | Per-device เท่านั้น เปิดเครื่องหนึ่งไม่ตามไปเครื่องอื่นของ user เดียวกัน |
| Relay leg record (`action.legs[]`) | รายการ "ไม้" (owner+เวลาสิ้นสุด) ของการแบ่งเวรเดียว | (1) ระหว่างแก้: JS var `_swfRelay` in-memory เท่านั้น; (2) เก็บ/publish: แนบเข้า action object ใน `localStorage['siriraj_shift_overlay_v4']` แล้วลอยไปเป็นส่วนหนึ่งของ payload JSON ใน `PHX_Overlays_v2` — **ไม่มี field/column เฉพาะ ไม่มี RTDB path เฉพาะ** | `_relaySaveLegs` Index.html:5868 | `_relayInit` Index.html:5807 (seed กลับเข้า dialog เท่านั้น) | ⚠️ **ยังไม่มีจุดอ่านอื่นในระบบเลย** — `LWW.buildRecords` (Index.html:3616) อ่านแค่ `partnerName` เดียว ยังไม่รู้จัก `.legs` ทำให้เวรที่แบ่งไม้แล้วยัง "เห็น" เป็นของคนเดียวในทุกจุด (ownership/ชั่วโมง/conflict-check/export) — ตั้งใจแบบนี้ระหว่างสร้าง (flag OFF by default) แต่คือจุดที่ต้อง reconcile ก่อนเปิดใช้จริง |
| Public nickname | ชื่อเล่นที่ตั้งเอง ทุกคนเห็นแทนชื่อจริง | Firebase `nicknames/public/{encName}` (primary) **+** Sheet `PHX_Nicknames` (fallback mirror) | `_nkWrite` Index.html:6485 (เขียนคู่ขนาน) | `_nkSubscribe` (RTDB realtime) + `_nkPullGAS` (Sheet fallback, poll เท่านั้น) | 2 ที่เก็บอาจ drift — **ไม่มีไฟล์ RTDB security rules ใน repo เลย** ต้องไปดูใน Firebase console เอาเอง ไม่มี version control |
| Private nickname (alias) | ชื่อเล่นที่ตั้งเรียกคนอื่นเป็นการส่วนตัว | Firebase `nicknames/private/{encMe}/{encTarget}` **+** Sheet `PHX_Nicknames` | `_nkWrite` Index.html:6485 | `_nkSubscribePrivate` (RTDB) | Sheet-side กรอง `owner===authed` ก่อนส่งออกดีอยู่ แต่ฝั่ง RTDB ความปลอดภัยขึ้นกับ rules ที่ไม่มีให้ตรวจใน repo — ไม่ชัดเจนว่า rule จริงป้องกัน "อ่านได้เฉพาะของตัวเอง" หรือไม่ |

### 2.5 Auth / Role / Audit

| Entity | ความหมาย | เก็บที่ไหน (ทุกที่) | เขียนที่ | อ่านที่ | จุดสังเกต/ความเสี่ยง |
|---|---|---|---|---|---|
| Master roster | รายชื่อเภสัชกรทั้งหมด + อีเมลที่ admin อนุมัติ | Sheet `PHX_Pharmacists_Master` (name/email/active/notes) | `phxSetUserRole` Phase_Z C1 role.js:50 | `_phxFindMasterRow` Phase_Z_B1_Auth.js:291 | ชื่อคือ primary key (string match) — ไม่มี unique ID, พิมพ์ผิด/เปลี่ยนชื่อในชีตหนึ่งทำ identity หลุดจากอีกชีต |
| Role assignment | สิทธิ์ user/admin | Sheet เดียวกัน คอลัมน์ E | `phxSetUserRole` — **dev-only, ไม่มี admin UI** ต้องรันมือใน GAS editor | `_phxGetRole` Phase_Z C1 role.js:32 | มี `_phxGetRole` 2 เวอร์ชัน (verify กับไม่ verify) — ถ้ามี call site ใหม่พลาดใช้แบบไม่ verify จากภายนอกจะเปิดช่องปลอมสิทธิ์ |
| User account (name+password hash) | บัญชี login | Sheet `PHX_Pharmacists` | `phxVerifyToken` Phase_Z_B1_Auth.js:157 | `_phxFindPharmacistRow` | Hash = SHA-256(salt+name+pw) — ⚠️ **salt เดียวกันทุก user hardcode ในซอร์สโค้ด** (`_B1_APP_SALT`) กันได้แค่ rainbow table ทั่วไป ไม่ใช่ per-user จริง |
| Active session (client) | สถานะ login ฝั่ง client | localStorage `siriraj_logged_in_name`/`_hash`/`_role` — **ไม่มี server session table เลย** | `phxAuthSetSession` Index.html:11908 | `phxAuthGetUser`/`IsLoggedIn` | ⚠️ **hash คือ auth token ถาวรไม่มีวันหมดอายุ** — เบราว์เซอร์ที่ถูกขโมย/sync = เข้าบัญชีได้ตลอดจนกว่าจะเปลี่ยนรหัส. Role check ฝั่ง client (ซ่อน/โชว์เมนู) spoof ได้ใน devtools แต่ endpoint จริง verify server-side แยกต่างหาก |
| Audit log entry | บันทึกทุก action สำคัญ | Sheet `PHX_AuditLog` | `phxLogAudit` Phase_G_AuditLog.js:97 | `phxAuditQuery` (admin only) | Payload clip ที่ 10,000 ตัวอักษรแบบเงียบๆ; **90 วัน = hard delete ถาวร ไม่ archive** กู้คืนไม่ได้ |

### 2.6 Firebase resilience + การแจ้งเตือน (email/broadcast/LINE/ปฏิทิน)

| Entity | ความหมาย | เก็บที่ไหน (ทุกที่) | เขียนที่ | อ่านที่ | จุดสังเกต/ความเสี่ยง |
|---|---|---|---|---|---|
| Firebase connection status | สถานะเชื่อมต่อจริง (ไม่ใช่แหล่งข้อมูลล่าสุด) | client-only, RTDB path built-in `.info/connected` | listener Index.html:6404 | `_renderConnRadar()` Index.html:6392 | v3.44 แก้แล้ว: เลิกสับสนกับ "แหล่งข้อมูลล่าสุด" |
| Email queue (ทุกอีเมลออก) | คิวรอส่งจริง (reminder/broadcast/announce/register) | Sheet `PHX_EmailQueue` — เขียนจาก **4 จุดอิสระ** | `_phxAppendToEmailQueue`, `_phxQueueEmailsBatch`, `phxQueueEmail`, ฯลฯ | **ไม่ได้ drain ในโปรเจกต์นี้เลย** — โปรเจกต์ GAS แยก ("@mahidol sender") poll ทุก 5 นาที | ระบบนี้มองไม่เห็นว่าอีเมลถูกส่งจริงหรือไม่ นอกจาก column `status`/`sentAt`/`error` ที่หวังว่าจะถูกเติมกลับมา |
| Reminder settings | เวลาที่อยากได้แจ้งเตือน | Sheet `PHX_Pharmacists` col F/G (flat) **และ** col I (`icsReminderJSON`) — 2 รูปแบบสำหรับแนวคิดเดียวกัน | `phxSetReminderSettings`/`phxSetIcsReminderSettings` | `phxGetReminderSettings`/`phxGetIcsReminderSettings` | JSON เสีย → fallback แบบเงียบๆ ไปใช้ col F/G โดยไม่มี error โชว์ผู้ใช้ |
| LINE webhook secret | ยืนยันว่า request มาจาก LINE จริง | PropertiesService `LINE_CHANNEL_SECRET` | ตั้งมือใน GAS editor | `_phxLineGetSecret` Phase_F2_LINE.js:25 | ⚠️ **มีตัวแปรแต่ไม่เคยถูกเรียกใช้จริง** — `doPost` ไม่ verify HMAC signature เลย = ใครก็ยิง POST มาที่ webhook แล้วอ้างว่าเป็น LINE ได้ |
| Calendar sync map | จับคู่ shift ↔ Google Calendar event ID | Sheet `User_Calendar_Sync`, key `shift_key\|month_id` | `_p2c_appendSyncRow` Phase2C.js:201 | `_p2c_getSyncMapForUser` | `month_id` ที่นี่เป็น **scheme ที่ 3** ที่ต่างจาก Firebase `schedules/` key และ MONTH_LIST id — สามชื่อ "month key" ไม่ตรงกันเลยทั้งระบบ |

---

## 3. จุดเสี่ยงเรียงตามความสำคัญ (สรุปข้ามโดเมน)

### 🔴 ความปลอดภัย — ควรพิจารณาแก้ไม่ว่าจะยังไม่ตัดสินใจเรื่องสถาปัตยกรรมอื่น

1. **ไม่มี session หมดอายุ** — password hash ใน localStorage คือ "บัตรผ่านตลอดชีพ" จนกว่าจะเปลี่ยนรหัส
2. **การยกเลิก published (`phxRemoveAction`) ไม่เช็คว่าผ่านการยืนยันรหัสผ่านจริง** — ฝั่ง client เท่านั้นที่บังคับ ข้ามได้ทาง console
3. **LINE webhook ไม่ verify HMAC signature** — endpoint เปิดรับ request ปลอมได้
4. **Admin override (แก้ผู้ให้/ผู้รับ) ไม่มี audit log เลย** — ต่างจาก action อื่นทุกชนิดที่ log ครบ
5. **Password salt เดียวกันทุก user, hardcode ในซอร์ส**
6. **ไม่มี Firebase security rules เก็บใน repo** — ความปลอดภัยของ nicknames (และข้อมูลอื่นบน RTDB) ขึ้นกับสิ่งที่ตั้งไว้ใน console ที่ไม่มีใคร version-control

### 🟠 โครงสร้าง — สาเหตุหลักที่ทำให้รู้สึกว่า "แมปไม่ดี"

7. **"เดือน" มี ID 3 scheme ที่ไม่ตรงกัน**: Sheet/MONTH_LIST (random timestamp), Firebase/client (label-derived), Calendar sync (`month_id` แบบที่ 3)
8. **slotKey/shiftKey ถูก implement แยกกัน 2 ที่** (client + server) โดยไม่มีนิยามกลางจุดเดียว
9. **LWW ownership record ที่ design doc สเปคไว้ไม่เคยถูกบันทึกจริง** — สังเคราะห์สดทุกครั้งจาก overlay แถวเดิม ไม่มี "สมุดบันทึกถาวร" ตามที่ตั้งใจ
10. **มี 2 engine คำนวณ "ใครถือเวรตอนนี้" พร้อมกัน** (chain-walk เก่า vs LWW ใหม่) ที่เคยพบว่าให้คำตอบไม่ตรงกัน จึงต้องมี compare-harness แยกไว้ตรวจ
11. **Relay legs (หลายเจ้าของ) กับ LWW (เจ้าของเดียว) อยู่บนเวรเดียวกันได้โดยยังไม่ reconcile** — legs ถูก publish ได้แล้วแต่ไม่มีจุดอ่านอื่นในระบบรู้จักมัน
12. **Delete ไม่ครบ** — ลบเดือนแล้ว Firebase/Sheet tab ยังไม่ถูกลบ ข้อมูล "ที่ลบแล้ว" โผล่กลับมาได้

### 🟡 Flag/ค่าที่ชื่อไม่ตรงกับสิ่งที่มันทำจริง (ทำให้ debug ยาก)

13. **`_syncPublish`** ชื่อสื่อว่าคุมการ sync ทั้งหมด แต่จริงคุมแค่ visibility-flip — รูปแบบเดียวกับบั๊ก "Firebase ดับ" ที่เคยแก้ไปแล้ว (`9fe6703`) แค่คนละมุมของ flag เดิม
14. **Draft หลุดขึ้น server จริง** สำหรับ user login+cloud-sync แม้คอมเมนต์ในโค้ดบอกว่าไม่หลุด — การซ่อน draft เป็น client-filter ล้วนๆ ไม่ใช่ server boundary

---

## 4. กฎง่ายๆ สำหรับเก็บข้อมูลต่อจากนี้ (ใช้ตัดสินใจตอนเพิ่มฟีเจอร์ใหม่)

1. **"ความจริงต้นฉบับ" ที่ห้ามหาย** (บัญชี, audit, ตารางเวร master) → เก็บใน **Google Sheet เสมอ** เป็นแหล่งเดียว
2. **ถ้าต้องอ่านเร็ว/real-time หลายเครื่อง** → mirror ไป Firebase ได้ แต่ **key ต้อง derive จากฟังก์ชันเดียว ใช้ร่วมกันทั้ง client และ server** — ห้ามคำนวณ key ซ้ำคนละสูตรคนละที่ (นี่คือสาเหตุของปัญหาข้อ 7-8 ข้างบน)
3. **Mutation ที่ผู้ใช้ทำแล้วต้องข้ามอุปกรณ์ได้** (ยกเวร แลกเวร ตั้งชื่อเล่น) → ต้อง sync ขึ้น server ทันทีเมื่อ "public", และ flag ที่ gate การ sync ต้อง **ครอบคลุมทุก write path ที่เกี่ยวข้องจริง** ไม่ใช่แค่บางจุด (เขียน checklist ของ write path ทุกจุดที่ flag นั้นควรคุม แล้ว verify ว่าคุมครบก่อน ship)
4. **Config/flag ที่อยากให้ "ติดตัวผู้ใช้" ข้ามเครื่อง** (เช่น เปิด relay legs, เปิด LWW engine) → ต้องผูกกับบัญชีฝั่ง server ไม่ใช่ localStorage อย่างเดียว
5. **UI state ชั่วคราวระหว่างแก้ไข** (เช่นกำลังพิมพ์ leg ในกล่องที่ยังไม่กด save) → เก็บใน memory เฉยๆ พอ ไม่ต้อง persist
6. **Key ที่ใช้ระบุ record ใดๆ** (slotKey, monthKey, shiftKey) → ต้องมี **นิยามเดียว หนึ่งฟังก์ชัน** แล้ว reuse ทั้ง client/server ห้าม implement มือซ้ำคนละที่
7. **Action ที่ทำลาย/ยกเลิกของที่เผยแพร่แล้ว** → ต้อง log เข้า `PHX_AuditLog` แบบเดียวกันทุก flow ที่ทำสิ่งเดียวกัน (ตอนนี้ cancel_published กับ admin_cancel_published log ไม่เหมือนกัน — ควรรวมให้เหมือนกัน)
8. **เวลาจะลบข้อมูล** → ลบให้ครบทุกที่ที่มัน mirror ไว้ (Sheet + Firebase + Drive JSON) ไม่ใช่ลบแค่ index/metadata

---

## 5. จำแนกตามความจำเป็นต้องแก้มือ — ควรเก็บที่ไหนต่อไป

**เกณฑ์:** ข้อมูลที่ไม่มีใครต้องเปิด Sheet พิมพ์ทับด้วยมือเลย (แอปเขียนเองทั้งหมด) ไม่จำเป็นต้องมี Sheet คู่ — เก็บ Firebase/JSON อย่างเดียวพอ ลดจุด duplication ได้ทันที ส่วนข้อมูลที่ต้องแก้มือจริง (แอดมินเปิด Sheet พิมพ์เอง) ต้องคง Sheet ไว้เป็นแหล่งความจริง

**สัญลักษณ์:** ✋ ต้องแก้มือจริง (คง Sheet) · 🤖 แอปเขียนเองล้วนๆ (ย้าย Firebase/JSON ได้) · 🔍 ไม่ต้องแก้มือ แต่มีเหตุผลอื่นให้คง Sheet ไว้ (fallback หรือสะดวกต่อการสืบสวน/query)

| Entity | ต้องแก้มือ? | เก็บตอนนี้ | แนะนำ | เหตุผล |
|---|---|---|---|---|
| Master Time/People reference | ✋ | Sheet (แก้มือ) + cache | **คง Sheet ไว้** | ระบุชัดในโค้ดว่า "แก้บน Sheet เอง" — นี่คือ use case ที่ Sheet เกิดมาเพื่อสิ่งนี้ |
| Master roster + Role assignment | ✋ | Sheet `PHX_Pharmacists_Master` | **คง Sheet ไว้** | แอดมินต้องอนุมัติอีเมล/เพิ่มคนใหม่/ตั้ง role เป็นระยะ ไม่มี UI อื่น |
| MONTH_LIST, Schedule_Index | 🤖 | PropertiesService / Sheet index | Schedule_Index ย้าย Firebase/JSON ได้ (MONTH_LIST อยู่ JSON แล้ว) | เขียนโดยโค้ดล้วนๆ ไม่มีใครพิมพ์มือ |
| Upload/transform stats log, DeviceLog | 🤖 | Sheet (write-only) | **ย้าย Firebase/JSON** | เขียนอัตโนมัติ ไม่มีจุดอ่านกลับในระบบเลย ไม่มีเหตุผลต้องเป็น Sheet |
| Transfer/overlay action record (give/add/swap) | 🤖 เขียน / 🔍 อ่าน | Sheet `PHX_Overlays_v2` + localStorage 4 ที่ | **ย้าย Firebase-only** เป็นหลัก แต่ทำเครื่องมือ export/view สำหรับสืบข้อพิพาทแทน Sheet | ไม่มีใครพิมพ์มือ แต่แอดมินอาจต้องสืบว่า "ใครยกเวรให้ใครเมื่อไหร่" — ตอบด้วย query tool ได้โดยไม่ต้องพึ่ง Sheet |
| Draft/Published action record | 🤖 / 🔍 | Sheet เดียวกับข้างบน | เหมือนข้างบน (เป็น entity เดียวกัน) | — |
| LWW ownership record (ถ้าจะสร้างจริงตามสเปค) | 🤖 | ยังไม่มี | **Firebase/JSON อย่างเดียว** | เขียนโดยระบบเท่านั้น ไม่มีเหตุผลให้เป็น Sheet ตั้งแต่ต้น |
| Relay leg record | 🤖 | ฝังใน payload (localStorage→Sheet) | **Firebase/JSON** | เขียนผ่านแอปเท่านั้น |
| Public/private nickname | 🤖 เขียน / 🔍 fallback | Firebase + Sheet mirror | **เก็บคำถามแยก**: ถ้า Sheet มีไว้เพราะ "ต้องแก้มือ" → ไม่จำเป็น (ไม่มีใครพิมพ์); ถ้ามีไว้เพราะ "fallback เผื่อ Firebase ดับ" → มีเหตุผล แต่ควรทำให้เป็น sync job ที่ verify ได้ ไม่ใช่ dual-write ที่ไม่มีใคร reconcile |
| Pending verification tokens | 🤖 | Sheet, auto-expire 24ชม. (ไม่มี cleanup job) | **ย้าย Firebase** ตั้ง TTL จริงได้ | Sheet ไม่มี TTL อัตโนมัติ — เป็นสาเหตุที่ token หมดอายุแล้วยังค้างอยู่ |
| Audit log | ห้ามแก้มือ / 🔍 อ่านบ่อย | Sheet `PHX_AuditLog` | **คง Sheet ไว้** (หรือ Firebase + query tool ที่ดีพอๆ กัน) | แอดมินต้อง filter/ค้นย้อนหลังบ่อย — Sheet ให้เครื่องมือนี้ฟรีอยู่แล้ว ย้ายได้ถ้ามี query UI ทดแทน |
| Email queue | 🤖 เขียน / 🔍 ดูแลของค้าง | Sheet `PHX_EmailQueue` | **คง Sheet ไว้ก่อน** | แอดมินอาจต้องเปิดดู/ลบอีเมลที่ค้างเป็นครั้งคราว — ประโยชน์จากการเปิดดูง่ายมากกว่าโทษจาก duplication |
| LINE groups, Calendar sync map | 🤖 | Sheet | **ย้าย Firebase/JSON** | event-driven/เขียนอัตโนมัติล้วนๆ ไม่มีใครพิมพ์มือ |
| ตารางเวรรายเดือน (schedule master) | 🔍 แก้ฉุกเฉินเป็นครั้งคราว | Sheet + Firebase + Drive JSON (3 ที่) | **คง Sheet เป็นต้นฉบับ** แต่ตัด Drive JSON ทิ้ง | มาจาก Excel upload อัตโนมัติเป็นหลัก ไม่ใช่พิมพ์มือ แต่ warning-only lock มีไว้ให้แก้ฉุกเฉิน/ตรวจสอบย้อนหลังได้ด้วยตา — คุณค่าอยู่ที่ "เปิดดูเข้าใจง่าย" ไม่ใช่ "พิมพ์บ่อย" ส่วน Drive JSON เป็น legacy ที่ไม่มีใครอ่านแล้ว ตัดได้เลย |

**ข้อสังเกตสำคัญ:** เกือบทุกอย่างที่เจอเป็น 🤖 (แอปเขียนเองล้วนๆ) แปลว่า **Sheet ถูกใช้เกินความจำเป็นในระบบนี้มาก** — เหตุผลที่แท้จริงที่หลายอย่างยังอยู่ใน Sheet ไม่ใช่ "ต้องแก้มือ" แต่คือ (1) Sheet มาก่อน Firebase ในประวัติศาสตร์ของโปรเจกต์ (2) ใช้เป็น fallback เผื่อ Firebase ดับ (3) แอดมินชอบเปิดดู/กรองด้วยเครื่องมือที่คุ้นเคย ทั้ง 3 เหตุผลนี้แก้ได้โดยไม่ต้องมี Sheet คู่ทุกอย่าง — เช่นทำ "admin query/export tool" หน้าเดียวแทนการเปิด raw Sheet ก็ได้ประโยชน์ข้อ (3) โดยไม่ต้อง dual-write

---

## 6. ขั้นต่อไปที่แนะนำ (ยังไม่ได้ทำ — รอ Klui ตัดสินใจ)

เอกสารนี้เป็นแค่แผนที่ ยังไม่ได้แก้อะไร ขั้นต่อไปที่เป็นไปได้ (เลือกทำเมื่อพร้อม ไม่ต้องทำทั้งหมดพร้อมกัน):

- **แก้เฉพาะจุดความปลอดภัย** (§3 หมวด 🔴) — น่าจะทำก่อนสุดเพราะกระทบทุกฟีเจอร์ที่มีอยู่แล้ว ไม่ต้องรอ decision เรื่องสถาปัตยกรรมใหญ่
- **ก่อนเปิด relay legs flag จริง** — ต้อง reconcile กับ LWW ownership ก่อน (§3 ข้อ 11) ไม่งั้นจะมีเวรที่ "แบ่งไม้แล้ว" แต่ระบบอื่นยังนับเป็นของคนเดียว
- **รวม key scheme ของ "เดือน" ให้เหลือ 1 สูตร** — งานใหญ่ที่สุดแต่แก้ปัญหาที่รากที่สุด (§3 ข้อ 7) จะทำให้ปัญหา "Firebase key ไม่ตรง" หมดไปทั้งตระกูล
- **ตัดสินใจว่า LWW engine จะเปิดจริงเมื่อไหร่** และเลิก maintain 2 engine พร้อมกัน (§3 ข้อ 10)

ไม่แนะนำให้ไล่แก้ทุกจุดพร้อมกัน — เลือกทีละเรื่องตามความเสี่ยง/ผลกระทบ แล้วบอกได้เลยว่าอยากเริ่มจากข้อไหนก่อน
