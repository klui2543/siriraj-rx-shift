# PHX-Assistant — Handoff (13 ก.ค. 2569)

> สืบต่อจาก `knowledgeexport________________20260710.md` (10 ก.ค. 2569) — เอกสารนั้นเป็น
> knowledge/design ก่อนลงมือเขียนโค้ด ส่วนเอกสารนี้คือสถานะหลัง **เขียน prototype จริงแล้ว**
> ใช้เป็น context ตั้งต้นสำหรับ session ถัดไป (ไม่ว่าจะ deploy จริง หรือทำ follow-up items)

## สรุป 1 บรรทัด
Prototype ของ PHX-Assistant **เขียนเสร็จ + verify กับข้อมูลจริงแล้ว** (parser + validator
ผ่านทุกเดือน, frontend render ได้จริง) อยู่ในโฟลเดอร์ `assistant/` ของ repo `siriraj-rx-shift`
บน branch `claude/existing-system-assistants-9drri4` — **รอ Klui migrate ไปเป็น repo ใหม่ +
เดินเครื่อง GAS/Firebase จริง** (คำสั่ง migrate อยู่ท้ายเอกสารนี้)

## สถานะปัจจุบัน (จบ session นี้)

### ตัดสินใจที่ล็อกแล้ว
1. **แยกเป็น repo GitHub ใหม่ + GAS project ใหม่ + Firebase ใหม่** ทั้งหมด — ไม่รวมกับ
   `siriraj-rx-shift` (ของเภสัช) เลย โฟลเดอร์ `assistant/` ออกแบบให้ **ทั้งโฟลเดอร์ = root
   ของ repo ใหม่** ยกออกได้ทันที
2. **Validator เป็นจุดที่ต้องใส่ใจเป็นพิเศษ** (คำสั่งของ Klui) — เพราะ parser พึ่ง hardcoded
   row-position constants + forward-fill ซึ่ง "ดริฟต์เงียบ" ได้ถ้า template เดือนใหม่เปลี่ยน
3. Deliverable แรก = **ครบทุกสเปคชีท (clinic/กลางคืน/กลางวัน OK/30B) จนแสดงผลได้ end-to-end**
   — ทำเสร็จแล้วในเซสชันนี้

### สิ่งที่ทำเสร็จแล้ว (โค้ดจริง ไม่ใช่แค่แผน)
อยู่ใน `assistant/` (ดู `assistant/README.md` สำหรับรายละเอียดไฟล์ + schema):
- `AsstParser.js` — parser ครบ 4 sheet type (clinic 11 กลุ่ม forward-fill + หยุดคลินิก /
  กลางคืน 3 รอบ / กลางวัน OK เช้า-บ่าย+ยา-อุปกรณ์+seq ต่อเนื่อง / 30B)
- `AsstValidator.js` — reconciliation อิสระจาก parser (structural-drift + population +
  coordinate + เช็คเฉพาะผู้ช่วย: IPD seq, duty shape) — พอร์ตแนวคิดจาก `Validator_L3_Reconciliation.gs.js`
  ของระบบเภสัช
- `AsstFastFetch.js`, `AsstCode.js` (doGet ไม่มี auth, Firebase REST, upload pipeline)
- `AsstNickname.js` (sync ชีท "ทำเนียบชื่อเล่น" → `/people/{personKey}/nickname`)
- `AsstIndex.html` (ปฏิทินรายวัน + timeline รายคน, resolve ชื่อเล่น, 4-source filter, dark mode)
- `AsstAdmin.html` (อัปโหลด xlsx + รายงาน validator + ปุ่ม sync ชื่อเล่น)
- `appsscript.json`, `.clasp.json.example`, `README.md`

### Verification ที่ทำไปแล้ว (ยืนยันด้วยไฟล์จริง ไม่ใช่แค่ทฤษฎี)
รันสองรอบ: (1) Python reference parser เทียบ logic, (2) **Node harness ที่รันโค้ด GAS ตัวจริง**
(`AsstParser.js`/`AsstValidator.js`) ผ่าน `vm` module กับ blob ที่ export จากไฟล์จริง —
ผลตรงกันทั้งสองรอบ กับข้อมูลจริง 5 เดือน (ธ.ค.68, ก.พ./เม.ย./มิ.ย./ก.ค.69):

| เดือน | total records | unique names | POP mismatch | coordinate mismatch | IPD seq 1-24 | หยุดคลินิก |
|---|---|---|---|---|---|---|
| ธ.ค.68 | 3531 | 170 | 0 | 0/437 | ✅ contiguous | SM=[5,10,31] |
| ก.พ.69 | 3012 | 162 | 0 | 0/425 | ✅ contiguous | (ไม่มี) |
| เม.ย.69 | 2976 | 210 | 0 | 0/420 | ✅ contiguous | SM=[6,11-15] |
| มิ.ย.69 | 3166 | 164 | 0 | 0/447 | ✅ contiguous | SM=[1,3] |
| ก.ค.69 | 3231 | 176 | 0 | 0/399 | ✅ contiguous | SM=[28,29,30] |

→ **validator error = 0 ทุกเดือน** (population reconciliation ตรง 100%, coordinate 100% resolved)

Frontend: render ด้วยข้อมูล ก.ค. จริง (3,231 records) ผ่าน Playwright screenshot — ปฏิทิน,
day-detail, person-timeline, การ resolve ชื่อเล่น ("ซัน ธนวัฒน์(ซ)") ทำงานถูกต้องทั้งหมด

### ข้อจำกัดของ verification (สิ่งที่ยัง**ไม่ได้**ทดสอบ)
สภาพแวดล้อมนี้ **รัน Google Apps Script / Firebase RTDB จริงไม่ได้** (ไม่มี live GAS runtime,
ไม่มี Firebase project) — สิ่งที่ verify ได้คือ **logic ของโค้ด** (parser/validator) ด้วยการรันใน
Node.js sandbox ที่ stub เฉพาะ GAS global ที่จำเป็น (`Utilities.formatDate`, `Logger.log`)
**ยังไม่เคย**:
- รัน `uploadAssistantFile()` จริงบน GAS (Drive.Files.create แปลง xlsx → Sheet, hydrate ผ่าน
  Sheets API จริง)
- เขียน/อ่าน Firebase RTDB จริงผ่าน `UrlFetchApp`
- ทดสอบ `AsstNickname.js` (`syncNicknames`) กับ Sheet จริง
- ทดสอบ `doGet` / deploy เป็น web app จริง

→ **สิ่งแรกที่ควรทำหลัง deploy**: อัปโหลดไฟล์ 1 เดือนผ่านหน้า Admin จริง แล้วเทียบผลกับตาราง
ด้านบน (ควรได้ตัวเลขเดียวกัน ถ้าไม่ตรง แปลว่ามีจุดที่ Sheets API คืนค่าต่างจาก openpyxl
`data_only=True` ที่ใช้ตอน dev — เช่น formula ที่ยังไม่ recalculate)

## ขั้นตอนที่ Klui ต้องทำเอง (deploy จริง)

### 1. Migrate เป็น repo ใหม่ (Klui กำลังทำเองตอนนี้)
```bash
cd siriraj-rx-shift/assistant
git init && git add . && git commit -m "Initial import: PHX-Assistant"
git branch -M main
git remote add origin https://github.com/klui2543/<ชื่อ-repo-ใหม่>.git
git push -u origin main
```
(หมายเหตุ: ลองสร้าง repo ผ่าน GitHub MCP ให้อัตโนมัติแล้ว แต่ GitHub App ที่ session นี้ใช้
**ไม่มีสิทธิ์สร้าง repo ใหม่** — ได้ 403 "Resource not accessible by integration" จึงต้อง
สร้าง repo เปล่าเองที่ github.com/new ก่อน)

### 2. ตั้งค่า 3 จุดใน `AsstCode.js` (ดูรายละเอียดใน `README.md`)
1. `.clasp.json` (จาก `.clasp.json.example`) — scriptId ของ GAS project ใหม่
2. `ASST_FIREBASE_DB_URL` — URL ของ Firebase RTDB ใหม่ (asia-southeast1)
3. `ASST_MASTER_SHEET_ID` — id ของ Google Sheet ที่จะมีแท็บ "ทำเนียบชื่อเล่น"

### 3. Deploy
- เปิด advanced services **Sheets v4** + **Drive v3** ใน GAS project
- `clasp push` → Deploy → Web app (execute as me, access: anyone)
- รัน `setupNicknameSheet()` จาก editor ครั้งแรกเพื่อสร้างแท็บชื่อเล่น
- เปิด `<url>?admin=true` → อัปโหลดไฟล์ 1 เดือนทดสอบ → เทียบกับตาราง verification ด้านบน

## Open questions (ไม่ block การ deploy แต่ต้องตอบภายหลัง)
1. **เวรกลางวันวันธรรมดา (จ-ศ) ของ NM5/103/IPD** — ไม่มีในไฟล์ทั้ง 6 เดือนที่ตรวจสอบ (ทั้ง
   session ก่อนหน้าและ session นี้) ต้องถาม Klui ว่าจัดจากที่ไหน — ตอนนี้ parser ดึงเท่าที่มี
   ในไฟล์ (เฉพาะวันหยุด/วันพิเศษ) เท่านั้น
2. **ชีท `เปลี่ยนเวลาพิเศษ`** (exceptions) — เจอในไฟล์ ธ.ค.68 และ เม.ย.69 (ไม่ใช่ทุกเดือน)
   ยังไม่ได้ ingest เข้าระบบ — ต้องดูว่าเนื้อหาคืออะไรแล้วออกแบบ schema เพิ่ม
3. **`/personIndex`** (index ค้นเวรรายคนเร็ว ตามที่ knowledge doc เดิมร่างไว้) — ยังไม่ทำ
   เพราะ frontend filter บน flat array ตรงๆ ก็เร็วพอสำหรับสเกล ~200 คน/เดือน ถ้าในอนาคตช้า
   ค่อยเพิ่ม
4. **Firebase-direct read จาก frontend** (เร็วกว่า `google.script.run`) — ตอนนี้ยังอ่านผ่าน
   `google.script.run.getScheduleData()` เพื่อความง่าย/เสถียรก่อน ถ้าต้องการ real-time
   polling แบบ `Index.html` ของเภสัช (ที่ subscribe `.on('value')`) ทำเพิ่มได้ภายหลัง

## Key learnings จาก session นี้ (เพิ่มเติมจาก knowledge doc เดิม)
- **เก็บเวรเป็น flat records array แทน tree ซ้อน** — ตรวจโค้ดจริงของระบบเภสัชแล้วพบว่า
  `/schedules/{key}/data` เป็น flat array เสมอ ไม่ใช่ tree ตาม room/day อย่างที่ knowledge
  doc เดิมร่างไว้ (`/shifts/{yyyy-mm}/clinic/{room}/{day}/{slot}`) — ฝั่งเภสัชทำ group/filter
  **ทั้งหมดที่ frontend** ด้วย `.filter()` เราตัดสินใจ **เดินตามแบบ flat** เพราะ proven
  pattern และ render ง่ายกว่า
- **month key เปลี่ยนจาก Thai label เป็น ISO `yyyy-mm`** — ระบบเภสัชใช้ label ไทยเป็น key
  (`m_มิถุนายน_2569`) ซึ่งเปราะ (sort ยาก, encode ยุ่ง) ผู้ช่วยใช้ `yyyy-mm` ตรงๆ แล้วเก็บ
  `label` ไทยเป็น field แยกไว้แสดงผล
- **Validator ต้อง "อิสระจาก parser" จริงๆ** — ถ้าใช้ logic เดียวกับ parser ในการตรวจ
  จะตรวจไม่เจอ bug ของ parser เอง (จะพลาดพร้อมกัน) ต้อง detect date-column ด้วยวิธีที่ต่างจาก
  parser (เช่น scan ทุกแถวหา Date type อีกรอบ แทนที่จะเชื่อ header-row เดียวกับที่ parser เจอ)
  — ในโค้ดปัจจุบันยัง reuse `_findDateHeader_` ร่วมกับ parser อยู่บางจุด (เพื่อความเร็วในการ
  ทำ prototype) **ถ้าจะทำให้ validator เข้มขึ้นในอนาคต ควรแยก date-detection ของ validator
  ให้เป็นอัลกอริทึมคนละชุดจริงๆ แบบ `Validator_L3` ของเภสัช** (ตอนนี้ยังไม่ได้แยก 100%)
- **verify ได้แม้ไม่มี live GAS/Firebase** — เทคนิคที่ใช้ได้ผลคือ export blob จาก openpyxl
  เป็น JSON แล้วรันไฟล์ `.js` ของ GAS จริงในเซสชัน (`vm` module + stub เฉพาะ global ที่จำเป็น)
  วิธีนี้ verify ได้ลึกกว่าการรีวิวโค้ดเฉยๆ (จับ syntax error, logic error, และเทียบผลลัพธ์
  เป็นตัวเลขได้จริง) แนะนำใช้วิธีนี้ต่อทุกครั้งที่แก้ parser/validator ก่อน deploy จริง

## Tools & resources
- Google Apps Script, Firebase Realtime Database, Google Sheets, clasp
- Verification harness (ใช้ตอน dev เท่านั้น ไม่ใช่ส่วนของ production code):
  Python (`openpyxl`, `data_only=True`) เป็น reference parser + Node.js `vm` harness
  รันโค้ด GAS จริง — ทั้งสองไม่ได้ commit เข้า repo (อยู่ใน scratchpad ของ session)
- ไฟล์ต้นฉบับที่ใช้ verify: เวรผู้ช่วย 5 เดือน (12-68, 02-69, 04-69, 06-69, 07-69)
