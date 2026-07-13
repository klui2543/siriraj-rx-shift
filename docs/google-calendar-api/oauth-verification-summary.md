# สรุปสำหรับยื่นขอ Google OAuth Consent Screen Verification — Calendar Sync

**สถานะ:** ร่างเอกสารเตรียมยื่น (ยังไม่ได้ submit)
**วันที่จัดทำ:** 13 กรกฎาคม 2569
**ผู้จัดทำ:** ทีมพัฒนา Siriraj Rx Shift
**ใช้คู่กับ:** [`README.md`](README.md) (ลำดับการใช้เอกสารทั้งชุด), [`submission-checklist.md`](submission-checklist.md) (ขั้นตอนใน Cloud Console), [`privacy-policy.md`](privacy-policy.md) (ต้องมี URL จริงก่อนยื่น)

> เอกสารนี้ **ไม่ใช่ฟอร์มที่ส่งให้ Google โดยตรง** — Google ไม่มีแบบฟอร์ม "ยื่นเอกสาร" ให้อัปโหลด แต่ใช้วิธีกรอกข้อมูลใน Google Cloud Console (OAuth consent screen) แล้วกด "Submit for verification" เอกสารนี้คือ**แหล่งคำตอบที่พร้อม copy ไปกรอก**ทุกช่องที่ฟอร์มจะถาม รวมถึงข้อความ justification ที่ต้องเตรียมไว้ล่วงหน้า

---

## 1. ภาพรวมระบบ (สำหรับช่อง "App description")

Siriraj Rx Shift คือระบบจัดการและเผยแพร่ตารางเวรของเภสัชกร ฝ่ายเภสัชกรรม โรงพยาบาลศิริราช ใช้งานจริงอยู่แล้วกับผู้ใช้ระดับหน่วยงาน (~300 คน ปัจจุบัน) และมีแผนขยายเป็นระดับทั้งฝ่าย (~400 คน) ระบบแทนที่การจัดเวรแบบเดิม (Excel + LINE กลุ่ม) ด้วยตารางกลาง 1 แหล่งที่ทุกคนเห็นตรงกัน พร้อม audit trail ทุกการยก/แลกเวร

**ฟีเจอร์ที่ขอ Calendar API:** เมื่อผู้ใช้อนุญาต ระบบจะสร้าง/อัปเดต/ลบ event ในปฏิทิน Google ส่วนตัวของผู้ใช้คนนั้น ให้ตรงกับเวรที่ตนถืออยู่โดยอัตโนมัติ (รวมถึงเมื่อมีการยก/แลกเวรภายหลัง) เพื่อแก้ปัญหา **"ลืมเวร"** ซึ่งเป็น 1 ใน 3 pain point หลักที่ระบบตั้งใจแก้ตั้งแต่ต้น (ตาราง Excel แยกจากปฏิทินส่วนตัว ผู้ใช้ต้องคัดลอกเวรไปจดเองทุกครั้ง)

Copy-paste สั้นสำหรับช่อง App description:

```
Siriraj Rx Shift is an internal shift-scheduling system for the Pharmacy
Department, Siriraj Hospital. It centralizes duty rosters for ~300-400
pharmacists and lets them hand off / swap shifts with a full audit trail.
The Google Calendar integration lets each user automatically sync their
own duty shifts into their personal Google Calendar, so shift changes are
reflected without manual copying.
```

---

## 2. Scope ที่ขอ + เหตุผล (สำหรับช่อง "Scope justification")

| Scope | ระดับ | เหตุผลที่ต้องใช้ |
|---|---|---|
| `.../auth/calendar` | Sensitive | สร้าง/แก้ไข/ลบ event เวรของผู้ใช้ในปฏิทินของตัวเอง + ให้ผู้ใช้เลือก/สร้างปฏิทินปลายทางได้ (ใช้ `CalendarApp`) — **ไม่อ่าน event เดิมของผู้ใช้ ไม่เข้าปฏิทินคนอื่น** |
| `.../auth/userinfo.email` | ไม่ sensitive | รู้อีเมลบัญชี Google ที่ใช้ เพื่อ sync ให้ถูกคน + กันสลับบัญชีผิด |
| `.../auth/script.external_request` | Sensitive | อ่าน "เวรล่าสุดของผู้ใช้" จาก Firebase feed ตอน background trigger ทำงาน (auto-sync แม้ปิดแอป) — อ่านอย่างเดียว |
| `.../auth/script.scriptapp` | ไม่ sensitive | สร้าง/ลบ time trigger ของผู้ใช้เอง เพื่อทำ auto-sync (opt-in เปิด/ปิดได้) |

> **ถ้าต้องการหน้า consent สั้นที่สุด:** ตัด 2 scope ล่าง (`script.external_request` + `script.scriptapp`) ออก = สละ auto-sync แบบ background เหลือแค่ "ซิงค์ตอนเปิดแอป (instant-when-online)" ซึ่งไม่ต้องใช้ 2 scope นี้เลย

**⚠️ หมายเหตุ `calendar` vs `calendar.events`:** โครงที่ทำใช้ `CalendarApp` จึงต้องใช้ scope `calendar` (เต็ม) เพราะเมธอดจัดการปฏิทิน (เลือก/สร้างปฏิทิน) ต้องการ scope นี้ — **ทั้งสองตัวเป็นระดับ sensitive เท่ากัน ไม่ต้อง CASA ทั้งคู่** จุดที่ตัด CASA คือการแยก Calendar ออกจาก Gmail/Drive ไม่ใช่การเลือก scope calendar แบบไหน. ถ้าผู้รีวิวขอให้แคบเป็น `calendar.events` ค่อยเปลี่ยนไปใช้ Advanced Calendar Service แล้วตัดฟีเจอร์เลือกปฏิทินออก (ดู [`../../calendar-sync-app/README.md`](../../calendar-sync-app/README.md) §เหตุผลเรื่อง scope)

Copy-paste สำหรับช่อง scope justification (ต่อ scope):

```
This scope is used exclusively to create, update, and delete calendar
events that represent the user's own pharmacy duty shifts, on the
calendar the user has authorized. The app does not read the user's
existing calendar events, does not access other users' calendars, and
does not use this data for any purpose other than shift-reminder sync.
Events are only written for shifts the user is assigned to or has
accepted via the app's own shift-handoff workflow.
```

---

## 2.5 ⚠️ สำคัญที่สุด: ต้องแยก Calendar ออกจากแอปหลัก (ตรวจพบ restricted scope)

**ตรวจโค้ดจริงแล้วพบว่าแอปหลังบ้านใช้ scope ระดับ "restricted" (หนักสุด) อยู่ 2 ตัว:**

| scope | ระดับ | มาจากโค้ด | ใช้ทำอะไร |
|---|---|---|---|
| `https://mail.google.com/` (Gmail) | 🔴 **Restricted** | `GmailApp.search` ([`../../code.js`](../../code.js) บรรทัด ~114) | ดึงไฟล์ Excel ตารางเวรจากอีเมลอัตโนมัติ |
| `.../auth/drive` (Drive เต็ม) | 🔴 **Restricted** | `DriveApp.*` + `Drive.Files.*` (หลายไฟล์) | แปลง/เก็บไฟล์ Excel, JSON fallback |
| `.../auth/spreadsheets` | 🟠 Sensitive | `SpreadsheetApp`/`Sheets` | อ่าน/เขียนชีต |
| `.../auth/calendar.events` | 🟠 Sensitive | `Phase2C.js` (จะเพิ่ม) | เขียน event เวร |

**ทำไมเรื่องนี้เปลี่ยนทุกอย่าง:** scope ระดับ **Restricted** (Gmail/Drive) ถ้าจะ verify **ต้องผ่าน third-party security assessment (CASA)** ซึ่งเสียเงิน (หลักหมื่น–แสนบาท/ปี) + ต้องทำซ้ำทุกปี — ไม่คุ้มและไม่เหมาะกับแอปนี้

**กุญแจสำคัญ:** scope หนักพวกนี้ถูกใช้โดย **งานหลังบ้าน/แอดมิน** (ingest Excel, จัดการไฟล์) เท่านั้น ผู้ใช้ทั่วไปไม่ได้แตะ — ในโหมดปัจจุบัน ("ดำเนินการในฐานะเจ้าของ") มีเจ้าของคนเดียว authorize scope พวกนี้ ผู้ใช้ปลายทางไม่เคยเห็น consent เลย

**ดังนั้นสถาปัตยกรรมที่ถูกต้องคือ "แยกประตู":**

```
┌──────────────────────────────────────┐   ┌──────────────────────────────────┐
│ แอปหลัก (คงเดิม — ห้ามแตะ)              │   │ ประตู Calendar (ใหม่ แยกต่างหาก)    │
│ • Execute as: เจ้าของ (USER_DEPLOYING) │   │ • Execute as: ผู้ใช้ที่เข้าถึง       │
│ • ถือ restricted scope (Gmail/Drive)   │   │ • ขอแค่ calendar.events (sensitive) │
│ • ผู้ใช้ไม่เจอ consent เลย ✅           │   │ • verify ด้วยเอกสาร+วิดีโอ ไม่ต้อง CASA│
└──────────────────────────────────────┘   └──────────────────────────────────┘
```

**วิธี implement การแยก (เลือกตอนทำจริง — ไม่ใช่รอบเอกสารนี้):**
- **ตัวเลือก A:** สร้าง Apps Script **โปรเจกต์เล็กแยกอีกตัว** ที่มีแต่โค้ด Calendar (แตะแค่ `CalendarApp`) → scope ที่ Google เห็นจะเหลือแค่ `calendar.events` ตัวเดียว → verify ง่าย. แอปหลัก link มาที่ประตูนี้
- **ตัวเลือก B:** ใช้ Calendar REST API ผ่าน OAuth2 library ของ Apps Script โดยกำหนด scope เองให้เหลือแค่ `calendar.events` — คุมได้ละเอียดกว่าแต่โค้ดเยอะกว่า

> เหตุที่แยกโปรเจกต์ได้ผล: หน้า consent จะขอ scope = **ผลรวมของทุก scope ที่โปรเจกต์นั้นแตะ** ถ้า Calendar อยู่โปรเจกต์เดียวกับ Gmail/Drive → ผู้ใช้จะถูกขอทั้งก้อน แยกออกมาจึงเหลือแค่ calendar

---

## 3. ผู้ใช้: จำนวน / ประเภทบัญชี / User type

- **จำนวน:** ปัจจุบันใช้งานจริง ~300 คน (หน่วยงานเดียว) แผนขยายเป็น ~400 คน เมื่อครอบคลุมทั้งฝ่ายเภสัชกรรม (อ้างอิง [`../DESIGN_hospital_scale.md`](../DESIGN_hospital_scale.md) §1)
- **ประเภทบัญชี Google: ผสม** — ทั้งบัญชีองค์กร (Google Workspace ของโรงพยาบาล/มหาวิทยาลัย) และ Gmail ส่วนตัว
- **ผลต่อ OAuth consent screen:** เพราะมีทั้งบัญชีนอกองค์กรเดียวกัน (Gmail ส่วนตัว) ปะปนอยู่ **ต้องตั้ง User type = External** (จะใช้ Internal ไม่ได้ เพราะ Internal จำกัดเฉพาะบัญชีในองค์กร Workspace เดียวกันเท่านั้น) — External + sensitive scope + ผู้ใช้ >100 คน คือเงื่อนไขที่ทำให้ต้องผ่านกระบวนการ verification เต็มรูปแบบ (ไม่ใช่แค่ตั้งค่าแล้วใช้ได้เลย)

> **หมายเหตุสำหรับอนาคต:** ถ้าภายหลังต้องการงดกระบวนการ verification สำหรับผู้ใช้ที่เป็นบัญชีองค์กร สามารถพิจารณา domain-wide delegation ผ่านผู้ดูแล Google Workspace ของโรงพยาบาลได้ (เฉพาะกลุ่มบัญชีองค์กร) แต่กลุ่ม Gmail ส่วนตัวยังต้องผ่าน external OAuth consent อยู่ดี — ไม่ใช่ทางลัดที่แทนที่ verification ได้ทั้งหมด และต้องมี IT ของโรงพยาบาลเข้าร่วม (ดู open question ข้อ 2 ใน `../DESIGN_hospital_scale.md` §7) จึงไม่ใช่แนวทางที่ทำในรอบนี้

---

## 4. ข้อมูลที่จะเขียนลง Calendar Event

อ้างอิงโครงสร้างเวรจริงในระบบ (`code.js`, `Phase2C.js`) — field ที่จะปรากฏใน event:

| Field ในระบบ | ปรากฏใน Calendar เป็น |
|---|---|
| `date` / `timestamp` | วันที่ + เวลาเริ่ม-จบของ event |
| `range` ("HH:MM-HH:MM") | เวลาเริ่ม/จบของ event |
| `shift` (ประเภทเวร เช่น "เวรเช้า", "เวรรอบ 1") | ชื่อ event + สี event (ระบบมี mapping สีอยู่แล้วใน `Phase2C.js`) |
| `pos` / `room` (หน่วยงาน/ห้องที่ไปประจำ) | รายละเอียด (description) ของ event |

**ยืนยันชัดเจน:** ข้อมูลที่ sync เป็น**ข้อมูลตารางงานของพนักงาน (เวรของเภสัชกร) เท่านั้น ไม่ใช่ข้อมูลผู้ป่วย ไม่ใช่ข้อมูลสุขภาพ (PHI)** — ไม่มีชื่อ/HN/ข้อมูลทางการแพทย์ของผู้ป่วยเกี่ยวข้องกับฟีเจอร์นี้เลย ระบบทั้งระบบไม่ได้แตะข้อมูลผู้ป่วยอยู่แล้วตั้งแต่ต้น (เป็นระบบจัดเวรบุคลากร ไม่ใช่ระบบเวชระเบียน)

---

## 5. Data Flow

```
┌─────────────────────────┐
│ ผู้ใช้กดปุ่ม "เชื่อมต่อ      │
│ Google Calendar" ในแอป    │
└────────────┬─────────────┘
             ▼
┌─────────────────────────┐
│ Google OAuth consent      │   ← ผู้ใช้เห็นหน้าจอ Google เอง
│ (ขอ scope calendar.events)│     ยืนยัน/ปฏิเสธได้ตรงนี้
└────────────┬─────────────┘
             ▼
┌─────────────────────────┐      ┌───────────────────────────┐
│ Apps Script backend       │◀────▶│ Google Sheet                │
│ (Phase2C.js — มีอยู่แล้ว   │      │ User_Calendar_Sync           │
│  แต่ยังไม่ได้เดินสาย)      │      │ เก็บ mapping shift↔event_id  │
└────────────┬─────────────┘      └───────────────────────────┘
             ▼
┌─────────────────────────┐
│ ปฏิทิน Google ส่วนตัวของ   │
│ ผู้ใช้คนนั้น (เขียน event    │
│ เฉพาะของผู้ใช้คนนั้นเท่านั้น)│
└─────────────────────────┘
```

การ sync เป็นแบบ **push ทางเดียว** (แอป → ปฏิทินผู้ใช้) ระบบไม่อ่าน event อื่นที่มีอยู่ในปฏิทินผู้ใช้ก่อนหน้า และไม่ดึงข้อมูลอะไรจากปฏิทินกลับเข้าระบบ

---

## 6. มาตรการความปลอดภัย / PDPA

**ที่มีอยู่แล้วในระบบ** (อ้างอิง [`../DATA_MAP.md`](../DATA_MAP.md) §3-4):
- Audit log ทุก action สำคัญ (`PHX_AuditLog`)
- ข้อมูลอยู่ใน region `asia-southeast1`
- แนวคิด "compliance by design" ระบุไว้ใน design doc ของระบบแล้ว (`../DESIGN_hospital_scale.md` §3.1, §5)

**ที่ต้องเพิ่มเฉพาะฟีเจอร์นี้ (ก่อน ship จริง — ไม่ใช่แค่เอกสาร):**
- ปุ่ม/ทางเลือก "ยกเลิกการเชื่อมต่อ" (revoke) ที่**ลบ event ที่ระบบสร้างไว้ทั้งหมด**เมื่อผู้ใช้ถอนสิทธิ์ ไม่ปล่อยค้างในปฏิทินผู้ใช้
- บันทึก audit ว่าใคร connect/disconnect Calendar sync เมื่อไหร่ (ตาม pattern เดียวกับ audit log ที่มีอยู่แล้ว)
- Privacy policy ที่เข้าถึงได้จริงจาก URL สาธารณะ ระบุชัดเจนว่าเก็บอะไร ใช้ทำอะไร ลบยังไง (ดู [`privacy-policy.md`](privacy-policy.md))

**⚠️ จุดที่พบระหว่างสำรวจโค้ด ควรรู้ไว้ (ไม่ block การยื่นเอกสาร แต่มีผลตอน Google ถามรายละเอียดความปลอดภัยของระบบโดยรวม):** เอกสาร `../DATA_MAP.md` §3 บันทึกไว้ว่าระบบปัจจุบันมีจุดความปลอดภัยที่ยังไม่ปิด เช่น session ไม่หมดอายุอัตโนมัติ, ไม่มี Firebase security rules เก็บใน repo — ไม่เกี่ยวกับ Calendar API โดยตรง แต่ถ้า Google หรือทีมตรวจสอบภายในถามภาพรวมความปลอดภัยของระบบ ควรเตรียมคำตอบเรื่องนี้ไว้ด้วย

---

## 7. ข้อสังเกตทางเทคนิคที่ต้องแก้ก่อน ship ฟีเจอร์จริง

*(สรุปสั้น — ไม่ใช่ implementation plan รอบนี้ แค่บันทึกไว้ให้รู้ว่า "ยื่นเอกสารผ่าน" ≠ "ใช้งานได้ทันที")*

1. **Deployment mode = ต้นตอของหน้าจอ "Unverified" ที่ User กลัว (ยืนยันแล้ว 13 ก.ค. 2569):** [`appsscript.json`](../../appsscript.json) ในโค้ดยังตั้ง `"executeAs": "USER_DEPLOYING"` + `"access": "ANYONE_ANONYMOUS"` แต่ Klui ทดลองตั้งใน Apps Script UI เป็น **"ดำเนินการในฐานะ: ผู้ใช้ที่เข้าถึงเว็บแอปนี้"** + **"ทุกคนที่มีบัญชี Google"** ซึ่งเป็นค่าที่ `Phase2C.js` ต้องการ (เพื่อให้ `CalendarApp.getDefaultCalendar()` คืนปฏิทินของผู้ใช้แต่ละคนจริง)

   **กลไกที่ทำให้เกิดหน้าจอน่ากลัว:** โหมด "ผู้ใช้ที่เข้าถึง" บังคับให้ผู้ใช้**ทุกคน**ต้อง authorize scope ของสคริปต์ด้วยบัญชีตัวเอง (ต่างจากโหมดเดิม "ผู้ใช้ที่ deploy" ที่มีเจ้าของคนเดียว authorize แล้วจบ ผู้ใช้ปลายทางไม่เคยเห็น auth prompt เลย) — เมื่อ + สคริปต์ยังผูกกับ **default GCP project** ที่ verify ไม่ได้ → ผู้ใช้ทุกคนจึงเจอหน้าจอ "แอปนี้ยังไม่ได้รับการยืนยัน" นี่คือเหตุผลที่การ switch ไป standard GCP project แล้ว verify (checklist ข้อ 1-6) คือทางแก้ที่ตรงจุด ไม่ใช่ทางอ้อม

   **⚠️ ผลกระทบที่ต้องตัดสินใจก่อนทำจริง (แก้ไข 13 ก.ค. — กลับคำแนะนำเดิมหลังตรวจ scope จริง):** ห้ามเปลี่ยน "ทั้งแอป" เป็นโหมดนี้ เพราะแอปหลังบ้านใช้ **restricted scope** อยู่ (ดู §2.5) — ถ้าเปลี่ยนทั้งแอป ผู้ใช้ทุกคนจะถูกขอสิทธิ์อ่าน Gmail/จัดการ Drive (ยิ่งน่ากลัว) และบังคับให้ต้องผ่าน CASA security assessment (แพง/นาน) 2 เส้นทาง:
   - **(1) แยก Calendar เป็นประตู/โปรเจกต์ต่างหากที่ขอแค่ `calendar.events`** — แอปหลักคงเดิม (ไม่มีใครเจอหน้าจอ) เฉพาะคนกดใช้ Calendar เท่านั้นที่ผ่าน Google auth ระดับ sensitive (verify ด้วยเอกสาร+วิดีโอ ไม่ต้อง CASA) → **แนะนำเส้นทางนี้**
   - **(2) เปลี่ยนทั้งแอป + verify** — ❌ **ไม่แนะนำ** เพราะลาก restricted scope (Gmail/Drive) เข้ามาในหน้า consent ของผู้ใช้ → ต้อง CASA + ผู้ใช้ตกใจหนักกว่าเดิม

   ⚠️ ตอน implement จริงต้องแก้ `appsscript.json` ในโค้ดให้ตรงกับ UI ด้วย (ตอนนี้ค่าใน repo กับที่ตั้งใน UI ยัง**ไม่ตรงกัน** — clasp push ครั้งถัดไปอาจ reset deployment กลับเป็น anonymous ได้)
2. **การผูก email:** ระบบ auth ปัจจุบัน (`Phase_Z_B1_Auth.js`) คือชื่อ+รหัสผ่าน ไม่ผูกกับบัญชี Google เลย ขณะที่ `Phase2C.js` คาดหวัง `email` เป็น key หลักในตาราง sync — ต้องมีขั้นตอนให้ผู้ใช้ "เชื่อมบัญชี Google" แยกจาก login เดิมของแอป
3. **`oauthScopes` ใน `appsscript.json`:** ต้องประกาศ `calendar.events` scope อย่างชัดเจน (ปัจจุบันไม่มี array นี้เลย — Apps Script จะเติมให้อัตโนมัติตอน push ถ้าโค้ดเรียก `CalendarApp` แต่ควรประกาศเองให้ชัดเจนกว่าปล่อยให้เดา)

---

## อ้างอิงในโค้ด

- Prototype ที่มีอยู่แล้ว (ยังไม่เดินสาย): [`../../Phase2C.js`](../../Phase2C.js)
- Deployment manifest ปัจจุบัน: [`../../appsscript.json`](../../appsscript.json)
- Auth ปัจจุบัน: `Phase_Z_B1_Auth.js`
- Data map ฉบับเต็ม: [`../DATA_MAP.md`](../DATA_MAP.md) §2.6 "Calendar sync map"
- แผนสเกลระดับโรงพยาบาล: [`../DESIGN_hospital_scale.md`](../DESIGN_hospital_scale.md)
