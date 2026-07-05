# HANDOFF v3.40 — Path B Fixed & Live

**วันที่:** 5 กรกฎาคม 2569
**สถานะ:** 🟢 **Path B (global overlay visibility) ทำงานได้จริงแล้ว** — deployed + verified

---

## 🎯 สิ่งที่ session นี้ทำสำเร็จ

**ปิดบั๊กหลอกหลอนจาก HANDOFF_v3.39_FINAL.md แล้ว:**
> "คนไม่ล็อกอิน หรือคนที่ล็อกอินเป็นชื่ออื่น มองไม่เห็นการยกเวร/แลกเวร"

**ก่อน:** anonymous (incognito) เห็นแต่ตารางดิบ ไม่มี overlay
**หลัง:** anonymous เห็น overlay ครบ 18 รายการ (ทดสอบกับ มิ.ย. 2569) ✅

---

## 🏢 บั๊กจริง คืออะไร (metaphor)

**ตัวละคร:**
- **Firebase** = **บอร์ดประกาศ** ในร้าน — ติดตารางดิบไว้เร็วๆ
- **Path B (GAS)** = **พนักงานประจำร้าน** ที่มีโพสต์อิท (overlay) พร้อมแปะ
- **Frontend** = **ลูกค้า** ที่มาดูตาราง

**ก่อน patch:**
- บอร์ดมีตารางดิบ ✅
- พนักงานถือโพสต์อิทพร้อมแปะ ✅
- **แต่ลูกค้าอ่านแต่บอร์ด ไม่เคยเดินไปหาพนักงานเลย** ← ปัญหา

**หลัง patch:**
- ลูกค้าอ่านบอร์ดก่อน (เร็ว 0.2 วิ) → **จากนั้นเดินไปหาพนักงาน** เอาโพสต์อิทมาแปะทับอีกครั้ง (1-2 วิ ทีหลัง)

---

## 🔧 Patch ทั้งหมด (56 บรรทัด รวม 2 ไฟล์)

### ไฟล์ 1: `code.js` — ท้าย `getScheduleData()` (บรรทัด ~234)

```js
// 🌟 Path B: apply global overlays ให้ทุกคนเห็นการยกเวรเหมือนกัน
let pbApplied = false;
try {
  const pbLabel = String(label || '').trim();
  if (pbLabel) {
    const pbMonthId = 'm_' + pbLabel.replace(/\s+/g, '_');
    const pbRes = phxGetAllActiveOverlaysForMonth(pbMonthId);
    if (pbRes && pbRes.ok && pbRes.count > 0) {
      schedule = _phxApplyOverlaysGlobally(schedule, pbRes.overlays);  // reassign!
      pbApplied = true;
    }
  }
} catch (e) {
  console.warn('Path B apply failed (non-fatal):', e && e.message);
}

return {
  schedule: schedule,   // backward compat (syncMonthToFirebase, Phase_Z_B2, ฯลฯ)
  data: schedule,       // 🌟 alias สำหรับ frontend (รอ res.data)
  sheets: ["103", "NM5", "IPD", "clinic"],
  sheetUrl: sheetUrl,
  diagnostics: {},
  audit: null,
  _pbApplied: pbApplied
};
```

**สำคัญ:** `_phxApplyOverlaysGlobally` เป็น **pure function** คืน array **ใหม่** — ต้อง `schedule =` reassign (บั๊กที่ 2 ของ patch เก่า)

### ไฟล์ 2: `Index.html` — หลัง `fetchMonthData` (บรรทัด ~3862)

```js
// เพิ่มการเรียก fetchPathBOverlayApplied หลัง handleDataReceived(res, 'firebase')
currentFbRef.on('value', function(snapshot) {
  clearTimeout(fallbackTimer);
  const res = snapshot.val();
  if (!res) { fetchViaGAS(); return; }
  handleDataReceived(res, 'firebase');
  fetchPathBOverlayApplied(selectEl.value);   // 🌟 NEW
}, ...);

// ฟังก์ชันใหม่
function fetchPathBOverlayApplied(monthId) {
  if (!monthId) return;
  google.script.run
    .withSuccessHandler(function(res) {
      if (!res || !res._pbApplied) return;
      const applied = res.data || res.schedule;
      if (!Array.isArray(applied) || applied.length === 0) return;
      if (rawData && Math.abs(applied.length - rawData.length) > 100) return;
      console.log('🎯 Path B: merging overlays into rawData (' + applied.length + ' shifts)');
      rawData = applied;
      if (typeof invalidateGhostCache === 'function') invalidateGhostCache();
      _shiftKeyIndex = null; _shiftKeyIndexFor = null;
      if (typeof triggerUpdate === 'function') triggerUpdate();
    })
    .withFailureHandler(function(err) {
      console.warn('Path B GAS fetch failed (non-fatal):', err && err.message);
    })
    .getScheduleData(monthId);
}
```

---

## 🔍 3 บั๊กจริงของ patch เก่าที่ Session นี้แก้

1. **เปิดซองผิด** — `phxGetAllActiveOverlaysForMonth` คืน `{ok, overlays, count}` object ไม่ใช่ array → patch เก่านับ `.length` = undefined → skip ทันที
   **แก้:** ใช้ `pbRes.count > 0` แล้วส่ง `pbRes.overlays`

2. **ทิ้งกระดาษที่แปลแล้ว** — `_phxApplyOverlaysGlobally` เป็น immutable pure function → patch เก่าเรียกแต่ทิ้ง return → schedule เดิมยังไม่เปลี่ยน
   **แก้:** `schedule = _phxApplyOverlaysGlobally(...)` (มี `=`)

3. **ไม่มีเบรกฉุกเฉิน** — ถ้า Path B พัง → ทั้ง `getScheduleData` พัง → คน 300 คนโหลดหน้าเว็บไม่ได้ (เหตุที่ session ก่อน rollback)
   **แก้:** ล้อม `try/catch`

**บวก:** เจอบั๊กที่ 4 ที่ session ก่อนไม่รู้ = **Frontend Firebase-first** → ต่อให้ Path B ทำงานถูก frontend ก็ไม่เห็น เพราะไม่เคยไปหา GAS

---

## 🚀 Deployment State

- ✅ `clasp push` แล้ว (code.js + Index.html)
- ✅ Deploy new version แล้ว (URL `/exec` ให้ code ใหม่ได้)
- ✅ Test ผ่านทั้ง incognito (anonymous) + logged-in
- ⚠️ **`PHX_TEST_DOMAIN=gmail.com` ยังอยู่** — test mode ยังเปิด (ต้อง disable ก่อน rollout จริง)

---

## 🧪 วิธีเช็คว่ายังทำงานอยู่ (2 นาที)

**Test A — Backend (พิสูจน์ Path B อย่างเดียว)**
1. GAS Editor → เลือก `testGlobalApply_endToEnd` → Run
2. **ควรเห็น:** `overlays: 19` + `shifts ที่ overlay เปลี่ยนเจ้าของ (18 รายการ)`
3. ถ้าเห็นเลข = backend Path B ทำงาน

**Test B — Full flow (พิสูจน์ทั้งระบบ)**
1. เปิด incognito → URL `/exec` ของ webapp
2. เลือก มิ.ย. 2569
3. หาเซลล์ `05/06 (ศ.) O11 2:30-8:30`
4. **ควรเห็น "ณรพล"** (ไม่ใช่ "ณัชชพล" เจ้าของเดิม)
5. **F12 → Console** → ควรเห็น log `🎯 Path B: merging overlays into rawData (2306 shifts)`

**Test C — Direct backend call**
1. เปิด webapp → F12 → Console
2. Paste:
   ```js
   google.script.run
     .withSuccessHandler(r => console.log('_pbApplied?', r._pbApplied, '| shifts:', r.schedule?.length))
     .getScheduleData('m_1781304482466579')
   ```
3. **ควรเห็น:** `_pbApplied? true | shifts: 2306`

---

## 📋 TODO ที่ค้างไว้ (เรียง priority)

| ลำดับ | เรื่อง | ทำไมสำคัญ | ที่ไหน |
|-------|-------|----------|--------|
| 🔴 **HIGH** | เรียก `phxDisableTestMode()` | ก่อน rollout 300 คน — ตอนนี้ยัง test mode | `Phase_Z_C2_Helpers.js:492` |
| 🟡 Med | เคลียร์ Schedule tab ซ้ำ | ม.ค./พ.ค./มิ.ย. มี 3 tabs ต่อเดือน = สับสน + เปลืองพื้นที่ | Schedule sheet — 6 tabs ควรลบ |
| 🟢 Low | Sunset Phase 2B | code ~1000 บรรทัดที่ทำงานแต่ปลายทางว่าง (User_Overlays deleted + Firebase user_bindings/user_overlays/pharmacist_names ทั้งหมด empty) | `Phase2B.js` + `code.js:1365` |
| 🟢 Low | ลบ `PHX_Overlays` sheet | Phase Y dead ไม่มี consumer แล้ว | Grep ยืนยันก่อนลบ |

---

## 🎓 บทเรียนที่ session นี้ได้ (สำหรับ Claude คนต่อไป)

**Klui's communication style (saved to memory):**
- **ใช้ metaphor** ที่ไม่ใช่ dev ก็เข้าใจได้ — ตู้ประกาศ / โพสต์อิท / พนักงานประจำร้าน / ล่าม
- **ภาษาธรรมดา ไม่ jargon เกินไป** — ถ้าจำเป็นต้องใช้คำเทคนิค คู่กับ metaphor เสมอ
- **Diagrams ให้เรียบง่ายกว่าที่คิดว่า "ครบ"** — 28-node topology ที่คิดว่าดีแล้ว Klui บอก "ยังดูยาก"

**Klui's decision style:**
- ระมัดระวังมากๆ กับคน 300 คน — pref rollback ถ้าไม่แน่ใจ (ถูกต้อง)
- ชอบเห็น diff ก่อน push
- OK ให้ Claude ตัดสิน priority (เชื่อใจให้เดินได้)

**Architecture ที่ต้องจำ:**
- **Frontend Firebase-first, GAS-second** — ต่อให้ patch backend ถูก ถ้าลืม frontend fetch = ไม่เห็นผล
- **`getScheduleData` returns both `schedule` และ `data`** — schedule สำหรับ backward compat, data สำหรับ frontend
- **`_phxApplyOverlaysGlobally` เป็น pure function immutable** — ต้อง reassign

---

## 📁 Reference Files

**Memory (สำหรับ Claude คนต่อไปอ่าน):**
- `C:\Users\Klui\.claude\projects\C--Users-Klui-siriraj-rx-shift\memory\`
  - `MEMORY.md` — index
  - `project_path_b_fix.md` — สรุปการแก้ที่เพิ่งเสร็จ
  - `feedback_communication_style.md` — Klui ต้องการอธิบายง่าย + metaphor
  - `feedback_visualizations.md` — Diagrams ต้องเรียบง่าย

**System Map (interactive HTML):**
- `C:\Users\Klui\Claude things\system_map.html` — เปิดใน browser ดู topology
- Artifact URL: https://claude.ai/code/artifact/ee03a909-92fd-411e-837c-949d530ae94d

**Auto-update tool:**
- `C:\Users\Klui\Claude things\build_map.js` — regenerate system_map.html จาก JSON ใหม่
- Usage: `node build_map.js diagnostics/MapA_XXX.json`

**Diagnostic JSONs (ประวัติ):**
- `C:\Users\Klui\Claude things\diagnostics\`
  - `MapA_diagnostic_20260705_151230.json` — Firebase probe fail (401)
  - `MapA_diagnostic_20260705_152247.json` — Firebase probe สำเร็จ (OAuth)

**Diagnostic tool ใน GAS (`Test.js:123-320`):**
- `devCheckOverlays()` — สำรวจ sheets + Firebase + functions + properties → export JSON to Drive

---

## 🔗 Key Numbers ที่ต้องจำ

- **Sheet ID:** `1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM`
- **Firebase:** `siriraj-rx-shift-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Test data:** มิ.ย. 2569 มี 19 overlays → 18 shifts เปลี่ยนเจ้าของ
- **Build:** vY3.40-pathB-live
- **User count:** ~300 (ระวังทุก deploy)

---

## 💡 ถ้าอนาคตอยาก optimize เพิ่ม

**Flicker ~1-2 วิ ทุกครั้งที่โหลดเดือน** (เห็นดิบก่อน แล้วเปลี่ยนเป็นแปะ overlay)

ถ้าอยากกำจัด flicker → เปลี่ยน architecture:
- **Approach A:** Apply Path B ใน `syncMonthToFirebase` → Firebase เก็บ consensus view → Frontend ได้ overlay ทันที ไม่ต้องเรียก GAS ซ้ำ
- **Trade-off:** ต้อง sync ใหม่ทุกครั้งที่ overlay เปลี่ยน (append/delete) — ต่างจากตอนนี้ที่ sync แค่ตอน master schedule เปลี่ยน

Session นี้เลือก approach ง่ายๆ (frontend fetch ทั้ง 2) ก่อน — ถ้า UX ok ก็ไม่ต้องแก้เพิ่ม

---

**สรุป:** เป้าหมายหลักของ session นี้ (visibility bug) **ปิดได้แล้ว** — ที่เหลือคือ housekeeping ที่ deferred ตาม priority
