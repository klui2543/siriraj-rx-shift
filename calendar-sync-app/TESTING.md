# วิธีทดสอบ calendar-sync-app (ทีละขั้นสำหรับ Klui)

เป้าหมาย: ยืนยันว่าวงจร **ยินยอม → สร้าง event ในปฏิทิน → ถอนสิทธิ์ (event หาย)** ทำงานจริง

> 💡 **ข่าวดี:** ตอนทดสอบ "เป็นตัวเอง" (เจ้าของสคริปต์) **ไม่ต้องสร้าง GCP project ใหม่ ไม่ต้อง verify** — จะเจอหน้า "Unverified" แต่กดผ่านเองได้ (เจ้าของสคริปต์ทำได้เสมอ) เรื่อง verify ค่อยทำตอนจะเปิดให้คนอื่นใช้จริง

---

## ขั้นตอนแบ่งเป็น 3 เฟส

### 🟢 เฟส 1 — ทดสอบโปรเจกต์ Calendar เดี่ยวๆ (ยังไม่แตะแอปหลัก)

**A. เอาโค้ดขึ้น Apps Script** — เลือกวิธีใดวิธีหนึ่ง:

*วิธีง่าย (แนะนำครั้งแรก) — copy-paste ในเว็บ:*
1. เปิด [script.new](https://script.new) → ได้โปรเจกต์เปล่าใหม่ ตั้งชื่อ เช่น `siriraj-calendar-sync`
2. ลบไฟล์ `Code.gs` ที่มีมาให้ → วางเนื้อหาจาก [`Code.js`](Code.js) แทน
3. กด **+ → HTML** ตั้งชื่อไฟล์ว่า **`connect`** (ตรงเป๊ะ ไม่ต้องใส่ .html) → วางเนื้อหาจาก [`connect.html`](connect.html)
4. เปิดเมนู ⚙️ **Project Settings** → ติ๊ก **"Show appsscript.json manifest file"**
5. กลับมาที่ editor → เปิดไฟล์ `appsscript.json` → วางเนื้อหาจาก [`appsscript.json`](appsscript.json) ทับ (สำคัญ! ตรงนี้คือที่ล็อก scope)

*วิธี clasp (ถ้าถนัด):*
1. `cp .clasp.json.example .clasp.json` → ใส่ scriptId ของโปรเจกต์ใหม่
2. `clasp push` **จากในโฟลเดอร์ `calendar-sync-app/`**

**B. Deploy เป็น Web app:**
1. กด **Deploy → New deployment** → เลือกชนิด **Web app**
2. ตั้งค่า: Execute as = **Me (เจ้าของ)** *(สำหรับเทสตัวเองพอ; ตอนเปิดจริงค่อยเปลี่ยนเป็น "User accessing")*
   > จริงๆ ถ้าจะเทสให้เหมือนของจริง ตั้ง **"User accessing"** เลยก็ได้ — ผลลัพธ์การเทสตัวเองเหมือนกัน เพราะคุณคือ user ที่เข้าถึง
3. Who has access = **Anyone with a Google account**
4. กด Deploy → คัดลอก **Web app URL** (`.../exec`)

**C. ทดสอบวงจร:**
1. เปิด Web app URL ในเบราว์เซอร์
2. เจอหน้า **"This app isn't verified"** → กด **Advanced** → **Go to … (unsafe)** *(ปกติ เพราะยังไม่ verify — คุณคือเจ้าของ กดผ่านได้)*
3. หน้า **Review permissions** ขึ้น → กด **Allow** (อนุญาตปฏิทิน)
4. หน้า `connect.html` โหลด → ควรเห็นอีเมล + ชื่อปฏิทินของคุณ
5. กดปุ่ม **🧪 ทดสอบ: สร้าง event ตัวอย่าง (พรุ่งนี้)**
6. เปิด [Google Calendar](https://calendar.google.com) → ดู**วันพรุ่งนี้** → ควรเห็น event **"เวรเช้า ทดสอบ" 08:00–16:00** ✅
7. กลับมาหน้าเดิม กด **ยกเลิกการเชื่อมต่อ (ถอนสิทธิ์)** → ยืนยัน
8. กลับไปดูปฏิทิน → event ตัวอย่าง**ควรหายไป** ✅

**ผ่านเฟส 1 = กลไก Calendar ใช้ได้จริง** (สร้าง/ลบ event + ถอนสิทธิ์ครบ)

---

### 🟡 เฟส 2 — เชื่อมกับแอปหลัก (ทดสอบด้วยเวรจริง)

*(ทำหลังเฟส 1 ผ่าน — ต้องแก้ `Index.html` ของแอปหลัก ให้ผมช่วย wire ได้)*

1. ใส่ปุ่ม "ซิงค์ปฏิทิน" ในแอปหลัก + โค้ด `postMessage` (สนิปเป็ตใน [`README.md`](README.md) §การเชื่อมกับแอปหลัก)
2. เปิดแอปหลัก → login → กดปุ่มซิงค์ → popup `connect.html` เด้ง
3. กด Allow → เวร**จริง**ของคุณเดือนนั้นควรไปโผล่ในปฏิทิน
4. ลองแก้เวร (ยก/แลก) ในแอปหลัก → ซิงค์อีกครั้ง → event ในปฏิทินควรอัปเดตตาม
5. **จุดเสี่ยงที่ต้องเช็ค:** `postMessage` ข้าม sandbox iframe อาจไม่ผ่านใน browser บางตัว — ถ้า popup เด้งแต่ event ไม่ถูกสร้าง ให้เปิด DevTools (F12) → Console ดู error แล้วบอกผม

**ทดสอบ auto-sync (background trigger):**
1. ตั้งค่า `FIREBASE_BASE` ใน `Code.js` เป็น URL ของ RTDB ตัวเดียวกับแอปหลัก
2. ให้แอปหลักเขียน feed `calFeed/<encAppName>/<monthValue>` (ดู README §สัญญา feed) — หรือทดสอบก่อนด้วยการเขียน node นี้ในมือผ่าน Firebase console
3. ในหน้า connect: กด **⚡ อัปเดตอัตโนมัติ** (ต้องมี `appName` แล้ว — มาจาก handshake แอปหลัก)
4. ทดสอบเร็ว: ใน Apps Script editor รันฟังก์ชัน `autoSyncTickManual()` ด้วยมือ → ดูว่าอ่าน feed แล้วสร้าง/แก้ event ตาม
5. ตรวจว่า trigger ถูกติดตั้ง: editor → ⏰ Triggers → ควรเห็น `_autoSyncTick` ทุก 5 นาที
6. กด "ยกเลิกการเชื่อมต่อ" → trigger ควรหายไปจากรายการ (ไม่งั้นมันจะสร้าง event กลับมา)

---

### 🔵 เฟส 3 — เปิดให้คนอื่นใช้จริง (ตอนนี้ค่อยยุ่งกับ verify)

1. Revert deployment แอปหลักกลับ "user deploying" (ถ้ายังตั้ง "user accessing" ค้างไว้)
2. ย้าย calendar-sync-app ไปผูก **standard GCP project** → ตั้ง OAuth consent + submit verification ตาม [`../docs/google-calendar-api/submission-checklist.md`](../docs/google-calendar-api/submission-checklist.md)
3. ระหว่างรอ verify: ใส่กลุ่มนำร่อง ≤100 คนเป็น **Test users** (คนกลุ่มนี้ไม่ต้องกด "Advanced" แบบตอนเทส)
4. ผ่าน verify → หน้า Unverified หายถาวร รองรับครบ 400 คน

---

## สรุปสั้นสุด: ถ้าจะเห็นมันทำงานวันนี้เลย

ทำแค่ **เฟส 1 (A วิธี copy-paste → B → C)** — ประมาณ 10-15 นาที ไม่ต้อง verify ไม่ต้องแตะแอปหลัก แล้วคุณจะเห็น event เด้งเข้าปฏิทินจริง + ทดสอบปุ่มถอนสิทธิ์ได้ครบ
