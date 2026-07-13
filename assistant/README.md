# PHX-Assistant — ตารางเวรผู้ช่วยเภสัชกร (โรงพยาบาลศิริราช)

ระบบตารางเวร **ผู้ช่วยเภสัชกร** ยึดสถาปัตยกรรมเดียวกับระบบ PHX (เภสัชกร) —
**Google Apps Script + Firebase Realtime Database + Google Sheets** — แต่เป็น
**โปรเจกต์แยกต่างหาก** (คนละ GAS project, คนละ Firebase, พร้อมแยกเป็น GitHub repo ใหม่)

โฟลเดอร์นี้ออกแบบให้ **ทั้งโฟลเดอร์ = root ของ repo ใหม่** ยกออกไปได้ทันที

## ต่างจากระบบเภสัชอย่างไร
- ❌ ไม่มี login / auth  — Admin แก้ข้อมูลผ่าน Google Sheet โดยตรง
- ❌ ไม่มี overlay / swap (ยกเวร/แลกเวร)
- ❌ ไม่มี LINE / broadcast / email
- ✅ personKey = ชื่อ+วงเล็บดิบตามตารางเวร (เช่น `ธนวัฒน์(ซ)`) ไม่ generate ID ใหม่
- ✅ ระบบชื่อเล่นผ่านชีท "ทำเนียบชื่อเล่น" (Admin กรอกเอง) → แสดง `ชื่อเล่น personKey`
- ✅ Validator แบบ reconciliation (ตรวจอิสระจาก parser) รันทุกครั้งที่ ingest

## ไฟล์ในโปรเจกต์
| ไฟล์ | หน้าที่ |
|---|---|
| `AsstCode.js` | doGet (ไม่มี auth), config, helpers, upload pipeline, Firebase REST, month index |
| `AsstFastFetch.js` | hydrate workbook → blob (display + typed values) — พอร์ตจาก FastFetch เดิม |
| `AsstParser.js` | ★ parser 4 ชนิดชีท: clinic / กลางคืน / กลางวัน OK / 30B → flat records |
| `AsstValidator.js` | ★ reconciliation: structural-drift + population + coordinate + เช็คเฉพาะผู้ช่วย |
| `AsstNickname.js` | sync ชีท "ทำเนียบชื่อเล่น" → `/people/{personKey}/nickname` |
| `AsstIndex.html` | หน้าผู้ใช้: ปฏิทินรายวัน + timeline รายคน (resolve ชื่อเล่น, 4 source) |
| `AsstAdmin.html` | หน้า Admin: อัปโหลด xlsx + รายงาน validator + ปุ่ม sync ชื่อเล่น |
| `appsscript.json` | manifest (Asia/Bangkok, Sheets/Drive advanced services, webapp ANYONE_ANONYMOUS) |
| `.clasp.json.example` | ต้นแบบ `.clasp.json` — ใส่ scriptId ของ GAS project ใหม่ |

## Firebase schema
```
/schedules/{yyyy-mm}
    label            "กรกฎาคม 2569"
    data: [ record, ... ]                     // flat array — frontend filter เอง
    closed: { clinic: { SM:[28,29,30], ... } }  // หยุดคลินิก
    validation: { errors, warnings, stats }
/monthIndex   [ {key,label}, ... ]
/people/{safeKey}  { personKey, nickname }    // sync จากชีท

record = { source, personKey, group, subGroup, area, seq, duty, date, timestamp, timeSlot }
  source : "clinic" | "night" | "daytimeOK" | "unit30B"
  duty   : {main[,other]}  หรือ  {morning, afternoon}   (IPD/NM5 กลางวัน)
```

## ขั้นตอนติดตั้ง (ทำครั้งเดียว)
1. **สร้าง GAS project ใหม่** → เปิด advanced services **Sheets** + **Drive** (v3/v4)
   - `cp .clasp.json.example .clasp.json` แล้วใส่ `scriptId`
   - `clasp push` (ไฟล์ทั้งหมดในโฟลเดอร์นี้)
2. **สร้าง Firebase RTDB ใหม่** (asia-southeast1) → คัด URL ใส่ `ASST_FIREBASE_DB_URL` ใน `AsstCode.js`
   - RTDB rules ช่วงเดโม: `{ "rules": { ".read": true, ".write": false } }` (เขียนผ่าน GAS REST เท่านั้น)
3. **สร้าง Google Sheet 1 ไฟล์** สำหรับ master → ใส่ id ใน `ASST_MASTER_SHEET_ID`
   - รัน `setupNicknameSheet()` จาก editor เพื่อสร้างแท็บ "ทำเนียบชื่อเล่น"
4. **Deploy → Web app** (execute as me, access: anyone) → ได้ URL
   - หน้าผู้ใช้: `<url>` · หน้า Admin: `<url>?admin=true`

## การใช้งานประจำเดือน
1. เปิด `?admin=true` → ลากไฟล์ `.xlsx` ตารางเวร → กด "ประมวลผล + Publish"
2. อ่านรายงาน validator — ถ้ามี **error** (POP_MISMATCH / STRUCT_DRIFT) ระบบจะ **ไม่ publish**
   จนกว่าจะแก้ไฟล์ หรือกด force (กรณีมั่นใจ)
3. อัปเดตชื่อเล่นในชีท → กด "Sync ชื่อเล่น"

## สถานะ / ทดสอบแล้ว
- Parser + Validator ทดสอบเทียบข้อมูลจริง **5 เดือน** (ธ.ค.68, ก.พ./เม.ย./มิ.ย./ก.ค.69):
  population reconciliation ตรง 100%, coordinate 100% resolved, IPD seq 1..24 ต่อเนื่อง,
  จับ "หยุดคลินิก" ถูกทุกเดือน (เช่น ก.ค. SM = 28,29,30) — **0 validator error ทุกเดือน**
- Frontend (ปฏิทิน + timeline + ชื่อเล่น) ทดสอบ render ด้วยข้อมูลจริง ก.ค. (3,231 records) ผ่าน

## ยังไม่ได้ทำ (follow-up)
- เวรกลางวันวันธรรมดา (จ-ศ) ของ NM5/103/IPD — ไม่มีในไฟล์ต้นฉบับ ต้องยืนยันแหล่งข้อมูล
- ชีท `เปลี่ยนเวลาพิเศษ` (exceptions) — มีบางเดือน ยังไม่ ingest
- `/personIndex` (index ค้นรายคนเร็ว) — ตอนนี้ frontend filter flat array ตรงๆ พอสำหรับสเกลนี้
- Firebase-direct read (เร็วขึ้น) — ตอนนี้อ่านผ่าน `google.script.run` (เสถียร)
