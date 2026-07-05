# HANDOFF v3.41 — Storage v3 (single-tab immutable master)

**วันที่:** 5 กรกฎาคม 2569
**สถานะ:** 🟢 **Storage refactor + tab cleanup เสร็จสมบูรณ์** — deployed + verified
**ก่อนหน้า:** [HANDOFF_v3.40.md](HANDOFF_v3.40.md) (Path B fix)

---

## 🎯 สิ่งที่ session นี้ทำสำเร็จ

**สาน handoff v3.40 ต่อ — Housekeeping "เคลียร์ Schedule tabs ซ้ำ":**
> "ม.ค./พ.ค./มิ.ย. มี 3 tabs ต่อเดือน = สับสน + เปลืองพื้นที่ | Schedule sheet — 6 tabs ควรลบ"

**พลิกเป็น architectural pivot ที่ลึกกว่านั้น:** เปลี่ยนระบบเก็บ schedule ทั้งชุดจาก versioned → single-tab immutable

---

## 🏢 แนวคิดใหม่ (metaphor)

**ก่อน:**
- ทุกครั้งอัปโหลด Excel = **ปั้มปฏิทินใหม่แผ่นหนึ่ง** ติดไว้บน board
- ปฏิทินเก่า **ไม่ลบ** พับซ่อนไว้ข้างหลัง (`_v1`, `_v2`, `_v3`...)
- คนอ่านเห็นแค่แผ่นล่าสุด แต่บอร์ดสะสมกระดาษหนาขึ้นเรื่อยๆ
- ยกเวร/แลกเวร = **โพสต์อิทแปะทับบนปฏิทินล่าสุด** (Path B overlay จาก v3.40)

**หลัง:**
- ทุกครั้งอัปโหลด = **ลบปฏิทินเดิมแล้วปั้มใหม่ทับที่เดิม** (single tab, ชื่อไทย "มิถุนายน 2569")
- บอร์ดมี **ปฏิทินแผ่นเดียวต่อเดือน** เสมอ ล็อคด้วย "warning tape" (`setWarningOnly`)
- การแก้ทุกอย่างต้องเป็น **โพสต์อิท (overlay) เท่านั้น** — แผ่นปฏิทินคือต้นฉบับ ไม่แตะ
- โพสต์อิทเก่ายังอยู่ต่อ (ระบบยกเวรไม่กระทบ) เพราะ **จับคู่ด้วย (date|pos|name|range)** ไม่ใช่ shift_id

---

## 🔧 การเปลี่ยนแปลงทั้งหมด (2 ไฟล์)

### code.js — 3 การกระทำ

**1. ลบ 2 ฟังก์ชัน (`getNextVersion_`, `hideOldVersions_`)** — ~33 บรรทัด
เพราะไม่มี versioning แล้ว

**2. Rewrite `writeScheduleToSheet_`** (บรรทัด 1178–1235) — จาก 36 → 51 บรรทัด
ตรรกะใหม่:
```js
const cleanLabel = String(label || '').trim();
const validLabel = cleanLabel && cleanLabel !== 'ไม่ระบุเดือน' && cleanLabel.length <= 100;
const tabName = validLabel ? cleanLabel : ('Schedule_' + monthId);

let sh = ss.getSheetByName(tabName);
const isReplace = !!sh;

if (sh) {
  // ปลด protection + clear
  const protections = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  protections.forEach(function(p) { try { p.remove(); } catch(e) {} });
  sh.clear();
} else {
  sh = ss.insertSheet(tabName);
}

// ...เขียน header + data...

// Auto-lock: warning-only
const p = sh.protect().setDescription('ต้นฉบับ - ห้ามแก้ตรงนี้ ใช้ overlay ผ่าน UI');
p.setWarningOnly(true);

updateScheduleIndex_(monthId, label, tabName, 1, sheetUrl, schedule.length, sourceFile);
return { tabName: tabName, version: 1, rowCount: schedule.length, replaced: isReplace };
```

**3. เพิ่ม 4 one-shot migration functions** (~260 บรรทัด — code.js:1237–1502)
- `phxDedupSchedule_dryRun/apply` — archive Schedule_Index rows ที่ไม่อยู่ใน MONTH_LIST + ลบ tabs (aggressive)
- `phxMigrateToSingleTab_dryRun/apply` — rename active `Schedule_m_xxx_vN` → ชื่อไทย + apply protection

### Test.js — เพิ่ม smoke test (~149 บรรทัด)

- `testWriteScheduleToSheet_smoke()` — 5 test scenarios พร้อม cleanup อัตโนมัติ

---

## 🚦 Workflow ที่ใช้ (ตามลำดับ)

1. ✅ Push code v3 (single-tab writeScheduleToSheet_)
2. ✅ Run `testWriteScheduleToSheet_smoke` → ALL PASS
3. ✅ Run `phxDedupSchedule_dryRun` → เห็น 8 rows non-canonical
4. ✅ Run `phxDedupSchedule_apply` → archived 8, deleted 9 tabs (รวม hidden)
5. ✅ Run `phxMigrateToSingleTab_dryRun` → เห็นเพียง 2 tabs, 0 collisions
6. ✅ Run `phxMigrateToSingleTab_apply` → renamed 2, protected 2
7. ✅ UI verify — dropdown, overlays, ยังทำงานปกติ

---

## 📊 ผลลัพธ์

**Sheet tabs ก่อน:** 10 versioned tabs (สับสน + ค้าง)
**Sheet tabs หลัง:** 2 tabs ชื่อไทย + Schedule_Index
- `มิถุนายน 2569` (เดิม `Schedule_m_1781304482466579_v1`, 2306 rows)
- `กรกฎาคม 2569` (เดิม `Schedule_m_1781858940879169_v1`)
- ทั้งคู่มี warning-only protection

**Schedule_Index:** 8 rows status='archived', 2 rows status='active' (canonical)

---

## 🔑 กลไกที่ต้องจำ (สำหรับ Claude คนต่อไป)

### MONTH_LIST = source of truth
Script Property `MONTH_LIST` (getAvailableMonths) = **canonical monthId ต่อ label**
```js
// code.js:346-350 — dedup guard ที่กันไม่ให้เกิด duplicate ตอนอัปโหลด
const existingMonth = oldList.find(x => x.label === result.label);
const _consistentMonthId = existingMonth 
  ? existingMonth.id     // reuse (dedup!)
  : ("m_" + Date.now() + Math.floor(Math.random()*1000));
```

Schedule_Index อาจมี legacy rows ที่ไม่อยู่ใน MONTH_LIST — **ถือว่าเป็นขยะ**

### Overlay-only mutations
- **Sheet ต้นฉบับ = immutable** (`setWarningOnly(true)`)
- ทุกการยกเวร/แลกเวร ต้องผ่าน Overlay (Path B v3.40)
- Overlay จับคู่ shift ด้วย **composite key `(date|pos|name|range)`** ไม่ใช่ shift_id — **ทนต่อการ re-upload**

### Re-upload semantics
- **Same month re-upload:** clear + rewrite tab เดิม (single tab) — Klui บอกว่า "ไม่เคย" ทำ (edge case)
- **New month upload:** สร้าง tab ใหม่ชื่อไทย + auto-lock
- Overlay เดิมยัง apply ต่อได้ถ้า `(date, pos, name, range)` คงเดิม
- Overlay ที่ไม่ match → gracefully skipped (Phase_PathB_Global.js:134)

---

## 🧪 วิธี verify ว่ายังทำงาน (2 นาที)

**Test A — Sheet state**
1. เปิด Google Sheet
2. ต้องเห็น **3 tabs**: `มิถุนายน 2569`, `กรกฎาคม 2569`, `Schedule_Index`
3. ลอง edit cell ใน tab ไทย → dialog เตือน "This sheet is protected..."

**Test B — Frontend flow**
1. Incognito → webapp `/exec`
2. Dropdown → 2 เดือน
3. เลือก มิ.ย. → ตารางโหลด (Firebase-first) → 1-2 วิ Path B overlay merge
4. cell `05/06 (ศ.) O11 2:30-8:30` = **"ณรพล"** (Path B overlay ยังทำงาน)

**Test C — Re-upload safety**
1. อัปโหลด Excel ของ ก.ค. (ทดสอบใน test mode)
2. Console log ต้องขึ้น `📊 Sheet write SUCCESS: ✅ กรกฎาคม 2569 (v1, XXXX rows)`
3. Tab ยังชื่อไทย (ไม่มี `_v2` เกิดใหม่)

---

## 📋 TODO ที่ค้างต่อ (เรียง priority)

| ลำดับ | เรื่อง | ทำไม | ที่ไหน |
|-------|-------|-----|--------|
| 🔴 **HIGH** | เรียก `phxDisableTestMode()` | ก่อน rollout 300 คน — ตอนนี้ยัง test mode | `Phase_Z_C2_Helpers.js:492` |
| 🟡 Med | ลบ one-shot migration code (~260 บรรทัด) | ใช้เสร็จแล้ว, ปลอดภัยที่จะลบ | `code.js:1237–1502` (phxDedup*/phxMigrate*) |
| 🟢 Low | Sunset Phase 2B (~1000 บรรทัด) | code ทำงานแต่ปลายทางว่าง | `Phase2B.js` + `code.js:1365` |
| 🟢 Low | ลบ `PHX_Overlays` sheet | Phase Y dead | Grep ยืนยันก่อนลบ |
| 🟢 Low | ลบ `smoketest` helper ใน Test.js | เก็บไว้เผื่อ future refactor ก็ได้ | `Test.js:369–517` |

---

## 🎓 บทเรียน session นี้

**Klui's decision pattern:**
- ระวังมากๆ กับ destructive action — dry-run ก่อนเสมอ, apply ทีหลัง
- ชอบ **architectural clean pivot** (เลือก Option D: single-tab แทน Option B: rename เฉยๆ)
- ตัดสินใจเร็วเมื่อเห็นภาพชัด (aggressive dedup ตัดสินใจใน 1 turn)
- OK ให้ Claude ตัดสิน default (recommended option)

**Traps ที่เจอ (สำหรับ Claude คนต่อไป):**

1. **MONTH_LIST คือ canonical** — อย่าเชื่อว่า Schedule_Index = truth เพียงลำพัง อาจมี legacy rows
2. **hideOldVersions_ ห้ามฟื้น** — ถ้าเห็น code ที่พึ่ง pattern `Schedule_m_xxx_v?` = code เก่า
3. **updateScheduleIndex_ ยัง 9-col** — เก็บ `version=1` เพื่อ backward compat กับ readers อื่นๆ (`debugScheduleIndexDups`, `listScheduleMonthsFromSheet_`)
4. **`getScheduleData` มี schema drift bugs** ในตำแหน่ง column reads (line 184, 203-208) — ไม่แก้ในนี้เพราะไม่เกี่ยว
5. **`sh.clear()` clears everything รวมถึง protection** — writeScheduleToSheet_ ต้อง re-apply protection ทุกครั้ง

**Klui's shortcut:**
- "smoke test" = "เขียนโค้ดเทสให้ก่อน push production" — Klui รันเองใน GAS Editor
- Klui อัปโหลด GAS manual ไม่ใช้ clasp (บาง session)

---

## 📁 Reference Files

**Memory (Claude คนต่อไปอ่าน):**
- `C:\Users\Klui\.claude\projects\C--Users-Klui-siriraj-rx-shift\memory\`
  - `MEMORY.md` — index
  - `project_path_b_fix.md` — v3.40 overlay layer
  - `project_storage_v3.md` — **ใหม่ session นี้**
  - `feedback_communication_style.md`
  - `feedback_visualizations.md`

**Handoffs:**
- `HANDOFF_v3.40.md` — Path B live
- `HANDOFF_v3.41.md` — **ไฟล์นี้** (Storage v3)

**Diagnostic tools ใน GAS:**
- `debugScheduleMapping()` (code.js:995) — โชว์ Schedule_Index + MONTH_LIST + matching
- `debugScheduleIndexDups()` (Phase_Z_B1_Auth.js:510) — หา duplicate labels
- `testWriteScheduleToSheet_smoke()` (Test.js:369) — smoke test v3 refactor

---

## 🔗 Key Numbers ที่ต้องจำ (updated)

- **Sheet ID:** `1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM`
- **Firebase:** `siriraj-rx-shift-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Canonical monthIds ปัจจุบัน (2 เดือน):**
  - `m_1781304482466579` = มิถุนายน 2569
  - `m_1781858940879169` = กรกฎาคม 2569
- **Schedule tabs ปัจจุบัน:** 2 (ชื่อไทย) + Schedule_Index = 3 tabs total
- **Build:** vY3.41-storage-v3-single-tab
- **User count:** ~300

---

**สรุป:** Housekeeping ที่ handoff เดิมระบุเป็น "🟡 Med priority" ยกระดับเป็น **architectural refactor** ที่ pay dividend ระยะยาว — single-tab + overlay-only เป็น mental model ที่คลีนกว่าเดิมมาก
