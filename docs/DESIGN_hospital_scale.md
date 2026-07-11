# Siriraj Rx Shift — Architecture Design for Hospital-Scale (ฝ่ายเภสัชกรรม)

**เวอร์ชันเอกสาร:** 1.1
**วันที่:** 11 กรกฎาคม 2569
**ผู้จัดทำ:** ทีมพัฒนา Siriraj Rx Shift
**อิงโค้ด ณ:** v3.45 (handoffs v3.40–v3.45 + `DESIGN_LWW_ownership_v3.44.md`)
**เป้าหมายเอกสาร:** วางแผนการสเกลจาก ~300 คน (หน่วยงานเดียว) → **ทั้งฝ่ายเภสัชกรรมของโรงพยาบาล** (หลายหน่วยงาน / multi-unit) และเตรียมสถาปัตยกรรมให้พร้อมนำเสนอผู้บริหาร

> เอกสารคู่กัน: [`KPI_framework.md`](KPI_framework.md) — วิธีวัดผลเชิงประจักษ์ให้ผู้บริหารเห็นประโยชน์
>
> **v1.1 sync:** ปรับ mutation model จาก "overlay composite key" → **LWW Ownership (v3.44)**, เพิ่ม Draft/Publish + governance (v3.45), Firebase resilience (connRadar), และ server-stamped `at`

---

## 1. สรุปผู้บริหาร (Executive Summary)

Siriraj Rx Shift คือระบบจัดการและเผยแพร่ตารางเวรเภสัชกรที่ใช้งานจริงอยู่แล้วกับผู้ใช้ ~300 คน โดย **แก้ปัญหา 3 จุดเจ็บหลัก** ของการจัดเวรแบบเดิม (Excel + ไลน์กลุ่ม):

1. **ตารางกระจัดกระจาย** — ทุกคนถือ Excel คนละเวอร์ชัน → รวมเป็นแหล่งเดียว (single source of truth)
2. **ยกเวร/แลกเวรไร้ร่องรอย** — คุยในไลน์ ตกหล่น เถียงกันภายหลัง → ระบบ overlay ที่บันทึกทุกการเปลี่ยนแปลง (audit trail)
3. **ลืมเวร** — → ระบบเตือนอัตโนมัติ (email/LINE/ปฏิทิน) ก่อนเข้าเวร

**สิ่งที่เอกสารนี้เสนอ:** ระบบพิสูจน์ตัวเองแล้วในระดับหน่วยงาน ขั้นต่อไปคือทำให้รองรับ **หลายหน่วยงานพร้อมกัน** ด้วยการปรับสถาปัตยกรรมแบบ **เป็นเฟส (phased)** ที่ไม่ทิ้งของเดิม ควบคุมต้นทุน และมี KPI วัดผลชัดเจนทุกเฟส

---

## 2. สถาปัตยกรรมปัจจุบัน (As-Is)

### 2.1 ภาพรวม Stack

```
┌─────────────────────────────────────────────────────────────┐
│  แหล่งข้อมูลต้นทาง: Excel ตารางเวร (อัปโหลด / Gmail auto-ingest) │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND: Google Apps Script (GAS) — 27 ไฟล์, ~487 functions  │
│  • transformBlobData_ : Excel → schedule records              │
│  • writeScheduleToSheet_ : เขียน "ต้นฉบับ" (immutable)         │
│  • Overlay API (Path B) : ยกเวร/แลกเวร                         │
│  • Auth + Roles / Audit / Broadcast / LINE / Reminder         │
└──────────┬──────────────────────────────────┬────────────────┘
           ▼                                   ▼
┌────────────────────────┐        ┌──────────────────────────────┐
│  Google Sheets (DB)     │        │  Firebase RTDB (read mirror)  │
│  • ตารางไทย/เดือน (lock) │  sync  │  asia-southeast1              │
│  • User_Auth / Overlays │──────▶ │  • อ่านเร็ว, bypass GAS        │
│  • Audit / Stats / ...  │        │  • frontend อ่านตรงจากที่นี่    │
└────────────────────────┘        └──────────────┬───────────────┘
                                                  ▼
                              ┌────────────────────────────────────┐
                              │  FRONTEND: Index.html (monolith)     │
                              │  ~13,500 บรรทัด, Firebase-first read   │
                              │  + Path B overlay merge บน client     │
                              └────────────────────────────────────┘
```

### 2.2 หลักการออกแบบที่ดีอยู่แล้ว (เก็บไว้)

| หลักการ | ทำไมดี | อ้างอิง |
|---------|--------|---------|
| **Single source of truth ต่อเดือน** | ต้นฉบับ 1 tab/เดือน ล็อค warning-only ป้องกันแก้มั่ว | `writeScheduleToSheet_` (HANDOFF v3.41) |
| **LWW Ownership model** (v3.44+) | ต้นฉบับ immutable → ทุกการโอน = 1 record ชี้ที่ `slotKey` (แถว master); "ใครถือตอนนี้" = record public ล่าสุด | `DESIGN_LWW_ownership_v3.44.md` |
| **`slotKey` = `date\|pos\|origOwner\|range`** | คีย์แถว master นิ่งเพราะ "ชื่อเดิม" ไม่เปลี่ยน → record ทนต่อ re-upload, ไม่ต้องต่อโซ่ ghost | HANDOFF v3.43 §linchpin |
| **Draft/Publish + `recordedBy`** | action เป็น draft ก่อน (กันเน็ตหลุด) เผยแพร่ค่อย public; ลงชื่อ login ทุก record | HANDOFF v3.43/v3.45 |
| **Multi-source read resilience** | อ่าน Firebase-first → poll → **fallback GAS/Sheet เมื่อ Firebase ดับ** | `connRadar` (HANDOFF Firebase 2026-07-09) |
| **Governance บน destructive action** | ยกเลิก published ต้อง reason + password + audit; admin-cancel ก็เช่นกัน | HANDOFF v3.45 (`phxVerifyPassword`) |
| **Audit trail ทุก action** | บันทึก swap/give/login/cancel พร้อม before/after + `recordedBy` | `phxLogAudit` (Phase G) |

> **ข้อสังเกตสำคัญ 1:** frontend อ่านจาก Firebase โดยตรง (ไม่ผ่าน GAS) + มี fallback หลายชั้น (Firebase→poll→GAS) ทำให้ระบบ **"สเกลการอ่าน" และ "ทนต่อ Firebase ดับ" ได้แล้ว** — รากฐานที่ดีมากสำหรับระดับโรงพยาบาล
>
> **ข้อสังเกตสำคัญ 2 (สำหรับ multi-unit):** `slotKey` ของ LWW **นิ่งและ scope ตามหน่วยงานได้ง่าย** — เป็นฐานที่คลีนกว่าโมเดล chain เดิมมากในการเพิ่มมิติ unit (ดู §3.2)

### 2.3 จุดที่จะกลายเป็นคอขวดเมื่อสเกล (As-Is Constraints)

| ชั้น | เพดาน/ข้อจำกัดจริง | ผลเมื่อขยายเป็นทั้งฝ่าย |
|------|---------------------|--------------------------|
| **GAS execution** | รันพร้อมกันได้ ~30 executions, 6 นาที/ครั้ง | การเขียน (overlay/audit/login) แข่งกันเมื่อคนเยอะ |
| **GAS triggers** | รวม 90 นาที/วัน (consumer) หรือ 6 ชม. (Workspace) | reminder/sweep หลายหน่วยงานชนเพดาน |
| **Email quota** | 100/วัน (consumer) หรือ 1,500/วัน (Workspace) | หลายหน่วยงาน × reminder รายวัน = เกินง่าย |
| **Sheets เป็น DB** | LockService contention, append ช้าเมื่อแถวเยอะ | audit/overlay หลายพันแถว/เดือน/หน่วยงาน |
| **Firebase RTDB (Spark)** | 100 connection พร้อมกัน, 1GB, 10GB/เดือน | คนเปิดพร้อมกันหลายร้อย → ต้องขึ้น Blaze |
| **Firebase key เป็น label-based** | `"m_"+label.replace(/\s+/g,'_')` — key ผูกข้อความ label | label ไม่ตรง = null = fallback GAS ค้าง ("Firebase ดับ") — เปราะเมื่อหลายหน่วยงาน |
| **`Index.html` monolith** | 13,500 บรรทัดในไฟล์เดียว | maintainability ต่ำ, เพิ่ม feature ต่อหน่วยงานยาก |
| **Config เป็น Script Property** | `MONTH_LIST` เดียวทั้งระบบ | ไม่มีมิติ "หน่วยงาน" (unit) |

**สรุปแก่น:** ปัจจุบันระบบออกแบบมาเพื่อ **"หนึ่งหน่วยงาน หนึ่งชุดข้อมูล"** การขึ้นเป็นทั้งฝ่ายต้องเพิ่มมิติ **unit (หน่วยงาน)** ทุกชั้น และย้าย write path ที่หนักออกจาก GAS+Sheets

---

## 3. สถาปัตยกรรมเป้าหมาย (To-Be, Hospital-Scale)

### 3.1 หลักการนำทาง (Design Principles)

1. **Multi-unit ตั้งแต่แกน** — ทุก entity มี `unitId`; ผู้ใช้เห็นเฉพาะหน่วยงานตัวเอง; แลกเวรข้ามหน่วยได้แบบมีขอบเขต
2. **แยก read/write ให้ชัด** — read ผ่าน managed DB (Firebase), write ที่หนักย้ายออกจาก GAS ทีละส่วน
3. **GAS ยังคุ้มค่า** — เก็บ GAS ไว้ทำสิ่งที่มันเก่ง: **Excel ingestion + งาน admin + integration กับ Google Workspace** (Gmail/Calendar/Sheets) ไม่ต้อง rewrite ทิ้ง
4. **Compliance by design** — PDPA (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล), audit ครบ, access control ตามบทบาท, ข้อมูลอยู่ใน region asia-southeast1
5. **วัดผลได้ทุกเฟส** — instrument KPI ตั้งแต่ต้น (ดู `KPI_framework.md`)

### 3.2 โมเดล Multi-Unit (มิติหน่วยงาน)

```
Organization: ฝ่ายเภสัชกรรม รพ.ศิริราช
│
├── Unit: OPD ผู้ป่วยนอก        (unitId: opd)
├── Unit: IPD ผู้ป่วยใน          (unitId: ipd)
├── Unit: คลินิกเฉพาะทาง         (unitId: clinic)
├── Unit: ห้องยา/จ่ายยา          (unitId: dispense)
└── ...
```

**การเปลี่ยนแปลงเชิงข้อมูล (data model):**

| Entity | ปัจจุบัน | เพิ่ม/ปรับ |
|--------|----------|-----------|
| Schedule | 1 tab/เดือน | เพิ่ม `unitId` → เส้นทาง `schedules/{unitId}/{monthId}` |
| User | name+password, role user/admin | เพิ่ม `unitId`, role: `user` / `unit_admin` / `org_admin` |
| **Ownership record** (LWW) | `{slotKey, newOwner, recordedBy, at, _visibility}` | เพิ่ม `unitId` ใน `slotKey`; แลกข้ามหน่วย = record คู่ต่างหน่วย + flag `crossUnit` (unit_admin อนุมัติ) |
| Config | `MONTH_LIST` เดียว | `MONTH_LIST` ต่อ unit |
| Audit | รวมทุกคน | เพิ่ม `unitId` เพื่อ filter/รายงานรายหน่วย |

> **ทำไม LWW เอื้อต่อ multi-unit:** `slotKey` = แถว master ที่นิ่งอยู่แล้ว การเติม `unitId` เข้าไปทำให้ resolver (`currentOwner(slotKey)`) ทำงานแยกหน่วยได้ทันทีโดยไม่ต้องรื้อ chain — แลกข้ามหน่วยก็แค่ 2 record ที่ `slotKey` คนละ unit ผูกด้วย `pairId` เดียวกัน · เรื่อง `at` ควรใช้ **server-stamp ตอน publish** (ไม่ใช่ client clock) เพื่อความถูกต้องของ LWW tie **และ**ความแม่นของ KPI เวลาแลกเวร (ดู `KPI_framework.md` B2)

**Permission model (RBAC):**

| Role | เห็นข้อมูล | แก้ได้ |
|------|-----------|--------|
| `user` (เภสัชกร) | ตารางหน่วยงานตัวเอง | overlay ของตัวเอง (ยก/แลกเวร) |
| `unit_admin` (หัวหน้าเวร/หน่วย) | ทั้งหน่วยงานตัวเอง | อัปโหลดตาราง, ประกาศ, อนุมัติแลกข้ามหน่วย |
| `org_admin` (ฝ่าย/ผู้ดูแลระบบ) | ทุกหน่วยงาน | ทุกอย่าง + KPI dashboard ระดับฝ่าย |

### 3.3 สถาปัตยกรรมเป้าหมาย (แผนภาพ)

```
┌────────────────────────────────────────────────────────────────┐
│  INGESTION (คงไว้บน GAS — จุดแข็ง Workspace integration)          │
│  Excel/Gmail per unit → transform → normalize → เขียน canonical  │
└───────────────────────────────┬────────────────────────────────┘
                                ▼
┌────────────────────────────────────────────────────────────────┐
│  DATA LAYER (managed, multi-unit)                                │
│  Firebase (RTDB→Firestore เมื่อพร้อม) — partition by unitId       │
│  schedules/{unit}/{month}  overlays/{unit}/...  audit/{unit}/...  │
│  Blaze plan : connection/storage ไม่ตัน                           │
└──────────┬──────────────────────────────────┬──────────────────┘
   read ▲   │ write (เฟส 2: ย้ายมา Cloud Functions)                │
        │   ▼                                  ▼
┌───────┴─────────────┐        ┌──────────────────────────────────┐
│  FRONTEND (แยกโมดูล) │        │  ANALYTICS / KPI                  │
│  read Firebase-first │        │  Events → BigQuery/Sheet → Looker │
│  overlay merge       │        │  Studio dashboard (ผู้บริหาร)      │
│  unit-aware routing  │        │  ดู KPI_framework.md               │
└─────────────────────┘        └──────────────────────────────────┘
```

### 3.4 ทางเลือกเทคโนโลยี (Decision Record)

พิจารณา 3 เส้นทาง — เลือก **B** เป็นเป้าหมาย โดยผ่าน A ก่อน:

| ตัวเลือก | สาระ | ต้นทุน/ความเสี่ยง | เหมาะเมื่อ |
|----------|------|-------------------|-----------|
| **A. Harden ของเดิม** | อยู่บน GAS+Sheets+Firebase เดิม แต่เพิ่ม unitId, ขึ้น Blaze, batch write, partition | 🟢 ต่ำสุด — reuse ~100% | เฟสแรก / 2-4 หน่วยงาน |
| **B. Firebase backend** ⭐ | ย้าย write app-logic ไป **Cloud Functions + Firestore + Firebase Auth**; GAS เหลือ ingestion/admin | 🟡 กลาง — write ครั้งเดียว, ได้ concurrency จริง | ทั้งฝ่าย, หลายร้อย-พันคน |
| **C. Full rewrite** | Next.js + Postgres + HIS integration | 🔴 สูง — งานใหญ่, ต้องทีม | เมื่อผูกกับระบบ IT รพ. / HIS จริง |

**เหตุผลที่เลือก B ผ่าน A:**
- **A ให้ผลเร็ว ความเสี่ยงต่ำ** พิสูจน์ multi-unit ได้ก่อนลงทุนใหญ่
- **B แก้คอขวดจริง** (GAS concurrency 30, LockService) ด้วย Firebase Auth + Firestore ที่รองรับผู้ใช้พร้อมกันได้หลักพัน โดย**ไม่ทิ้ง GAS ingestion** ที่เขียนไว้ดีแล้ว
- **C เก็บไว้ทีหลัง** — เปิดทางไว้ แต่ยังไม่จำเป็นจนกว่าจะต้องเชื่อม HIS/eMR ของโรงพยาบาล

---

## 4. Migration Path (แผนย้ายแบบเป็นเฟส)

> หลักการ: **ไม่มี big-bang** — แต่ละเฟสส่งมอบคุณค่าที่วัดได้ และ rollback ได้

### เฟส 0 — Production Hardening (ก่อนขยาย)
*เป้า: ทำหน่วยงานปัจจุบันให้นิ่งและวัดผลได้ ก่อนเพิ่มหน่วยงาน*

- [ ] ปิด test mode (`phxDisableTestMode()`) — ค้างจาก HANDOFF v3.41 🔴
- [ ] ขึ้น Firebase **Blaze plan** + ตั้ง budget alert (กัน connection/quota ตัน)
- [ ] เปิด **KPI instrumentation** ขั้นต้น (ดู `KPI_framework.md` §Quick Wins) — login, active users, swap count, reminder delivery
- [ ] Security & PDPA baseline: ตรวจ access rule Firebase, masking ข้อมูลส่วนบุคคลใน log, กำหนด retention (audit 90 วันมีแล้ว)
- [ ] ลบ dead code ตาม HANDOFF TODO (migration one-shot, Phase 2B) ลดพื้นที่ maintainer

### เฟส 1 — Multi-Unit บนสถาปัตยกรรมเดิม (ตัวเลือก A)
*เป้า: รองรับ 2-4 หน่วยงานนำร่อง พิสูจน์โมเดล unit*

- [ ] เพิ่ม `unitId` ใน data model ทุกชั้น (schedule/user/overlay/audit/config)
- [ ] Firebase path partition ด้วย unit: `schedules/{unitId}/...`
- [ ] RBAC 3 ระดับ (`user`/`unit_admin`/`org_admin`) — ต่อยอดจาก Phase Z C1 role ที่มีแล้ว
- [ ] Frontend unit-aware: เลือก/สลับหน่วยงาน, เห็นเฉพาะที่มีสิทธิ์
- [ ] แลกเวรข้ามหน่วยแบบมีอนุมัติ (`crossUnit` flag + unit_admin approve)
- [ ] นำร่อง 2 หน่วยงาน → เก็บ KPI เทียบ baseline

### เฟส 2 — Backend Modernization (ตัวเลือก B)
*เป้า: แก้คอขวด concurrency รองรับทั้งฝ่าย*

- [ ] ย้าย **auth → Firebase Auth** (เลิก password hash ใน Sheet)
- [ ] ย้าย **write path หนัก → Cloud Functions** (overlay, audit, reminder scheduling)
- [ ] ย้าย data → **Firestore** (query/index/security-rules ดีกว่า RTDB สำหรับ multi-unit)
- [ ] GAS เหลือหน้าที่: **Excel ingestion + Google Workspace integration + งาน admin**
- [ ] แตก `Index.html` เป็นโมดูล (build step) — ลด monolith
- [ ] Reminder ย้ายไป Cloud Scheduler + Functions (หนี trigger-time quota ของ GAS)

### เฟส 3 — Enterprise & Integration (ตัวเลือก C, ถ้าจำเป็น)
*เป้า: ผูกกับระบบโรงพยาบาล*

- [ ] SSO กับบัญชีโรงพยาบาล (แทน/เสริม Google login)
- [ ] เชื่อม HIS/eMR หรือระบบ HR สำหรับ master รายชื่อ/ตำแหน่ง
- [ ] รายงานเชิงบริหารระดับฝ่าย/โรงพยาบาล, data warehouse
- [ ] พิจารณาย้าย hosting ตามนโยบาย IT security ของโรงพยาบาล

---

## 5. Non-Functional Requirements (สำหรับระดับโรงพยาบาล)

| ด้าน | เป้าหมาย | วิธี |
|------|---------|------|
| **ความพร้อมใช้ (Availability)** | ตารางเวรเปิดดูได้ตลอด แม้ Firebase ดับ | multi-source fallback มีแล้ว (Firebase→poll→GAS/Sheet); + เพิ่ม indicator ที่ซื่อสัตย์ (`.info/connected`) + auto-heal key mismatch |
| **ประสิทธิภาพ (Performance)** | โหลดตาราง < 2-3 วิ | Firebase-first + LWW resolve/merge บน client (มีแล้ว) |
| **ความปลอดภัย (Security)** | เข้าถึงตามบทบาท | RBAC + Firebase security rules ต่อ unit |
| **ความเป็นส่วนตัว (PDPA)** | คุ้มครองข้อมูลบุคคล | masking, retention policy, ขอความยินยอม, สิทธิ์ลบข้อมูล |
| **ตรวจสอบย้อนหลัง (Auditability)** | ทุกการแก้มีร่องรอย | audit log มีแล้ว — เพิ่ม unitId + รายงาน |
| **บำรุงรักษา (Maintainability)** | เพิ่มหน่วยงานไม่ต้องแก้โค้ด | config-driven units, แตกโมดูล frontend |
| **ต้นทุน (Cost)** | คาดการณ์ได้ | Firebase Blaze + budget alert; ประเมินตามจำนวนผู้ใช้ |

---

## 6. ความเสี่ยงและการรับมือ (Risk Register)

| ความเสี่ยง | ผลกระทบ | การรับมือ |
|-----------|---------|-----------|
| พึ่งพา solo developer | สูง | เอกสารนี้ + FUNCTION_INDEX + HANDOFF; แตกโมดูลลด bus factor |
| GAS quota ตันเมื่อคนเยอะ | สูง | เฟส 2 ย้าย write ออกจาก GAS; ระหว่างนั้น batch + Firebase-first |
| **Firebase reliability / key mismatch** ("Firebase ดับ") | กลาง–สูง | มี GAS fallback แล้ว; + server auto-heal (`syncMonthToFirebase` ตอน fallback) + key ที่ deterministic ต่อ unit (เลิก label-based) |
| **LWW tie / clock skew** | กลาง | ใช้ **server-stamped `at`** ตอน publish; option: warn ถ้า 2 record ห่าง < N นาที (ดู DESIGN_LWW §open items) |
| ต้นทุน Firebase พุ่ง | กลาง | Blaze + budget alert; partition ลด read ที่ไม่จำเป็น |
| PDPA / ข้อมูลรั่ว | สูง | security review, masking, access rule, retention |
| ต้าน adoption จากผู้ใช้ใหม่ | กลาง | นำร่องทีละหน่วย, วัด adoption KPI, ปรับก่อนขยาย |
| นโยบาย IT รพ. (ต้อง on-prem/HIS) | กลาง | เฟส 3 เปิดทางไว้; คุยกับ IT ตั้งแต่เนิ่นๆ |

---

## 7. สิ่งที่ต้องตัดสินใจ (Open Questions สำหรับผู้บริหาร/IT)

1. **ขอบเขตหน่วยงาน** — ฝ่ายเภสัชกรรมมีกี่หน่วยงาน/จุดจ่ายยา ที่จะเข้าระบบ? ลำดับนำร่อง?
2. **บัญชีผู้ใช้** — ใช้ Google login ต่อ หรือต้องผูกกับ AD/SSO ของโรงพยาบาล?
3. **นโยบาย IT/Security** — โรงพยาบาลอนุญาต cloud (Firebase/Google) หรือต้อง on-prem?
4. **เจ้าของข้อมูล master** — รายชื่อ/ตำแหน่งเภสัชกร มาจาก HR/HIS หรือ maintain เองในระบบ?
5. **งบและทีม** — มีงบ Firebase Blaze + คนดูแลต่อเนื่องหรือไม่ (ลด solo dependency)?

---

## 8. อ้างอิงในโค้ด (สำหรับทีมพัฒนา)

- Ingestion: `code.js` → `transformBlobData_`, `writeScheduleToSheet_`, `uploadLocalFile`
- **LWW Ownership / mutation model:** `DESIGN_LWW_ownership_v3.44.md` (สเปค), `Phase_PathB_Global.js` (`_phxApplyOverlaysGlobally` → rewrite เป็น group-by-slot + latest), frontend `LWW._resolveKey`/`LWW.ledger`
- **Draft/Publish + cancel governance:** `_visibility` field, `phxPushActions`/`phxRemoveAction(...,actingAs)` (`Phase_Z_B3_Sync.js`), `phxVerifyPassword` (`Phase_Z_B1_Auth.js`), audit `cancel_published`/`admin_cancel_published`
- **Firebase resilience:** `connRadar` + `fetchViaGAS`/`fetchMonthData` (`Index.html`), `syncMonthToFirebase` (`code.js`) — ดู `HANDOFF_Firebase_connRadar_2026-07-09.md`
- Auth/Role: `Phase_Z_B1_Auth.js`, `Phase_Z C1 role.js`
- Nicknames (identity): `Phase_Z_Nicknames.js`, `nkQuickEdit` (`Index.html`)
- Audit: `Phase_G_AuditLog.js` (`phxLogAudit`)
- Notification: `Phase_Z_B2_BackupEmail.js` (reminder), `Phase_F1_Broadcast.js`, `Phase_F2_LINE.js`
- Calendar: `Phase2C.js`
- Instrumentation ที่มีอยู่: `logStatisticsToSheet_`, `logDeviceType` (`code.js`), broadcast read-receipts (`Phase_F1`)

> ดู `FUNCTION_INDEX.md` (auto-generated) สำหรับ index ครบทุก function
> ดูโมเดล mutation ล่าสุดที่ `DESIGN_LWW_ownership_v3.44.md` และ session ล่าสุดที่ `HANDOFF_v3.45_session_2026-07-11.md`
