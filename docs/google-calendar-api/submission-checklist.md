# Checklist ยื่นขอ Google OAuth Consent Screen Verification

ทำตามลำดับนี้ใน [Google Cloud Console](https://console.cloud.google.com) — แต่ละข้อมี checkbox ให้ติ๊กเมื่อทำเสร็จ อ้างอิงเนื้อหาที่ต้อง copy-paste จาก [`oauth-verification-summary.md`](oauth-verification-summary.md) และ [`privacy-policy.md`](privacy-policy.md)

> 🔴 **อ่านก่อนเริ่ม — สำคัญที่สุด:** checklist นี้ต้องทำกับ **โปรเจกต์ Calendar ที่แยกออกมา** (ขอแค่ `calendar.events`) **ไม่ใช่** โปรเจกต์แอปหลัก — เพราะแอปหลักถือ restricted scope (Gmail/Drive) ที่ถ้าเอามา verify จะต้องผ่าน CASA security assessment (แพง/นาน) เหตุผลเต็มดูใน [`oauth-verification-summary.md`](oauth-verification-summary.md) §2.5 ทำการแยกโปรเจกต์ให้เสร็จก่อน แล้วค่อยเริ่มข้อ 1

---

## ก่อนเริ่ม — สิ่งที่ต้องมีให้พร้อม

- [ ] **Privacy policy host จริงแล้ว** ที่ URL สาธารณะ (ดู [`privacy-policy.html`](privacy-policy.html) — เติม TODO ให้ครบก่อน host)
- [ ] **Homepage URL** ของแอปที่ใช้งานได้จริง (URL ของ web app ที่ deploy อยู่)
- [ ] อีเมลผู้ดูแลระบบ (support email + developer contact) ที่เช็คได้จริง — Google จะส่งอีเมลกลับมาที่นี่ระหว่างรีวิว

---

## 1. Switch จาก Default GCP Project เป็น Standard GCP Project

Apps Script ทุกโปรเจกต์ผูกกับ "default GCP project" อัตโนมัติ ซึ่ง **ไม่รองรับการปรับแต่ง OAuth consent screen เต็มรูปแบบ** ต้องเปลี่ยนก่อน:

- [ ] เปิด Apps Script editor ของโปรเจกต์ (scriptId ใน `.clasp.json`) → **Project Settings** (รูปเฟือง)
- [ ] ที่หัวข้อ "Google Cloud Platform (GCP) Project" กด **Change project**
- [ ] เลือก **สร้าง GCP project ใหม่แบบ standard** (หรือใช้ project ที่มีอยู่แล้วถ้ามี) — ตั้งชื่อที่สื่อความหมาย เช่น `siriraj-rx-shift-prod`
- [ ] ยืนยันว่า Apps Script ผูกกับ project ใหม่นี้แล้ว (เห็น Project number ใหม่ใน Project Settings)

## 2. เปิดใช้งาน Google Calendar API

- [ ] ไปที่ [Google Cloud Console → APIs & Services → Library](https://console.cloud.google.com/apis/library) ของ project จากข้อ 1
- [ ] ค้นหา **Google Calendar API** → กด **Enable**

## 3. ตั้งค่า OAuth Consent Screen — App Information

ไปที่ **APIs & Services → OAuth consent screen**

- [ ] **User Type = External** (บังคับ เพราะมีทั้งบัญชี Workspace และ Gmail ส่วนตัวปะปนกัน — ดูเหตุผลเต็มใน `oauth-verification-summary.md` §3)
- [ ] **App name:** `Siriraj Rx Shift`
- [ ] **User support email:** [TODO: อีเมลที่เช็คได้จริง]
- [ ] **App logo:** แนะนำ**ข้ามไปก่อน**ในรอบแรก — การใส่โลโก้จะเพิ่มขั้นตอนตรวจสอบ brand แยกต่างหาก ทำให้รีวิวช้าลง ใส่ทีหลังได้หลังผ่าน verification รอบแรกแล้ว
- [ ] **App domain — Application home page:** [TODO: URL homepage]
- [ ] **App domain — Application privacy policy link:** [TODO: URL ของ `privacy-policy.html` ที่ host แล้ว]
- [ ] **App domain — Application terms of service link:** ไม่บังคับ ข้ามได้ถ้ายังไม่มี
- [ ] **Authorized domains:** ใส่โดเมนที่ host homepage/privacy policy (เช่น `github.io` ถ้าใช้ GitHub Pages หรือโดเมนทางการของ รพ./มหาวิทยาลัยถ้ามี)
- [ ] **Developer contact information:** [TODO: อีเมลผู้ดูแลระบบ]

## 4. เพิ่ม Scopes

- [ ] กด **Add or Remove Scopes**
- [ ] ค้นหาและติ๊ก `.../auth/calendar.events` **เท่านั้น** (ห้ามติ๊ก scope Calendar อื่นที่กว้างกว่านี้โดยไม่จำเป็น — ดูเหตุผลใน `oauth-verification-summary.md` §2)
- [ ] ในช่อง scope justification ที่ปรากฏ ให้ copy ข้อความจาก `oauth-verification-summary.md` §2 (ย่อหน้า "Copy-paste สำหรับช่อง scope justification")

## 5. Test Users (ระหว่างรอ verification)

- [ ] เพิ่มบัญชี Google ของทีมพัฒนา/เภสัชกรกลุ่มนำร่อง (สูงสุด 100 บัญชี) เป็น **Test users** — ทำให้ทดสอบฟีเจอร์จริงได้ทันทีโดยไม่ต้องรอผล verification
- [ ] ใช้ช่วงนี้อัดวิดีโอสาธิตตาม [`demo-video-script.md`](demo-video-script.md) (ต้องมี flow ที่ใช้งานได้จริงก่อนอัด)

> **หมายเหตุ:** ถ้ากลุ่มนำร่องเริ่มต้น ≤100 คนพอดี สามารถให้ใช้งานจริงในโหมด Testing ไปพลางก่อนได้ระยะหนึ่ง แต่เมื่อจะขยายเป็นทั้งฝ่าย (~400 คน) **ต้อง**ผ่าน verification เต็มรูปแบบ เพราะเกินเพดาน 100 test users

## 6. Submit for Verification

- [ ] กลับไปที่หน้า OAuth consent screen → กด **Publish App** (เปลี่ยนจาก Testing → In production)
- [ ] ระบบจะถามยืนยัน submit for verification เนื่องจากมี sensitive scope + External + คาดว่าผู้ใช้ >100 → กด **Prepare for verification** / **Submit for verification**
- [ ] กรอกฟอร์มที่ Google ส่งมา — โดยทั่วไปจะขอ:
  - ลิงก์วิดีโอสาธิต (จาก `demo-video-script.md` — อัปโหลด YouTube Unlisted แล้วใส่ลิงก์)
  - Scope justification (copy จาก `oauth-verification-summary.md` §2 อีกครั้งถ้าฟอร์มถาม)
  - คำอธิบายว่าทำไมต้องมีผู้ใช้ >100 คน (copy จาก `oauth-verification-summary.md` §3)

## 7. Domain Ownership Verification (Google Search Console)

Google จะตรวจว่าโดเมนที่ใช้ใน homepage/privacy policy URL เป็นของทีมจริง:

- [ ] เปิด [Google Search Console](https://search.google.com/search-console)
- [ ] เพิ่ม property แบบ **URL prefix** ด้วย URL ของ homepage (หรือของ privacy policy ถ้าคนละโดเมน)
- [ ] verify ด้วยวิธี HTML file upload หรือ meta tag (ถ้าใช้ GitHub Pages — วางไฟล์ verification ใน repo แล้ว push ได้เลย)
- [ ] เพิ่มบัญชี Google เดียวกับที่ใช้จัดการ OAuth consent screen ให้เป็น owner ของ property นี้ด้วย (Search Console → Settings → Users and permissions)

## 8. รอผลและตอบกลับ

- [ ] เช็คอีเมล support/developer contact เป็นระยะ — Google มักถามคำถามเพิ่มเติมภายใน **3-5 วันทำการ** แรก (เช่น ขอวิดีโอเวอร์ชันอื่น หรือถามรายละเอียด data flow เพิ่ม)
- [ ] ตอบกลับให้เร็วที่สุด — ยิ่งตอบช้า ยิ่งยืดเวลารีวิวทั้งกระบวนการ (บางเคสใช้เวลารวมหลายสัปดาห์ถ้ามีถาม-ตอบหลายรอบ)
- [ ] เมื่อผ่าน verification แล้ว หน้าจอ "unverified app" warning ที่ผู้ใช้เคยเห็นตอน consent จะหายไป และรองรับผู้ใช้ได้ไม่จำกัดที่ 100 คนอีกต่อไป

---

## หลังผ่านแล้ว (ไม่ใช่ส่วนหนึ่งของการยื่น แต่ควรรู้ไว้)

- [ ] Re-review ประจำปี: Google รีวิว sensitive-scope apps ซ้ำเป็นระยะ อาจมีอีเมลขอข้อมูลอัปเดตในอนาคต — เก็บเอกสารชุดนี้ไว้ใช้ตอบซ้ำได้เลย
- [ ] ถ้าจะเพิ่ม scope อื่นภายหลัง (เช่นอ่าน calendar เพื่อเช็ค conflict) ต้องกลับมาแก้ consent screen + อาจต้อง verify ใหม่เฉพาะ scope ที่เพิ่ม
