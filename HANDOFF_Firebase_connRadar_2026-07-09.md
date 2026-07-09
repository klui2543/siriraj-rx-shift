# HANDOFF — "Firebase ดับ" จริงๆ คืออะไร (2026-07-09)

Branch: `work/v3.44-lww` (ทุก commit push แล้ว). Canonical worktree: `clever-zhukovsky-390ab9`.

## TL;DR — "Firebase ดับ" ไม่เคยเป็น Firebase หลุด มันคือ 3 เรื่องปนกัน

| # | อาการ | สาเหตุจริง | สถานะ |
|---|---|---|---|
| 1 | overlay ไม่อัปเดตสด เกือบทุกครั้ง | `_syncPublish` default OFF → เพื่อน publish แล้วไม่ถึง server | ✅ FIXED+DEPLOYED `9fe6703` |
| 2 | ไฟ 🟢 radar เป็นเหลือง "GAS (Static)" | เดือนนี้ถูกดึงผ่าน GAS ไม่ใช่ Firebase (**ไม่ใช่การเชื่อมต่อหลุด** — `.info/connected=true`) | 🟡 OPEN — ต้องรัน diagnostic |
| 3 | Toggle (timeline ประวัติ) ที่กางไว้ หุบหมดตอน refresh | สถานะกางเก็บใน DOM อย่างเดียว → `renderTable` วาดใหม่ล้างทิ้ง | ✅ FIXED `ecec69e` (รอ Klui เทส) |

## ตัว 🟢 = `connRadar` (Index.html ~5685-5698)
- 🟢 "Live Sync" (เขียว เต้น) เมื่อ full-load ล่าสุด `source === 'firebase' || 'poll'`
- 🟡 "GAS (Static)" เมื่อ `source === 'gas'` (fallback)
- **มันสะท้อน "แหล่งของ load ล่าสุด" ไม่ใช่สถานะการเชื่อมต่อสด** — แอปไม่มี `.info/connected` listener เลย

## ทำไมมันเหลือง (ข้อ 2 — ยังไม่ฟันธง ต้อง verify ก่อนแก้)
`fetchMonthData`: Firebase `.on('value')` + timer 6 วิ + `fetchPathBOverlays` วิ่งขนานกัน
- Firebase คืน `null` (เดือนนี้ไม่มีใน `schedules/<key>`) → `fetchViaGAS()` → เหลือง **และค้างเหลือง** (poll พลิกเขียวเฉพาะตอน master เปลี่ยน → `handleDataReceived('poll')`)
- Firebase ช้า > 6 วิ → timer → GAS → เหลือง
- key ฝั่ง client: `currentFirebaseKey = "m_" + selectedLabel.replace(/\s+/g,'_')` (อิงข้อความ label) / ฝั่ง push (code.js `pushToFirebase_`): `"m_" + result.label.replace(...)` → ถ้า label ไม่ตรง = null = เหลืองถาวร

### Diagnostic (วางใน console frame `userHtmlFrame`)
```js
(function(){
  console.log('currentFirebaseKey =', currentFirebaseKey);
  var r=document.getElementById('connRadar'); console.log('radar:', r&&r.textContent.trim());
  fbDb.ref('schedules/'+currentFirebaseKey).once('value',function(s){
    console.log(s.val()? '✅ has data rows='+((s.val().data||[]).length) : '❌ NULL — เดือนนี้ไม่มีใน Firebase → GAS → เหลือง');
  });
})();
```
- **❌ NULL** → เดือนหาย/ key ไม่ตรง → แก้: re-push `syncMonthToFirebase(label)` (code.js) หรือ re-upload; หรือแก้การคำนวณ key ให้ตรงกัน
- **✅ มีข้อมูล แต่ radar เหลือง** → initial load ตกไป GAS (>6วิ) แล้วไม่พลิกกลับเขียว → แก้ตัว logic

## ทางแก้ radar (เลือกหลัง diagnostic)
1. **เดือนหาย** → re-push + (option) auto-heal: ตอน GAS fallback ให้เรียก `syncMonthToFirebase` ฝั่ง server
2. **ทำ indicator ให้ซื่อสัตย์** → ผูกกับ `firebase.database().ref('.info/connected').on(...)` แทน "แหล่ง load ล่าสุด" → เลิกร้อง "ดับ" ทั้งที่แค่ข้อมูลมาจาก GAS
3. **recover-to-green** → เมื่อ poll 30 วิ สำเร็จ (แม้ overlay-only) ให้เซ็ต radar เขียว (Firebase/poll ทำงานชัดเจน)

**คำแนะนำ:** ทำข้อ 2 (indicator ซื่อสัตย์) น่าจะตรงเจตนาสุด — Klui อยากได้ตัวเตือน "Firebase ติดจริงมั้ย" ไม่ใช่ "ข้อมูลมาจากไหน" ปัจจุบันมันปนกัน

## ข้อ 3 (Toggle หุบ) — FIXED `ecec69e`
สถานะกาง timeline เก็บใน DOM ล้วน (`toggleTimelineInline` สลับ `row.style.display` + คลาส chevron). `renderTable` วาดใหม่ทั้งก้อน → ล้างทิ้ง. เพิ่ม `_captureExpandedTimelines`/`_restoreExpandedTimelines` ห่อรอบ render ใน `triggerUpdate`. toggle-id = `actionId + _rowAidHash(shiftKey,name)` (อิงเนื้อหา คงที่ข้าม refresh → restore หาเจอ). ครอบเฉพาะ timeline chevron; toggle อื่น (filter panel / view toggle) อยู่นอกตาราง ไม่โดนล้างอยู่แล้ว

## Deploy
ทุก fix อยู่ใน `Index.html` (branch push แล้ว). paste `Index.html` + `Phase_Z_B3_Sync.js`. **ต้องสร้าง deployment เวอร์ชันใหม่ ไม่ใช่แค่ Save.** เช็คว่าขึ้นจริง: `typeof _captureExpandedTimelines === 'function'`

## Commits (work/v3.44-lww, 2026-07-09)
- `9fe6703` `_syncPublish` default ON — DEPLOYED + verified
- `191caec` picker current-holder — DEPLOYED + verified
- `ecec69e` timeline-preserve across refresh — รอ Klui เทส
- radar เหลือง (ข้อ 2) = ยัง OPEN, รัน diagnostic ก่อน
