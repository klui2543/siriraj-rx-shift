# HANDOFF — v3.49 (session จบ 2026-07-16, เช้ามืด) → ทำต่อบนมือถือ

**สถานะ:** โค้ด v3.49 ทั้งหมด **เสร็จ + push ขึ้น `main` แล้ว** (origin/main tip = `cbbce79`)
**ยังไม่ deploy** — Klui ต้อง deploy + live-test เอง (ดูด้านล่าง)
**Launch เป้าหมาย:** ศุกร์ 17 ก.ค. 2569

---

## 🚀 สิ่งที่ต้องทำก่อน (สำคัญสุด) — DEPLOY

รอบนี้แตะ **server (code.js)** ด้วย (ก้อน B + D2-xlsx) → deploy แค่ push GAS version ไม่พอ:

1. **`clasp push`** (ดันทั้ง `code.js` + `Index.html` ขึ้น GAS project)
2. **Deploy → Manage deployments → ✏️ → New version → Deploy**
3. เสร็จแล้ว /exec จะขึ้นของใหม่ทั้งหมด

> ⚠️ ถ้า deploy แค่ New version โดยไม่ `clasp push` ก่อน → code.js ฝั่ง server จะยังเป็นของเก่า (ปุ่มดาวน์โหลด .xlsx จะ error)

---

## ✅ สิ่งที่เสร็จแล้วใน session นี้ (ทั้งหมดอยู่บน main)

| งาน | ทำอะไร | commit |
|---|---|---|
| **ก้อน A** | โหมด "สมุดส่วนตัว" (ปิด publish, กรอง overlay คนอื่น) + ปิดรอยรั่ว incognito | `6482a70` + `043dbde` ฯลฯ |
| **ก้อน B** | รวมสูตรรหัสเดือน (server+client เป็นฟังก์ชันเดียว) + ข้อความไม่ตกใจ | `171180c` |
| **ก้อน C** | audit log แอดมิน override + เซสชันหมดอายุ 24 ชม. | `301846e` |
| **D1** | พรีเซ็ตห้อง (export) — พับได้ + edit-mode ลบ + สร้างเลือกคนใหม่ | `d5f69e7` `d2249b6` `c86866a` `9656d61` |
| **D2 (csv)** | ดาวน์โหลดตารางทั้งเดือน .csv (สำรอง) | `3501ddb` |
| **D2-xlsx** | ดาวน์โหลด **ไฟล์ .xlsx ต้นฉบับ** ที่อัปโหลด (server เก็บไฟล์ + `phxGetOriginalXlsx`) | `b7f047b` |
| **D3** | ไดอะแกรม A→B⟷/→C ทิศทางแลก/รับเวร (สัมปทาน) ในกล่องยืนยัน | `db8cc6c` |

**verify ทุกงาน:** node --check ผ่าน + unit/harness (บาง feature ขับ UI จริงในเบราว์เซอร์). แต่ **ส่วน server (Drive/google.script.run) เทสในเครื่องเปล่าไม่ได้ → ต้อง live-test**

---

## 📲 Live-test checklist (หลัง deploy)

- [ ] **สมุดส่วนตัว:** incognito/คนอื่น filter ดูเรา → เห็นแต่ตารางต้นฉบับ (ไม่เห็นเวรแลก/นับไม่เกิน)
- [ ] **แลกเวร:** กดสลับ/รับ → เห็น **ไดอะแกรม A→B→C** ใต้ช่องระบุชื่อ + อัปเดตสดตอนแก้ชื่อ
- [ ] **B (ซิงค์):** สลับเดือนไปมา ข้อมูลมาปกติ; ถ้าโหลดพลาดขึ้น toast "โหลดไม่สำเร็จชั่วคราว" (ไม่ใช่ alert แดง)
- [ ] **เซสชัน:** login ทิ้งไว้ (จริงๆ ต้องรอ 24 ชม. — หรือแค่เช็คว่า login/ใช้งานปกติ ไม่เด้งออกทันที)
- [ ] **Export → พรีเซ็ต:** เปิด export → "คนที่จะปริ้น" มีคนของหน้าที่ดูอยู่ให้เลย + เพิ่มคนอื่นได้ + สร้าง/พับ/ลบพรีเซ็ต + ลบชื่อจนว่างเมนูไม่หาย
- [ ] **Export → .xlsx:** กดปุ่ม "ดาวน์โหลดไฟล์ต้นฉบับ (.xlsx)" → ได้ไฟล์ Excel เปิดได้ (ดู stopgap ก.ค. ด้านล่าง)

---

## 📅 ไฟล์ .xlsx เดือน ก.ค. 69 (stopgap)

ไฟล์ต้นฉบับเก่าถูกลบไปแล้ว (ตั้งแต่ก่อนแก้) → เดือน ก.ค. ต้องทำเอง 1 ครั้ง (เดือนต่อๆ ไป auto):

**ทางง่าย:** อัปโหลดไฟล์ ก.ค. อีก 1 รอบ (วิธีปกติ) หลัง deploy → ระบบเก็บ+ลงทะเบียนให้เอง

**ทางวางเอง:** วางไฟล์ใน Drive → เอา file ID จาก URL → Apps Script Editor รันฟังก์ชันนี้ 1 ครั้ง:
```js
function seedJulyXlsx() {
  var LABEL   = 'กรกฎาคม 2569';   // ← ต้องตรงกับชื่อเดือนใน dropdown เป๊ะ
  var FILE_ID = 'วางรหัสไฟล์ตรงนี้';
  var f = DriveApp.getFileById(FILE_ID);
  PropertiesService.getScriptProperties().setProperty('phx_xlsx_' + LABEL.trim(), FILE_ID + '\n' + f.getName());
  return 'OK ' + LABEL;
}
```

---

## 🔜 ค้างไว้ (ยังไม่ทำ — ถ้าต้องการภายหลัง ไม่เร่ง)

- ไดอะแกรม A→B→C สำหรับ **ยก/ยกเลิก** (give/cancel — แบบ 2 คน ง่ายกว่า)
- เปิดให้แอดมินแก้เวรคนอื่นจากโมดัลหลัก (#3ก) — Klui บอก "ยังไม่เปิด"
- server-side session enforce ผ่าน `lastSeen` (แข็งแรงกว่า client-only)
- ปุ่มสลับกลับ "สมุดกลาง": `setPublishEnabled(true)` (console) — flag `_publishEnabled` default OFF

---

## 🔑 หมายเหตุเทคนิค (กันงง)

- **โหมดสมุดส่วนตัว** = flag `window._publishEnabled` (default OFF). choke points: `OverlayManager.getActions` (ต้นน้ำ — non-bound viewer คืน []), `PBOverlays.getUsedMap`, `buildGhostRows` Pass0, `getEffectiveData` anon, `_noteRecords`.
- **month key** = `monthKeyFromLabel(label)` (client) / `monthKeyFromLabel_` (server) — ต้องตรงกันเป๊ะ.
- **.xlsx ต้นฉบับ** = Script Property `phx_xlsx_<label>` → fileId. `uploadLocalFile` เก็บไฟล์ (ไม่ trash ถ้า `_keptOrig`).
- **บั๊กเมนูหาย** (แก้แล้ว) = คลิกในพาเนล export ลอยไปโดน document-click handler อื่น → เพิ่ม `e.stopPropagation()` ใน `_ecmPanelClick`.
- git: `main` = canonical, auto-stamp commit + hash file เป็นของ hook (ปล่อยได้). fetch ก่อน push เสมอ.

รายละเอียดเต็มอยู่ใน memory: `project_v349_personal_book.md`
