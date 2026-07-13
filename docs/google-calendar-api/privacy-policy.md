# นโยบายความเป็นส่วนตัว — Siriraj Rx Shift (Google Calendar Sync)

**อัปเดตล่าสุด:** 13 กรกฎาคม 2569

> ⚠️ **TODO ก่อน publish:** แทนที่ `[TODO: อีเมลผู้ดูแลระบบ]` และ `[TODO: URL หน้าแอปหลัก]` ด้านล่างด้วยค่าจริงก่อนนำไป host — Google จะเปิดดู URL นี้จริงตอน verify ห้ามปล่อย placeholder ค้าง

เอกสารนี้เป็น**ต้นฉบับ (source)** ของนโยบายความเป็นส่วนตัว — เวอร์ชันที่จะ host จริงคือ [`privacy-policy.html`](privacy-policy.html) (เนื้อหาเดียวกัน จัดหน้าให้อ่านง่ายบนเว็บ) เมื่อแก้ไขต้องแก้ทั้งสองไฟล์ให้ตรงกัน

ขอบเขตของนโยบายนี้ **ครอบคลุมเฉพาะฟีเจอร์ Google Calendar Sync** ของระบบ Siriraj Rx Shift ไม่ใช่นโยบายความเป็นส่วนตัวของทั้งระบบ (ระบบหลักใช้ชื่อ+รหัสผ่านภายใน ไม่ผ่านบัญชี Google)

---

## 1. ภาพรวม

Siriraj Rx Shift ("ระบบ", "เรา") เป็นระบบจัดตารางเวรภายในของฝ่ายเภสัชกรรม โรงพยาบาลศิริราช ฟีเจอร์ Google Calendar Sync เป็นทางเลือกเสริม (opt-in) ที่ช่วยให้ผู้ใช้เห็นเวรของตัวเองในปฏิทิน Google ส่วนตัวโดยอัตโนมัติ โดยไม่ต้องคัดลอกด้วยมือ

## 2. ข้อมูลที่เราเข้าถึงและเก็บ

เมื่อผู้ใช้กดยืนยันเชื่อมต่อ Google Calendar เราขอสิทธิ์ (scope) `calendar.events` ซึ่งใช้เพื่อ:

- **สร้าง** event ในปฏิทินของผู้ใช้ ตรงกับเวรที่ผู้ใช้ถืออยู่ (วันที่ เวลาเริ่ม-จบ ประเภทเวร หน่วยงาน/ห้องที่ประจำ)
- **แก้ไข** event เหล่านั้นเมื่อเวรมีการเปลี่ยนแปลง (ยก/แลกเวร)
- **ลบ** event เหล่านั้นเมื่อเวรถูกยกเลิก หรือเมื่อผู้ใช้ยกเลิกการเชื่อมต่อ

เรา**ไม่อ่าน** event อื่นที่มีอยู่ก่อนแล้วในปฏิทินของผู้ใช้ **ไม่เข้าถึง**ปฏิทินอื่นนอกจากปฏิทินหลักที่ผู้ใช้อนุญาต และ**ไม่ดึงข้อมูลใดจากปฏิทิน**กลับเข้าระบบ — การไหลของข้อมูลเป็นทิศทางเดียว (ระบบ → ปฏิทินผู้ใช้) เท่านั้น

ข้อมูลที่ปรากฏใน event เป็น**ข้อมูลตารางงานของบุคลากร (เวรของเภสัชกร) เท่านั้น** เราไม่เก็บ ไม่ประมวลผล และไม่เกี่ยวข้องกับข้อมูลผู้ป่วยหรือข้อมูลสุขภาพใดๆ ในฟีเจอร์นี้หรือในระบบส่วนอื่น

## 3. วัตถุประสงค์การใช้ข้อมูล

ใช้เพื่อวัตถุประสงค์เดียวเท่านั้นคือ**เตือนความจำเวรทำงาน**ของผู้ใช้ผ่านปฏิทินส่วนตัวที่ผู้ใช้ใช้งานอยู่แล้วในชีวิตประจำวัน เราไม่ใช้ข้อมูลนี้เพื่อการโฆษณา ไม่ขาย ไม่ให้เช่า ไม่แชร์กับบุคคลหรือบริษัทภายนอกใดๆ

## 4. การเก็บรักษาและระยะเวลา

- Mapping ระหว่างเวรกับ event (shift ↔ event ID) จะถูกเก็บไว้ตราบเท่าที่ผู้ใช้ยังเปิดใช้ฟีเจอร์นี้อยู่ เพื่อให้ระบบรู้ว่าต้องอัปเดต/ลบ event ไหนเมื่อเวรเปลี่ยน
- เมื่อผู้ใช้ยกเลิกการเชื่อมต่อ (ดูข้อ 6) ระบบจะลบ event ที่สร้างไว้ทั้งหมดออกจากปฏิทินผู้ใช้ และลบ mapping ที่เกี่ยวข้องออกจากระบบ

## 5. การแชร์ข้อมูลกับบุคคลที่สาม

เราไม่แชร์ข้อมูลจาก Google Calendar API กับบุคคลที่สามรายใด การเข้าถึง Google Calendar API เป็นไปตาม [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) รวมถึงข้อกำหนด Limited Use

## 6. สิทธิ์ของผู้ใช้ / วิธียกเลิกการเชื่อมต่อ

ผู้ใช้สามารถยกเลิกการเชื่อมต่อได้ตลอดเวลาโดย:

1. กดปุ่ม "ยกเลิกการเชื่อมต่อ Google Calendar" ภายในระบบ (ระบบจะลบ event ที่สร้างไว้ทั้งหมดให้อัตโนมัติ) หรือ
2. ถอนสิทธิ์โดยตรงที่ [Google Account permissions](https://myaccount.google.com/permissions) — เลือกแอป "Siriraj Rx Shift" แล้วเลือกยกเลิก

ผู้ใช้สามารถขอให้ลบข้อมูล mapping ที่เกี่ยวข้องออกจากระบบได้ทันทีโดยติดต่อผู้ดูแลระบบตามช่องทางในข้อ 9

## 7. ความปลอดภัย

ข้อมูลถูกจัดเก็บในโครงสร้างพื้นฐานของ Google (Google Sheets/Firebase, region `asia-southeast1`) มีการบันทึก audit log การเชื่อมต่อ/ยกเลิกการเชื่อมต่อทุกครั้ง การเข้าถึงระบบจำกัดเฉพาะบุคลากรฝ่ายเภสัชกรรมที่มีบัญชีในระบบเท่านั้น

## 8. การเปลี่ยนแปลงนโยบายนี้

หากมีการเปลี่ยนแปลงสาระสำคัญของนโยบายนี้ เราจะปรับปรุงวันที่ "อัปเดตล่าสุด" ด้านบน และแจ้งผู้ใช้ผ่านช่องทางประกาศภายในระบบ

## 9. ติดต่อ

หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวนี้ หรือต้องการขอลบข้อมูล ติดต่อ: **[TODO: อีเมลผู้ดูแลระบบ]**

แอปหลัก: **[TODO: URL หน้าแอปหลัก]**

---

*(English summary for reviewer convenience — full policy above is authoritative)*

This privacy policy covers only the optional Google Calendar Sync feature of Siriraj Rx Shift, an internal duty-roster system for the Pharmacy Department, Siriraj Hospital. With user consent, the app uses the `calendar.events` scope to create/update/delete calendar events representing the user's own work shifts (date, time, shift type, assigned unit/room) on their personal calendar. The app does not read pre-existing events, does not access other calendars, does not pull any data back from Calendar into the system, and never handles patient or health information. Users can revoke access at any time in-app or via [Google Account permissions](https://myaccount.google.com/permissions); doing so deletes all events the app created. Data is never sold, rented, or shared with third parties, and use complies with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.
