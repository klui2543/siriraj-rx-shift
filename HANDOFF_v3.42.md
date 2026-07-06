# HANDOFF v3.42 — Bilateral Overlay + Test Harness + Draft/Publish design

**วันที่:** 5 กรกฎาคม 2569
**Worktree:** `gifted-newton-b58be6`
**สถานะ:** 🟢 **14 fixes complete, 31 tests passing, พร้อม push**

---

## 🎯 สิ่งที่ session นี้ทำสำเร็จ

**ปิด bilateral overlay bugs ครบ 14 อัน** (v3.42.0 → v3.42.11)

พื้นที่ที่แก้:
- **Bilateral ghost synthesis** — คนที่รับเวรแต่ไม่ได้กด action เอง เห็นเวรใน filter ของตัวเอง
- **Chain resolver** — เดินย้อน `_g_ovl_xxx` ผ่าน give / add / swap ทุกทิศทาง (รวม swap partner side)
- **Timeline actor prefix** — บอกว่า "ณรพล ยกให้ นภักษร" ไม่ใช่แค่ "ยกให้ นภักษร"
- **Count/Export** — ไม่รวม struck rows (แก้ที่ 13 sites)
- **Race conditions** — month switch stale-response, chevron content rebuild
- **Chevron aid collision** — row-hash suffix แยก DOM ให้ unique
- **Room view no-filter** — เห็นเจ้าของปัจจุบัน (bilateral ghosts จาก recipients ทุกคน)
- **Pass reorder** — bilateral ทำก่อน own actions เพื่อ chain-through-swap ทำงานได้

---

## 📋 Fix ทั้ง 14 อัน

| # | Version | Fix | ที่ไหน |
|---|---------|-----|--------|
| 1 | v3.42.0 | Bilateral ghost synthesis | buildGhostRows Pass 0 (was 1.5) |
| 2 | v3.42.1 | Chain resolver `_g_ovl_xxx` → real | `_resolveToReal` helper |
| 3 | v3.42.2 | Timeline actor prefix | `_buildPBTimelineHTML` |
| 4 | v3.42.3 | ไม่ exclude logged-in user's overlays | PBOverlays.getUsedMap (removed `_getExcluding`) |
| 5 | v3.42.4 | Bilateral swap color dot | `PBOverlays.getSwapColor` + 2 render fallbacks |
| 6 | v3.42.5a | Chevron content rebuild every expand | toggleTimelineInline |
| 7 | v3.42.5b | Month stale-response guard | fetchPathBOverlays |
| 8 | v3.42.6 | False conflict on bilateral ghost | Pass 2 excludes PB-struck rows |
| 9 | v3.42.7 | Room view no-filter shows recipients | getEffectiveData multi-recipient ghost |
| 10 | v3.42.8 | Chevron aid collision (row-hash suffix) | `_rowAidHash` helper + suffix in aid |
| 11 | v3.42.9 | Timeline endpoint by pbSide (actor/partner) | data-tl-pbside DOM propagation |
| 12 | v3.42.10 | Count/Export uses combined used map | `_combinedUsedMap` helper (13 sites) |
| 13 | v3.42.11 | Chain-through-swap + Pass reorder | `_resolveToReal` takes consumerVN; Pass 0 before Pass 1 |

---

## 🚀 Deployment State

- ⚠️ **ยังไม่ push** — code อยู่ใน worktree `gifted-newton-b58be6`
- คำสั่ง push:
  ```
  clasp push
  ```
  แล้ว Apps Script Editor → Deploy → Manage → Edit → New version → Deploy
- ⚠️ **`PHX_TEST_DOMAIN=gmail.com` ยังอยู่** — ต้อง disable ก่อน rollout 300 คน (ค้างจาก v3.41)

---

## 🧪 Automated Test Harness

**ไฟล์:** `C:\Users\Klui\AppData\Local\Temp\claude\C--Users-Klui-siriraj-rx-shift--claude-worktrees-gifted-newton-b58be6\b937c446-9889-4b80-b3cd-25426c7dddd6\scratchpad\pb-tests.js`

**วิธีใช้:**
1. เปิด webapp deployed
2. F12 → Console → paste ไฟล์ทั้งฉบับ
3. `PBTest.runAll()`
4. **`PBTest.restore()`** — คืนข้อมูลจริง (สำคัญ)

**Result:** 31/31 PASSED

10 scenarios ครอบคลุม:
- Chain 4-hop (A→B→C→D→E all-give)
- Swap ในกลาง chain (give→swap→give)
- Bilateral recording variants (only-A / only-B / both dedup)
- Multi-swap colors distinct + deterministic
- Swap partner-side endpoint (v3.42.9 regression)
- Circular chain safety (A→B→A, no infinite loop)
- Room view no-filter (all recipients get ghosts)
- Combined used map union
- Ghost NOT flagged overlap with struck row
- Color consistency across viewers

**Custom test API:**
```js
PBTest.scenarios.myCase = function() { /* use pathBOverlays, rawData, assert */ };
PBTest.scenarios.myCase();
```

---

## 🎨 Design: Next Session (Phase A — Draft/Publish + Retro Chain)

**Reason:** Klui reported that real-world swaps happen offline. Klui rejected small fix (partnerName override) and chose combined Option 2+3:
- **Draft/Publish** — สมุดส่วนตัว, เลือก share บาง overlay
- **Retro multi-hop chain** — บันทึกย้อนหลัง A→B→C→D ในครั้งเดียว

**Data model additions (proposed):**
```js
{
  ...existing,
  _visibility: 'draft' | 'public',   // default 'draft'
  _retroBy: '<recorder name>',       // if not viewerName
  _retroAt: '<ISO ts>'
}
```

**Phase A tasks (~6.5 hrs):**

| Task | ชม |
|---|---|
| `_visibility` field + SYNC gating | 1 |
| Publish/Unpublish button per overlay | 1.5 |
| Visual markers (dashed=draft, solid=public) | 0.5 |
| Chain builder UI (retroactive) | 3 |
| 🔄 `_retroBy` badge on timeline | 0.5 |

**Open questions to answer at start of next session:**
1. Middle hops: always 'give' or per-hop choice? (recommend: give-only)
2. Retro chain: target shift only or both swap sides? (recommend: target only)
3. Retro permission: everyone or admin only?
4. Conflict when middle person later records: dedupe rule
5. Migrate existing overlays: treat all as `public`?

**Details in memory:** `memory/project_draft_publish_workflow.md`

---

## 🧪 Manual Test Checklist (Klui — before rollout)

- [ ] `clasp push` + New deploy
- [ ] Test v3.42.11 fixes end-to-end:
  - [ ] Filter ณัชชพล → เห็น 05/06 O11 ขีดฆ่า (bilateral strike) ✓
  - [ ] Filter อสมาภรณ์ → count = 8 (ไม่ใช่ 9), NMS-24 ghost ไม่แดง ✓
  - [ ] Room 103 + 01/07 → เห็นทั้ง อสมาภรณ์ O11 struck + ณรพล O11 ghost ✓
  - [ ] Timeline O11 ของ อสมาภรณ์ → "ปัจจุบันอยู่กับ ณรพล" ✓
  - [ ] Chevron 2 อันบนแถวเดียวกัน (swap actor + partner) → คลิกอันไหนเปิดอันนั้น ✓
- [ ] Export PDF/PNG/ICS → ไม่รวมเวรที่ struck
- [ ] Calendar view → 01/07 มี NMS-24 (ghost, ไม่ struck) แทน O11 struck
- [ ] Load `pb-tests.js` → `PBTest.runAll()` → 31/31 PASSED
- [ ] `PBTest.restore()`

---

## 📁 Files ที่แก้ session นี้

- `Index.html` — buildGhostRows + PBOverlays + renderTable + renderCalendar + timeline + getEffectiveData + 13 export sites + helpers
- (No backend changes — code.js from v3.41 still current)

## 📁 Files ที่สร้างใหม่ session นี้

- `HANDOFF_v3.42.md` (this file)
- `scratchpad/pb-tests.js` (test harness)
- `memory/project_draft_publish_workflow.md` (Phase A design)
- `memory/project_path_b_fix.md` (updated — +v3.42.0 through v3.42.11)

---

## 💡 Deferred Items (สำคัญ ตามลำดับ)

| Priority | Item | Est |
|----------|------|-----|
| 🔴 HIGH | `phxDisableTestMode()` before 300-user rollout | 5 min |
| 🔴 HIGH | Firebase reliability investigation | ? |
| 🟡 MED  | Phase A: Draft/Publish + Retro chain | 6.5 h |
| 🟢 LOW  | Push overlays realtime to Firebase (from v3.41 handoff) | ~3 h |
| 🟢 LOW  | Remove dead code (PBOverlays.canSeeFullChain, getChainEndpoints firstPerson) | 30 min |
| 🟢 LOW  | Sunset Phase 2B | 2 h |

---

## 🎓 บทเรียนสำหรับ Claude คนถัดไป

**Klui's decision style ที่เห็นชัดใน session นี้:**
- ชอบ **metaphor** (สายพาน, ตู้ประกาศ, เลขาที่ขี้เกียจ, พนักงานประกาศกลาง)
- ชอบ **before/after table** ในสรุป
- OK ให้ Claude ตัดสิน trade-off เอง — เชื่อใจ recommendation
- **จำ pattern "ทุกคนเห็นเหมือนกัน"** (จาก v3.41 memory) — ยังยึดใน v3.42 (ไม่มี access gate)
- Klui ระวัง 300 users มาก — pref rollback ถ้าไม่แน่ใจ
- ตอนนี้ Klui = admin คนเดียวใช้จริง → trust model ยืดหยุ่นได้

**Architecture invariants ที่ห้ามละเมิด (จาก v3.41):**
- **Never rewrite rawData** — makeShiftKey จะ mismatch → chevron/dot/strike หาย
- **Filter pathBOverlays โดยใช้ `P2B.boundName`** ไม่ใช่ `getCurrentUser()`
- **OverlayManager.getActions fallback ต้องมี** — ghost row, usedMap, timeline พึ่งอยู่

**Architecture ที่ session v3.42 เพิ่ม:**
- **buildGhostRows Pass ordering:** Pass 0 (bilateral) → Pass 1 (own) → Pass 2 (conflict). Reorder ห้าม.
- **`_resolveToReal(key, consumerVN)`** — chain walker. ต้องส่ง consumerVN สำหรับ swap parent
- **`_combinedUsedMap(mid, name)`** — filter/count sites ใช้อันนี้แทน OverlayManager.getUsedMap
- **`_rowAidHash(shiftKey, name)`** — chevron aid unique
- **DOM attribute chain:** `data-tl-toggle`, `data-tl-pbside` — event → toggle → build → endpoints

**Test infrastructure:**
- `pb-tests.js` เป็น manual test suite (paste in console)
- ถ้าเพิ่ม feature → เพิ่ม scenario ใน PBTest.scenarios
- ถ้ามี regression → run pb-tests.js เห็นเลย

---

## 🔗 Key Numbers ที่ต้องจำ

- **Sheet ID:** `1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM`
- **Firebase:** `siriraj-rx-shift-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Build:** vY3.42.11
- **Test data:** มิ.ย. 2569 (19 overlays, 18 shifts เปลี่ยนเจ้าของ)
- **User count:** ~300 (ระวังทุก deploy)
- **Cache key prefix:** `siriraj_pb_overlays_<monthId>` (localStorage)

---

**สรุป:** Bilateral overlay ครบเซ็ต, test harness พร้อม, design Phase A ล็อกไว้ในความจำ. Klui push แล้ว smoke test → พร้อม session ถัดไปทำ Draft/Publish
