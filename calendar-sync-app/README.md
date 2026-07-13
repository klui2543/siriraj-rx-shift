# calendar-sync-app — โปรเจกต์ Calendar แยก (ประตูเล็ก)

โปรเจกต์ Apps Script **แยกต่างหากจากแอปหลัก** ทำหน้าที่เดียว: ซิงค์เวรของผู้ใช้เข้า Google Calendar ส่วนตัวของเขาเอง โดยขอ scope จากผู้ใช้แค่ **ปฏิทิน + อีเมล** เท่านั้น

**ทำไมต้องแยก:** แอปหลักถือ restricted scope (อ่าน Gmail / จัดการ Drive) ถ้าเอา Calendar ไปรวม ผู้ใช้ทุกคนจะถูกขอสิทธิ์หนักพวกนั้น + ต้องผ่าน CASA security assessment (แพง/รายปี) — แยกออกมาแล้ว scope ที่ผู้ใช้เห็นเหลือแค่ปฏิทิน ทำให้ verify แบบ sensitive ได้ (ไม่ต้อง CASA) เหตุผลเต็มดูที่ [`../docs/google-calendar-api/oauth-verification-summary.md`](../docs/google-calendar-api/oauth-verification-summary.md) §2.5

---

## ไฟล์ในโปรเจกต์นี้

| ไฟล์ | หน้าที่ |
|---|---|
| `appsscript.json` | manifest — **ล็อก `oauthScopes` ไว้แค่ `calendar` + `userinfo.email`** + deploy เป็น "User accessing" |
| `Code.js` | logic ทั้งหมด: sync, สถานะ, ถอนสิทธิ์, เลือกปฏิทิน — แตะแค่ `CalendarApp` / `Session` / `PropertiesService` |
| `connect.html` | หน้าที่ผู้ใช้เปิด: โหลดสถานะ (จุดที่ Google ถามยินยอม), ปุ่มซิงค์, ปุ่มถอนสิทธิ์ |
| `.clasp.json.example` | เทมเพลต — คัดลอกเป็น `.clasp.json` แล้วใส่ scriptId ใหม่ |

> ⚠️ โฟลเดอร์นี้ถูกกันไว้ใน `../.claspignore` (`calendar-sync-app/**`) เพื่อไม่ให้ clasp ของแอปหลักดูดเข้าไป — push โปรเจกต์นี้**จากในโฟลเดอร์นี้เอง**ด้วย clasp คนละตัว

---

## เหตุผลเรื่อง scope (สำคัญ)

- ใช้ **`CalendarApp`** (สร้าง/แก้/ลบ event + เลือกปฏิทิน) → ต้องใช้ scope **`calendar`** (เต็ม) ไม่ใช่ `calendar.events` ที่แคบกว่า เพราะ `CalendarApp` เมธอดจัดการปฏิทิน (เช่น `getAllCalendars`, `createCalendar`) ต้องการ scope เต็ม
- **ทั้ง `calendar` และ `calendar.events` เป็นระดับ "sensitive" เหมือนกัน — ไม่ต้อง CASA ทั้งคู่** จุดที่แยก Calendar ออกจาก Gmail/Drive คือสิ่งที่ตัด CASA ออกไป ไม่ใช่การเลือก calendar vs calendar.events
- ถ้าผู้รีวิว Google ขอให้แคบลงเป็น `calendar.events` จริงๆ ค่อยเปลี่ยนไปใช้ **Advanced Calendar Service** (`Calendar.Events.insert/...`) แทน `CalendarApp` แล้วตัดฟีเจอร์ "เลือก/สร้างปฏิทิน" ออก — เป็นงานเพิ่ม แต่โครงหลัก (diff/fingerprint/reminder) ใช้ซ้ำได้

---

## วิธี deploy (ครั้งแรก)

1. สร้าง **Apps Script project ใหม่** (คนละตัวกับแอปหลัก) ที่ [script.new](https://script.new) — จำ scriptId ไว้
2. ในเครื่อง: `cp .clasp.json.example .clasp.json` แล้วใส่ scriptId ใหม่
3. `clasp push` **จากในโฟลเดอร์ `calendar-sync-app/`** (ไฟล์จะขึ้นโปรเจกต์ Calendar ตัวใหม่ ไม่ปนแอปหลัก)
4. ผูกโปรเจกต์นี้กับ **standard GCP project** (ไม่ใช่ default) — ดู [`../docs/google-calendar-api/submission-checklist.md`](../docs/google-calendar-api/submission-checklist.md) ข้อ 1-2
5. Deploy → **New deployment → Web app**
   - Execute as: **User accessing the web app**
   - Who has access: **Anyone with a Google account**
6. คัดลอก **web app URL** (`.../exec`) ไปใส่ในแอปหลัก (ดูหัวข้อถัดไป)

---

## การเชื่อมกับแอปหลัก (handoff)

แอปหลักเปิดหน้า `connect.html` เป็น popup แล้วส่ง "เวรของผู้ใช้คนนี้ (หลัง overlay)" เข้ามาทาง `postMessage` — โปรเจกต์นี้ **ไม่อ่านชีตเอง** จึงไม่ต้องมี scope Sheet/Drive

**โค้ดฝั่งแอปหลัก** (ใส่ใน `Index.html` ตรงปุ่ม "เชื่อมต่อ/ซิงค์ปฏิทิน"):

```js
var CAL_WEBAPP_URL = 'https://script.google.com/macros/s/XXXXX/exec'; // URL จากข้อ 6

function openCalendarSync(monthValue, effectiveShifts) {
  var win = window.open(CAL_WEBAPP_URL, 'rxshift_cal', 'width=480,height=560');

  function onMsg(e) {
    var d = e.data || {};
    if (d.type === 'RXSHIFT_CAL_READY') {
      // ประตูพร้อม → ส่งเวรเข้าไป
      win.postMessage({ type: 'RXSHIFT_CAL_SYNC',
        payload: { monthValue: monthValue, shifts: effectiveShifts } }, '*');
    }
    if (d.type === 'RXSHIFT_CAL_RESULT') {
      console.log('ผลซิงค์:', d.data);        // แสดง toast/สถานะตามต้องการ
      window.removeEventListener('message', onMsg);
    }
  }
  window.addEventListener('message', onMsg);
}
```

- `effectiveShifts` = เวรของผู้ใช้หลัง apply overlay แล้ว (แอปหลักคำนวณอยู่แล้ว — เวรที่ผู้ใช้ "ถือจริง" ในเดือนนั้น) แต่ละ shift = `{ date, timestamp, range, name, pos, shift, room }`
- `monthValue` = ค่าเดือน (ใช้เป็น key เก็บ sync map ต่อเดือน)

> **จุดที่ต้องทดสอบจริง:** การ `postMessage` ข้ามหน้าต่างของ Apps Script อยู่ใน sandbox iframe (origin เป็น `*.googleusercontent.com`) พฤติกรรมอาจต่างกันตาม browser — โค้ดนี้ใช้ `targetOrigin: '*'` เพื่อให้เริ่มทำงานได้ก่อน ตอนทดสอบจริงให้ดู origin ที่ได้จริงแล้วค่อยล็อกให้แคบลงถ้าต้องการ ถ้า postMessage มีปัญหา ทางเลือกสำรองคือส่ง `effectiveShifts` ผ่าน relay (เช่นเขียน temp node บน Firebase แล้วส่ง token ทาง URL — แต่จะเพิ่ม scope `script.external_request`)

---

## วิธีถอนสิทธิ์ (Revoke) — มี 2 ชั้น

**ชั้นที่ 1 — ในแอป (ปุ่ม "ยกเลิกการเชื่อมต่อ" ใน `connect.html`)**
เรียก `disconnectAndRevoke()` ซึ่งทำ 3 อย่างตามลำดับ:
1. **ลบ event เวรที่แอปสร้างไว้ทุกเดือน** ออกจากปฏิทินผู้ใช้ (ไม่ทิ้งขยะค้าง)
2. **ล้าง mapping ทั้งหมด** ใน `UserProperties` (รวมปฏิทินปลายทางที่เลือกไว้)
3. **`ScriptApp.invalidateAuth()`** — เพิกถอน OAuth grant ของสคริปต์ ครั้งหน้าผู้ใช้จะเจอหน้า consent ใหม่ถ้าจะใช้อีก

> มี `unsyncMonth(monthValue)` ด้วย ถ้าต้องการลบเฉพาะเดือนเดียวโดยไม่ถอนสิทธิ์ทั้งหมด

**ชั้นที่ 2 — ฝั่ง Google (ผู้ใช้ทำเองได้เสมอ)**
ผู้ใช้ไปที่ [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → เลือกแอป → **Remove access**
- ⚠️ วิธีนี้ Google ตัดสิทธิ์ทันที **แต่ event ที่สร้างไว้แล้วจะยังค้างในปฏิทิน** (เพราะแอปเข้าไปลบให้ไม่ได้อีก) — จึงควรแนะนำผู้ใช้กด "ยกเลิกการเชื่อมต่อ" ในแอป (ชั้นที่ 1) ก่อน แล้วค่อยถอนที่ Google account ถ้าต้องการ

ทั้งหมดนี้ระบุไว้ใน [`../docs/google-calendar-api/privacy-policy.md`](../docs/google-calendar-api/privacy-policy.md) §6 แล้ว

---

## สิ่งที่ตัดออกจาก `Phase2C.js` เดิม (และย้ายไปไหน)

| ของเดิมใน Phase2C.js | สถานะในโปรเจกต์นี้ | เหตุผล |
|---|---|---|
| `_p2c_getSyncSheet` + sync map ในชีต | → เก็บใน `PropertiesService` (per-user) | เลี่ยง scope Sheets |
| `getScheduleData` (อ่านชีตหาเวร) | → รับ `effectiveShifts` จากแอปหลักแทน | เลี่ยง scope Sheets + ได้เวรหลัง overlay ที่ถูกต้อง |
| `getUserBinding`/`_p2b_validateEmail` (Phase2B) | → ใช้ `Session.getEffectiveUser().getEmail()` ตรงๆ | ผู้ใช้ที่ล็อกอิน = เจ้าของปฏิทิน ไม่ต้อง lookup ชีต |
| `sendUrgentSwapNotification` (MailApp + People sheet) | ❌ **ไม่ย้ายมา** — คงไว้ที่แอปหลัก | อีเมลด่วนใช้ scope Gmail/ชีต ควรอยู่ฝั่งแอปหลัก (deployer-auth) |
| `p2cGet/SetTargetCalendar` (เก็บในชีต col H) | → เก็บใน `PropertiesService` | เลี่ยง scope Sheets |

---

## ยังไม่ได้ทำ (ต่อจากโครงนี้)

- [ ] ใส่ scriptId จริง + push + deploy ตาม checklist
- [ ] wire ปุ่มในแอปหลัก (`Index.html`) ด้วยสนิปเป็ตข้างบน + ทดสอบ postMessage จริง
- [ ] ทดสอบ end-to-end กับบัญชีทดสอบ (สร้าง event จริง → แก้ → ลบ → ถอนสิทธิ์)
- [ ] อัดวิดีโอสาธิตตาม [`../docs/google-calendar-api/demo-video-script.md`](../docs/google-calendar-api/demo-video-script.md)
- [ ] ยื่น verification ตาม [`../docs/google-calendar-api/submission-checklist.md`](../docs/google-calendar-api/submission-checklist.md)
