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

**scope เพิ่มสำหรับ auto-sync (ไฮบริดส่วน background trigger):**

| scope | ระดับ | ใช้ทำอะไร |
|---|---|---|
| `script.external_request` | sensitive | `UrlFetchApp` อ่านเวรล่าสุดจาก Firebase feed (ตอน trigger ทำงานเบื้องหลัง) |
| `script.scriptapp` | ไม่ sensitive | สร้าง/ลบ time trigger ของผู้ใช้เอง (`ScriptApp.newTrigger`) |

> ทั้งคู่**ไม่ใช่ restricted → ไม่กระทบเรื่อง CASA** แต่ทำให้หน้า consent มี item เพิ่ม ต้องเขียน justification ให้ครบ (ดู [`../docs/google-calendar-api/oauth-verification-summary.md`](../docs/google-calendar-api/oauth-verification-summary.md) §2). ถ้าต้องการหน้า consent สั้นที่สุด และรับได้ว่า "ซิงค์เฉพาะตอนเปิดแอป" ให้ตัด 2 scope นี้ออก + ไม่ใช้ auto-sync (เหลือแค่ instant-when-online)

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
      // ประตูพร้อม → ส่งเวร + ชื่อผู้ใช้ในแอปหลัก (appName ใช้เป็น key ของ auto-sync feed)
      win.postMessage({ type: 'RXSHIFT_CAL_SYNC',
        payload: { monthValue: monthValue, shifts: effectiveShifts,
                   appName: phxAuthGetUser().name } }, '*');
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

> **จุดที่ต้องทดสอบจริง:** การ `postMessage` ข้ามหน้าต่างของ Apps Script อยู่ใน sandbox iframe (origin เป็น `*.googleusercontent.com`) พฤติกรรมอาจต่างกันตาม browser — โค้ดนี้ใช้ `targetOrigin: '*'` เพื่อให้เริ่มทำงานได้ก่อน ตอนทดสอบจริงให้ดู origin ที่ได้จริงแล้วค่อยล็อกให้แคบลงถ้าต้องการ

---

## auto-sync (ไฮบริด real-time) — ทำงานยังไง

เป้าหมาย: **ไวที่สุดที่เป็นไปได้** โดยไม่ต้องพึ่ง IT โรงพยาบาล = 2 กลไกทำงานคู่กัน

**กลไก 1 — instant ตอนออนไลน์ (เขียนปฏิทินคนที่กำลังเปิดแอป):**
- แอปหลักฝัง `connect.html` เป็น **iframe ซ่อน** (หลังผู้ใช้ authorize ครั้งแรก) แล้ว `postMessage` ส่ง `effectiveShifts` เข้าไป**ทุกครั้งที่เวรเปลี่ยน** → ซิงค์เงียบ ๆ ภายในวินาที (ไม่มี popup เด้ง)
- ครอบคลุมเคสหลัก: คุณยก/แลกเวร → ปฏิทินคุณอัปเดตทันที; คนรับที่เปิดแอปอยู่ก็อัปเดตทันที

**กลไก 2 — เก็บตกตอนออฟไลน์ (background trigger):**
- ผู้ใช้กด "⚡ อัปเดตอัตโนมัติ" ครั้งเดียว → `installAutoSync()` ติดตั้ง time trigger ในบัญชีผู้ใช้เอง รันทุก ~5 นาที **แม้ปิดแอป**
- trigger อ่าน "เวรล่าสุดของฉัน" จาก **Firebase feed** ที่แอปหลักเขียนไว้ แล้วซิงค์
- floor ของความไวเคสออฟไลน์ = ช่วง interval (~5 นาที) — เร็วกว่านี้ต้อง domain-wide delegation (ดู [`../docs/google-calendar-api/oauth-verification-summary.md`](../docs/google-calendar-api/oauth-verification-summary.md))

### สัญญา (contract) ของ Firebase feed — แอปหลักต้องทำ

แอปหลักเขียน node นี้ **ทุกครั้งที่เวรของผู้ใช้เปลี่ยน** (publish ยก/แลก/แก้):

```
<FIREBASE_BASE>/calFeed/<encAppName>/<monthValue> = {
  shifts: [ {date, timestamp, range, name, pos, shift, room}, ... ],  // เวรหลัง overlay
  updatedAt: <ms>
}
```

- `encAppName` = ชื่อผู้ใช้ในแอปหลัก ผ่าน encoder เดียวกับ `_encName()` ใน `Code.js` (แทน `. $ # [ ] / ช่องว่าง` ด้วย `_`) — **ต้องตรงกันเป๊ะ** ไม่งั้น trigger หา node ไม่เจอ
- ต้องตั้งค่า `FIREBASE_BASE` ใน `Code.js` (บนสุด) เป็น URL ของ RTDB ตัวเดียวกับแอปหลัก
- feed อ่านอย่างเดียว (public read พอ) — trigger ไม่เขียนกลับ

### สิ่งที่แอปหลักต้องเพิ่ม (สรุป — เป็นงานสเต็ปถัดไป)
1. หลัง authorize ครั้งแรก: ฝัง iframe ซ่อนของ `connect.html`
2. ทุกครั้งเวรเปลี่ยน: (ก) `postMessage` เข้า iframe (instant) **และ** (ข) เขียน `calFeed/<encAppName>/<monthValue>` บน Firebase (ให้ trigger เก็บตก)
3. ส่ง `appName` ไปกับ payload (แล้ว `connect.html` เรียก `setAppName` ให้อัตโนมัติ)

---

## วิธีถอนสิทธิ์ (Revoke) — มี 2 ชั้น

**ชั้นที่ 1 — ในแอป (ปุ่ม "ยกเลิกการเชื่อมต่อ" ใน `connect.html`)**
เรียก `disconnectAndRevoke()` ซึ่งทำ 4 อย่างตามลำดับ:
1. **หยุด auto-sync trigger** (`removeAutoSync`) — สำคัญ! ไม่งั้น trigger จะรันต่อแล้วสร้าง event กลับมาหลังลบ
2. **ลบ event เวรที่แอปสร้างไว้ทุกเดือน** ออกจากปฏิทินผู้ใช้ (ไม่ทิ้งขยะค้าง)
3. **ล้าง property ทั้งหมด** ใน `UserProperties` (mapping + ปฏิทินปลายทาง + appName + สถานะ auto)
4. **`ScriptApp.invalidateAuth()`** — เพิกถอน OAuth grant ของสคริปต์ ครั้งหน้าผู้ใช้จะเจอหน้า consent ใหม่ถ้าจะใช้อีก

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

- [ ] ใส่ scriptId จริง + push + deploy ตาม checklist + ตั้ง `FIREBASE_BASE` ใน `Code.js`
- [ ] **แอปหลัก (`Index.html`):** (ก) ฝัง iframe ซ่อนของ `connect.html` + `postMessage` ตอนเวรเปลี่ยน (instant); (ข) เขียน `calFeed/<encAppName>/<monthValue>` บน Firebase ตอนเวรเปลี่ยน (auto-sync เก็บตก); (ค) ส่ง `appName` ไปกับ payload
- [ ] ทดสอบ end-to-end (สร้าง event จริง → แก้ → ลบ → เปิด auto-sync → ถอนสิทธิ์)
- [ ] อัดวิดีโอสาธิตตาม [`../docs/google-calendar-api/demo-video-script.md`](../docs/google-calendar-api/demo-video-script.md)
- [ ] ยื่น verification ตาม [`../docs/google-calendar-api/submission-checklist.md`](../docs/google-calendar-api/submission-checklist.md)
