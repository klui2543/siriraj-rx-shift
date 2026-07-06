# HANDOFF v3.41 — Path B v2 + Cross-Viewer Parity + Cache

**วันที่:** 5 กรกฎาคม 2569
**สถานะ:** 🟢 **Overlay ครบทุก viewer แล้ว** — code พร้อม push (worktree `clever-wilbur-8e3d5f`)

---

## 🎯 สิ่งที่ session นี้ทำสำเร็จ

**ปิดบั๊กจาก v3.40 ครบชุด:**

1. **Chevron ▶ / วงกลมสี ● / เส้นขีดฆ่า หายไปทั้งระบบ** — เพราะ v3.40 rewrite `rawData.name` → OverlayManager หา row เดิมไม่เจอ
2. **แถบกรอง overlap/adjacent หาย** — `ownEffective` filter หา viewer's shift ไม่เจอ (โดนเปลี่ยนชื่อออก)
3. **Anonymous/non-owner ยังไม่เห็น chevron/dot** — v3.41 patch แรกใช้ display filter แทน login identity → filter overlays ผิด
4. **จำนวน shift ที่คนอื่นเห็นไม่เท่ากับเจ้าของ** — OverlayManager.getActions คืน `[]` สำหรับ non-owner → ไม่มี ghost rows
5. **Firebase-first delay 1-2 วิ** — Frontend เห็นตารางดิบก่อน chevron ค่อยโผล่ทีหลัง

**ก่อน:** anonymous เห็นแต่ตารางดิบ + คนที่ล็อกอินคนอื่นก็เห็นเหมือน anonymous
**หลัง:** ทุก viewer (anonymous / คนอื่น / เจ้าของ) เห็น **chevron + วงกลมสี + จำนวน shift** เหมือนกันหมด ✅

---

## 🏢 บั๊กจริง คืออะไร (metaphor)

**ตัวละคร:**
- **rawData** = แผ่นตารางเวรที่แขวนไว้ (คงที่ ไม่มีใครแก้)
- **OverlayManager** = แม่บ้านส่วนตัวของ User ที่ล็อกอิน — มีโพสต์อิท + ธง ▶ ประจำ user
- **pathBOverlays** = พนักงานประกาศกลาง — รู้ประวัติทุก swap ในเดือน (ทุกคนถามได้)
- **P2B.boundName** = บัตรพนักงาน (ใครล็อกอินตอนนี้)
- **getCurrentUser()** = ชื่อที่ถูกเลือกอยู่ในกล่องกรอง (แค่ display state)

**บั๊กครั้ง 1 (v3.40):** พนักงานเดินไปเขียนทับตาราง → แม่บ้านหาชื่อเดิมไม่เจอ → โพสต์อิทหาย

**บั๊กครั้ง 2 (v3.41 rev 1):** แม่บ้านถามผิดคน — "ถ้าลูกค้าเปิดหน้าใครอยู่ ให้ซ่อนโพสต์อิทของคนนั้น" (ใช้ `getCurrentUser` = display filter) → ผลคือ **ดูตารางของคนที่แลกเวร โพสต์อิทของคนนั้นหายหมด**

**บั๊กครั้ง 3 (count mismatch):** พนักงานประกาศกลางไม่ยอมสร้าง "แถวเงา" ให้คนที่ไม่ใช่ตัวเอง — ผลคือ Test SiUU กรองดู ณรพล เห็น 11 เวร แต่ ณรพล ล็อกอินเห็น 13 เวร (มี ghost 2 อัน)

---

## 🔧 v3.41 architecture (สรุป)

```
                    ┌──────────────────────────────────┐
                    │  Backend (code.js)               │
                    │  getScheduleData:                │
                    │    schedule = master ดิบ (ไม่แตะ) │
                    │    _pbOverlays = raw overlays    │
                    └──────────────────────────────────┘
                                    │
                                    ▼
    ┌──────────────────────────────────────────────────────┐
    │  Frontend (Index.html)                               │
    │                                                      │
    │  Firebase (0.5s)  ─┬─→ handleDataReceived           │
    │                    │      → rawData = master        │
    │                    │      → triggerUpdate           │
    │                    │                                 │
    │  GAS PB (1s) ─────┬┴─→ pathBOverlays = overlays     │
    │  (parallel)       │      → localStorage cache       │
    │                   │      → triggerUpdate            │
    │                   ▼                                  │
    │  Cache seed  ─────→ pathBOverlays instant           │
    │  (2nd load)                                          │
    │                                                      │
    │  renderTable:                                        │
    │    _usedMap    = OverlayManager (own actions)       │
    │    _pbUsedMap  = PBOverlays (filter by P2B.boundName)│
    │    _used       = _usedMap[key] || _pbUsedMap[key]   │
    │                                                      │
    │  getActions(mid, viewerName):                        │
    │    if own → localStorage                            │
    │    else   → pathBOverlays fallback (→ ghost rows!)  │
    └──────────────────────────────────────────────────────┘
```

---

## 🔧 ไฟล์ที่แตะ

### `code.js` (backend, 1 จุด)
| Line | เปลี่ยน |
|------|--------|
| [235-260](code.js:235) | ลบ `schedule = _phxApplyOverlaysGlobally(...)` → return `_pbOverlays: pbOverlays` |

### `Index.html` (frontend, 9 จุด)

| Line | เปลี่ยน |
|------|--------|
| [1964](Index.html:1964) | Global `let pathBOverlays = []` |
| [2337](Index.html:2337) | **`OverlayManager.getActions` fallback to pathBOverlays** สำหรับ non-owner (แก้ count mismatch + ghost rows ครบ) |
| [2463](Index.html:2463) | `_pbGetLoggedInName()` helper — ใช้ `P2B.boundName` แทน `getCurrentUser` |
| [2472](Index.html:2472) | `PBOverlays` module — `getUsedMap` / `buildChain` / `getChainEndpoints` |
| [2797](Index.html:2797) | Unified end message: `"ปัจจุบันเวรนี้อยู่กับ: {name}"` (buildTimelineHTML) |
| [2829](Index.html:2829) | `_buildPBTimelineHTML` — format ตรงกับ buildTimelineHTML 100% (ยกเลิก access gate) |
| [3888](Index.html:3888) | `handleDataReceived` ดูดจาก `res._pbOverlays` ด้วย (GAS fallback path) |
| [4003](Index.html:4003) | Seed `pathBOverlays = _pbLoadCached(monthId)` — chevron ทันทีจาก cache |
| [4030](Index.html:4030) | ย้าย `fetchPathBOverlays()` **ออกจาก** Firebase callback → parallel |
| [4059](Index.html:4059) | `fetchPathBOverlays` + `_pbLoadCached` / `_pbSaveCached` — save cache หลัง success |
| [4297](Index.html:4297) + [4489](Index.html:4489) | `_used = _usedMap[key] \|\| _pbUsedMap[key]` (table + calendar) |
| [2724](Index.html:2724) | `buildTimelineHTML` dispatcher — non-found action → `_buildPBTimelineHTML` |

---

## 🚨 4 บั๊กจริงของ patch เก่าที่ v3.41 แก้

| # | บั๊ก | สาเหตุ | แก้ที่ไหน |
|---|------|--------|----------|
| 1 | Chevron/dot/strike หาย | v3.40 rewrite rawData → makeShiftKey mismatch | code.js:235 — ไม่ rewrite แล้ว |
| 2 | Anonymous/other-viewer ไม่เห็น overlay | ใช้ `getCurrentUser` (display filter) filter PB overlays | Index.html:2463 — ใช้ `P2B.boundName` |
| 3 | Count mismatch (11 vs 13) | `getActions` คืน `[]` สำหรับ non-owner → ไม่มี ghost | Index.html:2337 — fallback pathBOverlays |
| 4 | Firebase delay 1-2 วิ | Sequential fetch: Firebase → GAS | Index.html:4030 — parallel + localStorage cache |

---

## 🚀 Deployment State

- ⚠️ **ยังไม่ push** — code อยู่ใน worktree `clever-wilbur-8e3d5f`
- คำสั่ง push:
  ```
  clasp push
  ```
  แล้ว Apps Script Editor → Deploy → Manage → Edit → New version → Deploy
- ⚠️ **`PHX_TEST_DOMAIN=gmail.com` ยังอยู่** — ต้อง disable ก่อน rollout 300 คน (ยกจาก HANDOFF_v3.40)

---

## 🧪 วิธีเช็คว่าทำงาน (3 นาที)

**Test 1 — Chevron ทุก viewer**
1. เปิด incognito → เลือก มิ.ย. 2569 → หาเซลล์ที่มี swap → **ควรเห็น ▶ + ●**
2. ล็อกอิน user อื่น (เช่น Test SiUU) → filter ชื่อคนที่แลกเวร → **ควรเห็น ▶ + ●**
3. คลิก ▶ → เห็นเชนเต็มพร้อม timestamp

**Test 2 — Count parity**
1. ล็อกอิน ณรพล → ดูเดือน มิ.ย. 2569 → จำจำนวน (เช่น 13 เวร)
2. Logout → ล็อกอิน Test SiUU → filter "ณรพล" → **ควรเห็นจำนวนเท่าเดิม (13)**

**Test 3 — Delay + cache**
1. Ctrl+Shift+Del → ลบ localStorage → refresh → **chevron ควรมาเร็วขึ้น** (parallel fetch)
2. เปลี่ยนเดือน แล้วเปลี่ยนกลับ → **chevron มาทันที** (cache)

**Test 4 — End message ตรงกัน**
- ล็อกอินคนแลกเวร → คลิก ▶ ที่เวรที่ยกออก → เห็น "ปัจจุบันเวรนี้อยู่กับ: [ชื่อคนล่าสุด]"
- Anonymous → คลิก ▶ ที่เซลล์เดียวกัน → เห็นข้อความเดียวกัน format เดียวกัน

---

## 📋 TODO ที่ค้างไว้ (เรียง priority — ยกจาก v3.40 ที่ยังไม่ทำ)

| ลำดับ | เรื่อง | ทำไมสำคัญ | ที่ไหน |
|-------|-------|----------|--------|
| 🔴 **HIGH** | `phxDisableTestMode()` | ก่อน rollout 300 คน — ตอนนี้ยัง test mode | `Phase_Z_C2_Helpers.js:492` |
| 🟡 Med | Ghost rows สำหรับคนที่ถูกยกเวรให้ (bilateral) | ถ้า A ยกเวรให้ B แต่ B ไม่ได้กด action เอง — B ไม่เห็นเวรที่รับใน filter ของตัวเอง | ต้องทำ bilateral sync ใน `_getExcluding` หรือขยาย `buildGhostRows` |
| 🟡 Med | เคลียร์ Schedule tabs ซ้ำ | ม.ค./พ.ค./มิ.ย. มี 3 tabs ต่อเดือน | Schedule sheet |
| 🟢 Low | Push overlays ไป Firebase | จะได้ไม่ต้องพึ่ง GAS + cache (0 delay ทุกครั้ง) | pushToFirebase_ + swap action hook |
| 🟢 Low | ลบ dead code | `canSeeFullChain` / `getChainEndpoints` ใน PBOverlays ไม่มีใครใช้แล้ว | Index.html:2517-2547 |
| 🟢 Low | Sunset Phase 2B | 1000 บรรทัดที่ทำงานแต่ปลายทางว่าง | Phase2B.js |

---

## 🎓 บทเรียนที่ session นี้ได้ (สำหรับ Claude คนต่อไป)

**บั๊กใหม่ที่ต้องระวัง:**
- **`getCurrentUser()` ≠ Login identity** — `getCurrentUser` คือ **display filter** (search box narrow → 1 name); ถ้าจะ filter อะไรที่ผูกกับ login → ใช้ `P2B.boundName` เสมอ
- **Write tool convert escape sequences** — ถ้าเขียน regex `[  ]` ผ่าน Write tool → กลายเป็น raw chars → JS parser fail (line separator)
- **Anonymous ต้องพึ่ง pathBOverlays ล้วน** — ไม่มี P2B, ไม่มี local OverlayManager storage

**Klui's decisions style (updated):**
- Klui จะ push จาก **โปรเจกอื่น**ขนานไปด้วย — code.js อาจถูก overwrite ระหว่าง session (ต้องยึด paste ของ Klui เป็น source of truth เสมอ ถ้ามี paste)
- ชอบ pattern **"ทุกคนเห็นเหมือนกัน"** > แบ่งชั้น access (session นี้ยกเลิก access gate ที่ตัวเองสั่งไว้ตอนแรก)
- ชอบเห็น **before/after tables** ในสรุป
- Language: "อยากให้เป็นคำว่า X" = user wants exact string X to appear literally

**Architecture patterns:**
- **Frontend Firebase-first แต่ต้อง fetch GAS ด้วย** — Firebase มีแค่ master, overlays ต้องดึงต่างหาก
- **Parallel > Sequential** — fetchPathBOverlays ยิงพร้อม Firebase ลด delay half
- **localStorage cache = instant on repeat** — key = `siriraj_pb_overlays_<monthId>`
- **`OverlayManager.getActions` เป็น facade** — logged-in own → local; non-owner → pathBOverlays fallback (ทำให้ทุก consumer ทำงานอัตโนมัติ: buildGhostRows, getUsedMap, buildTimelineHTML)

---

## 📁 Reference Files

**Memory (สำหรับ Claude คนต่อไปอ่าน):**
- `C:\Users\Klui\.claude\projects\C--Users-Klui-siriraj-rx-shift\memory\`
  - `MEMORY.md` — index
  - `project_path_b_fix.md` — v3.40 (obsolete — ควร update เป็น v3.41)
  - `feedback_communication_style.md` — metaphor + simple language
  - `feedback_visualizations.md` — diagrams เรียบง่าย

**Diagnostic tools ใน GAS:**
- `testGlobalApply_endToEnd()` — [Phase_PathB_Global.js:254](Phase_PathB_Global.js:254) — verify backend overlays
- `phxGetAllActiveOverlaysForMonth('m_มิถุนายน_2569')` — raw overlays fetch

**Console diagnostic (frontend):**
```js
console.log('overlays:', pathBOverlays.length);
console.log('logged-in:', typeof P2B !== 'undefined' && P2B.boundName);
console.log('pbUsedMap keys:', Object.keys(PBOverlays.getUsedMap(_pbGetLoggedInName())).length);
```

---

## 🔗 Key Numbers ที่ต้องจำ

- **Sheet ID:** `1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM`
- **Firebase:** `siriraj-rx-shift-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Test data:** มิ.ย. 2569 มี 19 overlays → 18 shifts เปลี่ยนเจ้าของ
- **Cache key prefix:** `siriraj_pb_overlays_<monthId>` (localStorage)
- **Build:** v3.41 (worktree `clever-wilbur-8e3d5f` — ยังไม่ commit + push)
- **User count:** ~300 (ระวังทุก deploy)

---

## 💡 ถ้าอนาคตอยาก optimize เพิ่ม

**Delay ครั้งแรก (~1 วิ) ยังมี** เพราะ GAS fetch ยังต้องรอ
- **Approach A:** Push overlays ไป Firebase ทุกครั้งที่ swap → Frontend รับ overlay ทันทีจาก Firebase realtime → **0 delay**
- **Trade-off:** ต้องแก้ SYNC layer + สร้าง Firebase listener สำหรับ `/overlays/monthId`
- **ประโยชน์:** Real-time — ถ้า Peter swap ตอนนี้ ทุกคนที่กำลังเปิดหน้าจะเห็นภายใน 200ms

Session นี้เลือกทาง **parallel + cache** (คู่ขนาน + localStorage) — ง่ายกว่า approach A แต่ delay ครั้งแรกยัง ~1วิ

---

**สรุป:** เป้าหมายหลักของ session นี้ (chevron + count parity + delay) **ปิดครบ** — ที่เหลือคือ Klui push แล้วทดสอบตาม Test 1-4
