# Siriraj Rx Shift — KPI Framework (สำหรับเสนอผู้บริหาร)

**เวอร์ชันเอกสาร:** 1.1
**วันที่:** 11 กรกฎาคม 2569
**อิงโค้ด ณ:** v3.45 (LWW ownership, Draft/Publish, governance cancel)
**เป้าหมายเอกสาร:** นิยาม KPI ที่ **วัดผลได้จริงจาก log ที่แอปเก็บอยู่แล้ว** เพื่อให้ผู้บริหารเห็นประโยชน์เชิงประจักษ์ของระบบ และใช้ตัดสินใจขยายทั้งฝ่ายเภสัชกรรม

> เอกสารคู่กัน: [`DESIGN_hospital_scale.md`](DESIGN_hospital_scale.md) — สถาปัตยกรรมและ migration path
>
> **v1.1 sync:** ปรับ B1/B2 เป็น LWW record + server-stamped `at`, เพิ่ม B2b (draft→publish), C5 (governance coverage), E2b (Firebase-served ratio)

---

## 1. ปรัชญาการวัดผล (ทำไม KPI ชุดนี้)

ผู้บริหารไม่ได้สนใจ "ฟีเจอร์" — สนใจ **ผลลัพธ์ 4 ด้าน**:

| ด้านที่ผู้บริหารสนใจ | คำถามที่ระบบตอบได้ |
|----------------------|---------------------|
| 💰 **ประหยัดเวลา/ต้นทุน** | ระบบลดเวลาทำตาราง/แจกจ่าย/ประสานแลกเวรได้เท่าไร? |
| 🛡️ **ลดความผิดพลาด/ความเสี่ยง** | ลดการลืมเวร / ตารางชนกัน / เวรว่างได้แค่ไหน? |
| 📈 **การยอมรับใช้งาน** | คนใช้จริงกี่ %? ใช้ต่อเนื่องไหม? |
| 📢 **การสื่อสารทั่วถึง** | ประกาศ/เตือน ถึงคนจริงกี่ %? |

**หลักการสำคัญ:** ทุก KPI ต้อง (1) มี **แหล่งข้อมูลจริงในระบบ** (2) มี **baseline เทียบก่อน-หลัง** (3) **ผูกกับคุณค่าเชิงบริหาร** ไม่ใช่ vanity metric

---

## 2. North Star Metric

> **% ของเวรที่ถูกจัดการผ่านระบบดิจิทัลครบวงจร**
> (ดูตาราง + แลกเวรในระบบ + ได้รับการเตือน) เทียบกับเวรทั้งหมด

เป็นตัวเดียวที่สะท้อน "ระบบแทนที่กระบวนการเดิม (Excel + ไลน์) ได้จริงแค่ไหน" — ครอบทั้ง adoption, efficiency, communication ในตัวเดียว

**แหล่งข้อมูล:** จำนวนเวรจาก schedule ต้นฉบับ (`totalRecords` ใน Statistics log) เทียบกับเวรที่มี engagement (view/overlay/reminder) จาก audit + overlay log

---

## 3. KPI Scorecard (5 หมวด)

### หมวด A — การยอมรับใช้งาน (Adoption & Engagement)

| KPI | นิยาม | แหล่งข้อมูลในระบบ | Target (นำร่อง) |
|-----|-------|-------------------|-----------------|
| **A1. Registration rate** | ผู้ลงทะเบียน ÷ เภสัชกรทั้งหมดในหน่วย | `User_Auth` sheet vs People master | ≥ 80% ใน 3 เดือน |
| **A2. MAU / WAU** | ผู้ใช้ที่ active ต่อเดือน/สัปดาห์ | audit `login` events + `_phxTouchLastSeen` | MAU ≥ 70% ของผู้ลงทะเบียน |
| **A3. Stickiness (DAU/MAU)** | ความถี่การกลับมาใช้ | audit login timestamps | ≥ 0.3 |
| **A4. Mobile adoption** | สัดส่วนใช้งานผ่านมือถือ | `logDeviceType` | ติดตามแนวโน้ม (คาด > 70%) |
| **A5. Calendar sync opt-in** | % ผู้ที่ต่อปฏิทินส่วนตัว | `getCalendarSyncStatus` (Phase2C) | ≥ 30% |

### หมวด B — ประสิทธิภาพการทำงาน (Operational Efficiency)

| KPI | นิยาม | แหล่งข้อมูลในระบบ | Target |
|-----|-------|-------------------|--------|
| **B1. Self-service swap rate** | แลก/ยกเวรที่ทำเองในระบบ ÷ ทั้งหมด | LWW ownership records + audit `swap`/`give` | ≥ 90% ทำในระบบ |
| **B2. Swap turnaround time** | เวลาเฉลี่ยจาก "สร้างร่าง (draft)" → "เผยแพร่ (publish)" และ "มีคนถือครบ" | LWW record `at` (draft) → `at` (public); ต้องใช้ **server-stamped `at`** เพื่อความแม่น | ลดลง vs ไลน์ (baseline สำรวจ) |
| **B2b. Draft-to-publish gap** | ร่างค้างไม่เผยแพร่นานแค่ไหน / % ร่างที่ถูกทิ้ง | `_visibility` draft vs public + timestamp | ร่างค้าง ↓ (สะท้อน UX เผยแพร่) |
| **B3. เวลาแจกจ่ายตาราง** | เวลาจาก "ตารางเสร็จ" → "ทุกคนเข้าถึง" | เดิม: แจกไลน์/ปรินต์ → ใหม่: อัปโหลด 1 ครั้ง | ~ทันที (จากชั่วโมง/วัน) |
| **B4. Admin time saved** | เวลาที่หัวหน้าเวรประหยัด/เดือน | สำรวจ + audit admin actions | ประเมินเป็น man-hours |

> **B2/B3 คือ "เงิน" ที่ผู้บริหารเห็นภาพชัดที่สุด** — แปลงเป็น man-hours × ค่าแรงเภสัชกร

### หมวด C — ลดความผิดพลาด/ความเสี่ยง (Reliability & Safety)

| KPI | นิยาม | แหล่งข้อมูลในระบบ | Target |
|-----|-------|-------------------|--------|
| **C1. Reminder delivery rate** | เตือนที่ส่งสำเร็จ ÷ เวรที่ควรเตือน | email/LINE queue (Phase_Z_B2, F2) | ≥ 98% |
| **C2. Missed-shift proxy** | เวรที่ไม่มีคน/ผิดพลาด (ก่อน-หลังใช้ระบบ) | สำรวจ + audit + reminder log | ลดลงอย่างมีนัย |
| **C3. Data-quality score** | คุณภาพข้อมูลนำเข้าแต่ละเดือน | Statistics log: `rejectedDates`, `unmatched`, `missingNames` | rejected = 0, unmatched ↓ |
| **C4. Schedule conflict detection** | ความผิดพลาดที่ระบบ validate จับได้ | validation pipeline (Phase_J_Validation) | จับได้ก่อนเผยแพร่ 100% |
| **C5. Governance coverage** | % การเปลี่ยน/ยกเลิกเวรที่มี "ลงชื่อ + เหตุผล + audit" | `recordedBy` ทุก record + audit `cancel_published`/`admin_cancel_published` (มี reason+password) | 100% ของ destructive action |

### หมวด D — การสื่อสารทั่วถึง (Communication)

| KPI | นิยาม | แหล่งข้อมูลในระบบ | Target |
|-----|-------|-------------------|--------|
| **D1. Announcement reach** | ผู้เห็นประกาศ ÷ ผู้ลงทะเบียน | broadcast read-receipts (`phxBroadcastGetReadIds`) | ≥ 80% |
| **D2. Broadcast read rate** | อ่านแล้ว ÷ ส่งไป | `phxBroadcastMarkRead` vs recipients | ≥ 60% ใน 48 ชม. |
| **D3. New-month announce lead time** | ประกาศตารางใหม่เร็วแค่ไหน | `phxAnnounceNewMonth` timestamp | ล่วงหน้า ≥ X วัน |

### หมวด E — สุขภาพระบบ (System Health — สำหรับทีม/IT)

| KPI | นิยาม | แหล่งข้อมูลในระบบ | Target |
|-----|-------|-------------------|--------|
| **E1. Ingestion success rate** | อัปโหลด/sync สำเร็จ ÷ ทั้งหมด | Statistics log + audit system | ≥ 99% |
| **E2. Sync latency** | เวลาจากอัปโหลด → Firebase พร้อมอ่าน | timestamp diff (upload → firebase push) | < X วินาที |
| **E2b. Firebase-served ratio** | % การโหลดที่มาจาก Firebase/poll (ไม่ตก fallback GAS) | `connRadar` source (`firebase`/`poll` vs `gas`) | ≥ 95% (ต่ำ = key mismatch/"Firebase ดับ") |
| **E3. Error rate** | error ต่อ 1,000 actions | Stackdriver + audit | ต่ำ, มีแนวโน้มลด |
| **E4. Cost per active user** | ต้นทุน Firebase/เดือน ÷ MAU | Firebase billing (Blaze) | คาดการณ์ได้ |

---

## 4. Gap Analysis — อะไรวัดได้เลย vs ต้องเพิ่ม instrument

| สถานะ | KPI ที่ครอบคลุม | หมายเหตุ |
|--------|------------------|----------|
| ✅ **วัดได้เลย** (มี log แล้ว) | A1, A2, A4, B1, C3, D1, D2, E1 | ดึงจาก audit / overlay / stats / broadcast / device log ที่มีอยู่ |
| 🟡 **เพิ่มนิดหน่อย** | A3, A5, B2, C1, C4, D3, E2 | มี raw data แล้ว ต้องเขียน query/aggregation หรือเพิ่ม field timestamp |
| 🔴 **ต้องเก็บใหม่ / สำรวจ** | B3, B4, C2 | ต้อง baseline survey (เวลาเดิมที่ใช้) + view-tracking event |

**Quick Wins (ทำใน เฟส 0 — ดู DESIGN §4):**
1. เพิ่ม **view event** เมื่อเปิดตาราง (แยกจาก login) → เปิดทาง North Star + engagement ที่แม่นขึ้น
2. เพิ่ม **timestamp มาตรฐาน** ในทุก overlay/audit action ให้ครบ → คำนวณ B2 swap turnaround ได้
3. ทำ **baseline survey** สั้นๆ กับผู้ใช้ปัจจุบัน (เวลาเดิมที่ใช้แลกเวร/หาตาราง) → ได้ตัวเลข "ก่อน" สำหรับ B3/B4/C2
4. ตั้ง **สรุปรายเดือนอัตโนมัติ** (GAS trigger) เขียนลง `KPI_Monthly` sheet → feed dashboard

---

## 5. Data Pipeline สำหรับ KPI

```
แหล่ง log ที่มีอยู่                    รวบรวม                     แสดงผล
┌──────────────────┐
│ Audit log (G)     │─┐
│ User_Overlays     │ │            ┌────────────────┐        ┌─────────────────┐
│ Statistics log    │ ├──GAS trigger──▶│ KPI_Monthly     │──────▶ │ Looker Studio    │
│ Device log        │ │  (รายวัน/เดือน)  │ sheet (aggregate)│        │ dashboard        │
│ Broadcast reads   │ │            └────────────────┘        │ (ผู้บริหาร/หน่วย)  │
│ Reminder queue    │─┘                                       └─────────────────┘
└──────────────────┘   (เฟส 2: → BigQuery เมื่อ scale)
```

**คำแนะนำ:** เริ่มจาก **Google Sheet + Looker Studio** (ฟรี, เชื่อม Sheet ตรง, ทำ dashboard สวยให้ผู้บริหารได้เลย) → เมื่อข้อมูลโตค่อยขยับไป BigQuery ในเฟส 2

---

## 6. Executive Dashboard — เค้าโครงที่แนะนำ

**หน้าเดียว 4 โซน (ให้ผู้บริหารเข้าใจใน 30 วินาที):**

1. **แถบบนสุด — North Star + 4 ตัวเลขใหญ่:** % เวรจัดการผ่านระบบ, MAU, self-service swap rate, reminder delivery rate
2. **โซนซ้าย — Adoption trend:** กราฟผู้ใช้ active รายเดือน + registration
3. **โซนขวา — Efficiency:** man-hours ประหยัด (แปลงจาก B2/B3/B4), swap turnaround
4. **แถบล่าง — ต่อหน่วยงาน (เมื่อ multi-unit):** เทียบ adoption/efficiency รายหน่วย → ผู้บริหารเห็นว่าหน่วยไหนได้ประโยชน์

---

## 7. เล่าเป็น "เรื่องคุณค่า" ให้ผู้บริหาร (Value Narrative)

แปลง KPI เป็นประโยคที่ผู้บริหารจำได้:

- 💰 *"ลดเวลาแจกจ่ายตารางจาก **หลายชั่วโมง → ทันที** และแลกเวรเสร็จใน **นาที** แทน **วัน**"* (B2, B3)
- 🛡️ *"เตือนก่อนเข้าเวรอัตโนมัติ **>98%** ลดความเสี่ยงลืมเวร"* (C1, C2)
- 📈 *"เภสัชกร **X%** ใช้งานประจำทุกเดือน แลกเวร **90%** ทำในระบบมีร่องรอยตรวจสอบได้"* (A2, B1)
- 📢 *"ประกาศถึงคน **80%+** วัดผลได้จริงจาก read-receipt (ไลน์กลุ่มวัดไม่ได้)"* (D1, D2)
- 🔍 *"ทุกการเปลี่ยนเวร **ลงชื่อผู้ทำ** และการยกเลิกต้อง **มีเหตุผล + ยืนยันตัวตน + บันทึกถาวร** — โปร่งใส ตรวจสอบย้อนหลังได้"* (C5, governance)

---

## 8. อ้างอิง instrumentation ในโค้ด

| KPI หมวด | Function / แหล่ง |
|----------|------------------|
| Login/Active (A2,A3) | `phxLogAudit` action=login, `_phxTouchLastSeen` (Phase_Z_B3) |
| Device (A4) | `logDeviceType` (code.js:1573) |
| Swap/Give (B1,B2,B2b) | LWW ownership records (`slotKey`/`newOwner`/`recordedBy`/`at`/`_visibility`) + audit swap/give; `phxPushActions` (Phase_Z_B3) — **ต้องมี server-stamped `at`** |
| Governance (C5) | `recordedBy` ทุก record; audit `cancel_published`/`admin_cancel_published` + `phxVerifyPassword` (Phase_Z_B1) |
| Firebase health (E2b) | `connRadar` source tag (`firebase`/`poll`/`gas`) ใน `Index.html`; `syncMonthToFirebase` (code.js) |
| Data quality (C3) | `logStatisticsToSheet_` (code.js:833) → `rejectedDates`, `unmatched`, `missingNames` |
| Validation (C4) | `runPositionNoteValidation` (Phase_J_Validation), `runNoteIngestPipeline` |
| Reminder (C1) | Phase_Z_B2 reminder queue, `phxB3bHourlyTrigger` |
| Broadcast reach (D1,D2) | `phxBroadcastGetReadIds`, `phxBroadcastMarkRead` (Phase_F1) |
| Calendar (A5) | `getCalendarSyncStatus` (Phase2C) |
| Ingestion (E1,E2) | `uploadLocalFile`, `pushToFirebase_`, Statistics log |

> **สรุป:** ~60% ของ KPI ดึงจาก log ที่มีอยู่แล้วได้ทันที ที่เหลือเพิ่ม instrument เล็กน้อยในเฟส 0 — ดู `DESIGN_hospital_scale.md` §4
