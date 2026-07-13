# สคริปต์วิดีโอสาธิต (Demo Video Script) — สำหรับ Google OAuth Verification

**ใช้เมื่อ:** ระหว่างกรอกฟอร์ม verification ใน Google Cloud Console หรือเมื่อทีม Google review ขอวิดีโอสาธิตเพิ่มเติมทาง email (มักถูกขอเกือบทุกครั้งสำหรับ sensitive scope) — ดูจุดที่ต้องแนบใน [`submission-checklist.md`](submission-checklist.md) ข้อ 6

## เป้าหมายของวิดีโอ

ผู้ตรวจสอบของ Google (คนจริง ไม่ใช่ระบบอัตโนมัติ) ต้องดูวิดีโอแล้ว**เข้าใจได้เองภายในไม่กี่นาที**ว่า:
1. แอปนี้คืออะไร ใครใช้
2. หน้าจอ OAuth consent ที่ผู้ใช้เห็นตอนขอสิทธิ์ scope `calendar.events` หน้าตาเป็นอย่างไร
3. หลังอนุญาตแล้ว scope นั้นถูกใช้งานจริงตรงไหน (event ไปโผล่ในปฏิทินจริง)
4. ผู้ใช้ยกเลิกสิทธิ์ได้อย่างไร

**⚠️ ข้อควรระวัง:** อัดเป็นวิดีโอ**ต่อเนื่องไม่ตัดต่อ** (unedited screen recording) แสดง URL bar ให้เห็นตลอด — ผู้ตรวจสอบ Google มักปฏิเสธวิดีโอที่ตัดต่อเพราะพิสูจน์ความจริงของ flow ไม่ได้ ความยาวที่พอดี **2-5 นาที**

## อุปกรณ์ที่ต้องเตรียมก่อนอัด

- บัญชี Google ทดสอบ 1 บัญชี (แนะนำใช้บัญชีจริงของ Klui หรือบัญชีทดสอบที่ตั้งไว้ ไม่ต้องเป็นบัญชีองค์กร)
- โปรแกรมอัดหน้าจอพร้อมเสียง (เช่น OBS, Loom, หรือ built-in screen recorder ของ Windows `Win+G`)
- แอป Siriraj Rx Shift ที่ deploy เวอร์ชันที่มีปุ่มเชื่อมต่อ Calendar แล้ว (ต้องรอ implement ฟีเจอร์จริงก่อน — ดูข้อ 7 ใน `oauth-verification-summary.md`)
- เปิดแท็บ Google Calendar ของบัญชีทดสอบไว้ล่วงหน้าอีกแท็บหนึ่ง เพื่อสลับไปโชว์ตอนท้าย

## ลำดับฉาก (Storyboard)

| # | ฉาก | สิ่งที่พูด/บรรยาย (พากย์เสียงหรือใส่ caption) | ระยะเวลาโดยประมาณ |
|---|---|---|---|
| 1 | เปิดหน้าแรกของแอป Siriraj Rx Shift แสดงตารางเวร | "This is Siriraj Rx Shift, a shift-scheduling app for pharmacists at Siriraj Hospital." | 15 วิ |
| 2 | Login เข้าระบบด้วยบัญชีทดสอบ (ชื่อ+รหัสผ่านของแอป) แสดงตารางเวรของผู้ใช้คนนี้ | "The user logs in and sees their own duty shifts." | 15 วิ |
| 3 | คลิกปุ่ม "เชื่อมต่อ Google Calendar" | "The user opts in to sync their shifts to their personal Google Calendar." | 10 วิ |
| 4 | **หน้าจอ OAuth consent ของ Google โผล่ขึ้นมา** — หยุดชั่วครู่ให้เห็น URL bar เป็น `accounts.google.com` ชัดๆ และเห็น scope ที่ขอ (calendar.events) | "This is Google's own consent screen, showing exactly what permission — calendar.events — the app is requesting." | 20-30 วิ |
| 5 | กด Allow แล้วกลับมาที่แอป เห็นสถานะ "เชื่อมต่อแล้ว" | "After granting access, the app confirms the connection." | 10 วิ |
| 6 | สลับไปแท็บ Google Calendar ที่เปิดไว้ รีเฟรชหน้า แสดง event เวรที่เพิ่งถูกสร้างขึ้น พร้อมรายละเอียด (เวลา, ประเภทเวร, หน่วยงาน) | "The user's shift now appears automatically on their real Google Calendar — with the correct time and unit assignment." | 30 วิ |
| 7 | กลับไปที่แอป ทำการ "ยกเวร" หรือ "แลกเวร" ให้อีกคน (ถ้าฟีเจอร์นี้พร้อม) แล้วสลับกลับไปดู Calendar ว่า event หายไป/อัปเดต | "When a shift is handed off, the calendar event updates automatically." | 20-30 วิ |
| 8 | กลับไปที่แอป กดปุ่ม "ยกเลิกการเชื่อมต่อ Google Calendar" สลับไปดู Calendar ว่า event ที่สร้างไว้หายไปหมด | "The user can disconnect at any time — this immediately removes all events the app created." | 20-30 วิ |
| 9 | (ทางเลือก) เปิด `myaccount.google.com/permissions` โชว์ว่าแอปหายไปจาก third-party access list แล้ว | "Access can also be revoked directly from the user's Google Account settings." | 15 วิ |

**รวมโดยประมาณ:** 2.5-3.5 นาที

## หลังอัดเสร็จ

1. อัปโหลดขึ้น YouTube เป็น **Unlisted** (ไม่ต้อง Public — Google reviewer เข้าถึงลิงก์ unlisted ได้ปกติ, Unlisted ดีกว่าเพราะไม่มีใครค้นเจอโดยบังเอิญ)
2. Copy ลิงก์ไปใส่ในฟอร์ม verification (ดู `submission-checklist.md` ข้อ 6)
3. เก็บไฟล์วิดีโอต้นฉบับไว้ เผื่อ Google ขอเวอร์ชันอื่นหรือถามเพิ่มภายหลัง
