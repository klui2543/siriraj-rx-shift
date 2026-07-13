# ชุดเอกสาร: ขอใช้ Google Calendar API (OAuth Consent Verification)

ชุดเอกสารนี้เตรียมไว้สำหรับยื่นขอ **verify OAuth consent screen** กับ Google เพื่อเปิดฟีเจอร์ sync ตารางเวรอัตโนมัติเข้า Google Calendar ส่วนตัวของผู้ใช้ (ฝ่ายเภสัชกรรม รพ.ศิริราช ~300-400 คน บัญชี Google ผสมทั้งองค์กร+ส่วนตัว)

**สถานะ:** ร่างเอกสาร — ยังไม่ได้ยื่น มี TODO ที่ต้องเติมค่าจริงก่อน publish (ดูแต่ละไฟล์)

## ใช้ตามลำดับนี้

| ลำดับ | ไฟล์ | ใช้ตอนไหน |
|---|---|---|
| 1 | [`oauth-verification-summary.md`](oauth-verification-summary.md) | อ่านก่อนเริ่ม — เป็นแหล่งคำตอบ/ข้อความ copy-paste สำหรับทุกช่องในฟอร์ม Google (scope justification, app description, จำนวนผู้ใช้ ฯลฯ) |
| 2 | [`privacy-policy.md`](privacy-policy.md) + [`privacy-policy.html`](privacy-policy.html) | ต้อง **host `privacy-policy.html` ให้มี URL จริง** ก่อนเริ่มกรอกฟอร์ม (Google ตรวจ URL นี้จริง) — เติม TODO อีเมล/URL ในไฟล์ก่อน |
| 3 | [`demo-video-script.md`](demo-video-script.md) | ใช้อัดวิดีโอสาธิตหลังฟีเจอร์ implement เสร็จและมี test flow ให้ดูจริง — Google มักขอวิดีโอนี้ระหว่างรีวิว |
| 4 | [`submission-checklist.md`](submission-checklist.md) | ทำตาม checklist นี้ทีละข้อใน Google Cloud Console ตั้งแต่ switch GCP project จนถึง submit for verification |

## สิ่งที่ต้องเติมให้ครบก่อนยื่นจริง (TODO รวม)

- อีเมลผู้ดูแลระบบ (support + developer contact) — ปรากฏใน `privacy-policy.md`, `privacy-policy.html`, `submission-checklist.md`
- URL homepage ของแอปที่ deploy จริง
- URL ที่ host `privacy-policy.html` แล้ว (แนะนำ GitHub Pages ของ repo นี้เป็นทางเลือกเริ่มต้น เว้นแต่ฝ่าย IT มีโดเมนทางการให้ใช้)

## สิ่งที่ยังไม่รวมอยู่ในชุดเอกสารนี้

- **โค้ด implement ฟีเจอร์จริง** — repo มี prototype ที่ยังไม่ได้เดินสายอยู่แล้ว (`../../Phase2C.js`) พร้อมข้อสังเกตทางเทคนิคที่ต้องแก้ก่อน ship สรุปไว้ใน `oauth-verification-summary.md` §7 — เป็นงานคนละรอบกับการยื่นเอกสารชุดนี้
- **การขอ domain-wide delegation จากฝ่าย IT ของโรงพยาบาล** (ทางเลือกเสริมสำหรับกลุ่มบัญชี Workspace เท่านั้น ไม่ครอบคลุม Gmail ส่วนตัว) — ไม่ใช่ทางลัดแทน verification ดูหมายเหตุใน `oauth-verification-summary.md` §3
