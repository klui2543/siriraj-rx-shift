# วิธีทดสอบ calendar-sync-app (ทีละขั้นสำหรับ Klui)

เป้าหมาย: ยืนยันว่าวงจร **ยินยอม → สร้าง event ในปฏิทิน → ถอนสิทธิ์ (event หาย)** ทำงานจริง

> 💡 **ข่าวดี:** ตอนทดสอบ "เป็นตัวเอง" (เจ้าของสคริปต์) **ไม่ต้องสร้าง GCP project ใหม่ ไม่ต้อง verify** — จะเจอหน้า "Unverified" แต่กดผ่านเองได้ (เจ้าของสคริปต์ทำได้เสมอ) เรื่อง verify ค่อยทำตอนจะเปิดให้คนอื่นใช้จริง
>
> ⚠️ **ข้อจำกัดตอนยังไม่ verify (โหมด Testing):** (1) เพิ่ม Test users ได้สูงสุด **100 คน**; (2) การอนุญาต (auth) **หมดอายุทุก ~7 วัน** — กดซิงค์เอง/instant ไม่กระทบ (เปิดแอปก็ต่ออายุ) แต่ **background trigger (auto-sync แม้ปิดแอป) จะสะดุดทุก 7 วัน** จนกว่าจะเปิดแอป grant ใหม่ · ทั้งหมดนี้หายเมื่อ verify ผ่าน
>
> ⚡ **TIP เทสเร็ว — ใช้ `/dev` แทน `/exec`:** `/dev` = โค้ดล่าสุดในเว็บ editor เสมอ (Deploy → **Test deployments** → Web app `/dev`) เปิดได้เฉพาะเจ้าของ. loop เทส = วางโค้ด → **Ctrl+S** → reload `/dev` → เห็นของใหม่เลย **ไม่ต้อง Deploy → New version ทุกครั้ง**. ใช้ได้ทั้ง 2 แอป (เห็นแค่คุณ ไม่กระทบ User). ตอนปล่อยจริง 400 คนค่อยใช้ `/exec` (New version). หมายเหตุ: ถ้าเทสปุ่มซิงค์จากแอปหลักพร้อมแก้เคาน์เตอร์ผ่าน `/dev` ให้ชี้ `RX_CAL_WEBAPP_URL` ไป `/dev` ของเคาน์เตอร์ชั่วคราว

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

> 💡 **อยากให้ลงปฏิทินย่อย (แยกจากปฏิทินส่วนตัว)?** ในหน้า connect มีช่อง **"บันทึกเวรลงปฏิทิน"** — เลือกปฏิทินย่อยที่มีอยู่ หรือกด **➕ สร้างปฏิทินแยกเฉพาะเวร** (จะสร้าง "Siriraj Rx Shifts" ให้) แล้วค่อยกดซิงค์ · **เลือกก่อนซิงค์ครั้งแรก** จะสะอาดสุด (ถ้าเปลี่ยนทีหลัง ระบบจะลบ event เดิมจากปฏิทินเก่าให้อัตโนมัติ กันซ้ำ)

---

### 🟡 เฟส 2 — เชื่อมกับแอปหลัก (ทดสอบด้วยเวรจริง)

✅ **wire แล้วในโค้ด** — เพิ่มปุ่ม **"ซิงค์เข้า Google Calendar"** ในแท็บ **ฉัน** ของ `Index.html` (ฟังก์ชัน `phxSyncGoogleCalendar`) แบบกดซิงค์เอง (popup + postMessage ส่งเวรจริงหลัง overlay ของเดือนที่เลือก)

**เหลือแค่ 3 สเต็ปให้ลองจริง:**
1. **ตั้งค่า URL:** ใน `Index.html` แก้ `RX_CAL_WEBAPP_URL = '<<PUT_CALENDAR_WEBAPP_EXEC_URL>>'` → ใส่ **/exec URL ของ calendar-sync-app** ที่ deploy ไว้ (จากเฟส 1)
2. **Deploy `Index.html` เวอร์ชันใหม่** (GAS ต้องสร้าง deployment version ใหม่ ไม่ใช่แค่ save ถึงจะขึ้น /exec)
3. เปิดแอปหลัก → เลือกเดือน + login/เลือกชื่อ → แท็บ **ฉัน** → **ซิงค์เข้า Google Calendar** → popup เด้ง → (ครั้งแรก) เลือกปฏิทินย่อย + กด Allow → เวร**จริง**เดือนนั้นเข้าปฏิทิน

**ทดสอบต่อ:** ยก/แลกเวรในแอป → กดซิงค์อีกครั้ง → event ควรอัปเดต/ลบตาม (ระบบ diff ให้)

**จุดเสี่ยงที่ต้องเช็ค:** `postMessage` ข้าม sandbox iframe อาจไม่ผ่านใน browser บางตัว — ถ้า popup เด้ง กด Allow แล้วแต่ event ไม่เข้า/แอปไม่ขึ้น toast ผล ให้เปิด DevTools (F12) → Console ทั้ง 2 หน้าต่าง (แอปหลัก + popup) ดู error แล้วบอกผม · หมายเหตุ: v1 ซิงค์**เดือนที่เลือกอยู่**ทีละเดือน (rawData ถือเดือนเดียว) — เปลี่ยนเดือนแล้วกดซิงค์ซ้ำสำหรับเดือนอื่น

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
