# HANDOFF v3.43 — Draft/Publish เสร็จ + พลิกโจทย์เป็น LWW ownership

**วันที่:** 6 กรกฎาคม 2569
**Worktree:** `laughing-raman-e52a80` · branch `claude/laughing-raman-e52a80`
**สถานะ:** 🟡 v3.43 เขียนเสร็จ (uncommitted, ยังไม่ deploy) + มีดีไซน์ใหม่ LWW รอ Klui เลือกทาง

---

## 🎯 session นี้ทำอะไร

**ครึ่งแรก — ปิดงาน Phase A (Draft/Publish + Retro)**
พบว่า session ก่อนทิ้ง WIP ~90% ไว้ (uncommitted) — handoff v3.42 เขียนว่า "ยังไม่เริ่ม" แต่โค้ดอยู่ในเครื่องแล้ว
เลย review + เติมให้ครบตาม feedback ของ Klui:

| งาน | ผล |
|---|---|
| Review หา bug | เจอ 5 แก้ 3 (perf `_isActionDraft`, race retro, draft มองไม่เห็น) |
| ปุ่ม 🌐 ข้างดินสอ | inline ในแถว ขึ้นเฉพาะ draft ตัวเอง (`_draftBtnShown` dedup 1 ปุ่ม/action) |
| Retro = draft ก่อน | บันทึกเป็นร่าง กด 🌐 ค่อยเผยแพร่ + projection mirror ให้ preview |
| Override | checkbox "ไม่รู้คนก่อนหน้า" → เลือกคนแรกกลางเชน + `_retroFinal` ปักหมุด 🔒 |

ผ่าน `node --check` ครบ 9 script blocks + backend

**ครึ่งหลัง — Klui พลิกโจทย์**
Klui บอก "เราตั้งโจทย์ผิด" — ไม่มีใครอยากรู้ลำดับ A→B→C อยากรู้แค่ **ตอนนี้ใครถือ**
เสนอโมเดล **Last-Write-Wins (LWW):** คนที่ถูกบันทึกล่าสุด = เจ้าของ + ลงชื่อ login + โน้ตรับจากใคร + เก็บ log สืบความจริง
→ โมเดลนี้จะ **แทนที่** ส่วน retro-chain ของ v3.43 (chain builder, `_g_` resolver, mirror, `_retroFinal`)

---

## 🔑 จุดสำคัญที่ค้นพบ (linchpin ของ LWW)

**คีย์ระบุเวรมีอยู่แล้ว ไม่ต้องคิดใหม่** — master เป็น immutable (Storage v3) แต่ละแถวคีย์นิ่ง
`makeShiftKey` = `วันที่|ตำแหน่ง|ชื่อเดิม|เวลา` เพราะ "ชื่อเดิม" ไม่เปลี่ยน
→ ทุก ownership record ชี้ที่ **แถว master เดิม** (เหมือนเลขที่นั่งโรงหนัง) ไม่ต้องต่อโซ่ `_g_`
→ แก้ปัญหา "ตำแหน่งเสริมซ้ำ" ได้ฟรี (แต่ละคนมีแถว master ของตัวเอง)

`shift_id` ใน master = `base64(date+pos+name)[:15]` ก็ name-derived เหมือนกัน (ใช้แทนกันได้ แต่ frontend ใช้ `makeShiftKey` อยู่แล้ว)

---

## ⚖️ การตัดสินใจที่ค้าง (ต้องเคาะก่อนโค้ดต่อ)

**สเปคเต็มอยู่ที่ [`DESIGN_LWW_ownership_v3.44.md`](DESIGN_LWW_ownership_v3.44.md)**

**ขอบเขต A vs B (ยังไม่เลือก):**
- **A — LWW แค่ retro, เก็บ engine เดิม:** เสี่ยงต่ำ ทำเร็ว **แต่มีรอยต่อ** (2 กลไกชนกันเมื่อเวรเดียวโดนทั้ง in-app + retro) + หนี้ทางเทคนิค
- **B — ยกเครื่องทั้งหมดเป็น LWW:** สะอาดสุด ลบโค้ดซับซ้อนได้เยอะ **แต่รื้อ core render** ที่เพิ่งแก้ 14 บั๊ก → เสี่ยง 300 คน
  - de-risk: สร้าง resolver ใหม่คู่ขนาน → เทียบผลกับของเก่าด้วย `pb-tests.js` → สลับหลัง flag → เก็บโค้ดเก่า 1 รอบ
- **ความเห็น Claude:** เชียร์ **B แบบค่อยเป็นค่อยไป** (A เป็นทางลัดที่ต้องรื้อทีหลังอยู่ดี) — Klui ยังไม่ตัดสิน

**คำถามย่อยที่ยังไม่ตอบ (ในสเปค):**
1. `at` ใช้เวลา client (clock skew) หรือ server-stamp ตอน publish (ปลอดภัยกว่าตอน tie)
2. บันทึกชนกัน: latest-wins ล้วน หรือ warn ถ้า 2 records ห่างกัน < N นาที
3. Migration: overlay เก่า (`_g_` โซ่) → flatten เป็น record เดียว/slot ตอนอ่าน
4. Swap: เก็บลูกโป่งสีคู่ไหม (pairId ทำได้)

---

## 🚦 ทำอะไรต่อ (next session)

1. **ให้ Klui เลือก A หรือ B** (ถ้ายังไม่เลือก — เสนอร่าง "แผน B แบบสเต็ป" ให้ดูก่อน)
2. ถ้า **B**: เขียน LWW resolver คู่ขนาน → extend `pb-tests.js` เทียบ current-owner ทุกเวร → migration → สลับหลัง flag
3. ถ้า **A**: ทำฟอร์ม "รับโอน" (1 record) + LWW resolver แคบ + กติกาเชื่อมกับ engine เดิม
4. **ตัดสินใจชะตากรรม v3.43 retro-chain code** — ถ้าไป LWW ต้องรื้อ chain builder/`_retroFinal`/mirror ออก (เก็บ Draft/Publish + ปุ่ม 🌐 ไว้)

---

## 📦 สถานะโค้ด (uncommitted)

```
M Index.html              +618 บรรทัด (v3.43 Draft/Publish + Retro)
M Phase_PathB_Global.js   +13   (_visibility/_retroBy/_retroAt/_retroFinal passthrough)
?? DESIGN_LWW_ownership_v3.44.md   (สเปค LWW)
?? HANDOFF_v3.43.md               (ไฟล์นี้)
```
- **ยังไม่ commit** — ถ้าจะไป LWW (B) อาจไม่ต้อง commit retro-chain code (จะรื้อทิ้ง) แต่ควร commit ส่วน Draft/Publish ที่เก็บไว้
- **ยังไม่ deploy** — Klui paste เอง (ไม่ใช้ clasp): `Index.html`→"Index", `Phase_PathB_Global.js`→"Phase_PathB_Global" → Deploy new version

## ✅ ส่วน v3.43 ที่ "เก็บแน่นอน" ไม่ว่าจะไป A หรือ B
- Draft/Publish: `_visibility` field, gate SYNC, `publishAction`/`unpublishAction`, backwards-compat (ของเก่า=public)
- ปุ่ม 🌐 inline ข้างดินสอ (`_draftBtnShown`, `.inline-publish`)
- ลงชื่อ login (`recordedBy` concept) — จาก `_pbGetLoggedInName()`
- backend payload round-trip (`Phase_Z_B3_Sync.js:92` เก็บ `JSON.stringify(a)` = ครบทุก field อัตโนมัติ)

## 🗑️ ส่วน v3.43 ที่ "จะถูกแทน" ถ้าไป LWW
- Retro multi-hop chain builder (modal 3 step, `_retroCommit`, `_retroAddHop`…)
- `_retroFinal` override, projection mirror (`_projectLocalRetro`, `_applyRetroMirror`)
- `_collectConnectedChain`, `_g_` chain resolver (`_resolveToReal`, `buildChain`), ghost 3-pass
  → LWW ใช้ "record ล่าสุด/slot" แทน

---

## 🧪 ทดสอบ (ถ้า deploy v3.43 ตามเดิมก่อน)
1. ยกเวรปกติ → localStorage มี `_visibility:'draft'`, Network **ไม่มี** `phxPushActions`, เส้นขีดประ + ปุ่ม 🌐
2. กด 🌐 → เส้นทึบ, `phxPushActions` fires, account อื่นเห็นหลัง refresh
3. Retro เชนเต็ม / override C→D → เห็น 🔄 + 🔒
4. `PBTest.runAll()` → ต้องยัง **31/31** (ไม่แตะ buildGhostRows)
5. `PBTest.restore()`

---

## 🎓 บทเรียนเรื่อง Klui (session นี้)
- **กล้าพลิกโจทย์กลางทาง** — ยอมทิ้งงานที่เพิ่งทำถ้าเจอโมเดลที่ง่ายกว่า ("ตั้งโจทย์ผิด")
- ชอบ **story + pros/cons + metaphor** (ป้ายชื่อหน้าห้อง, เลขที่นั่งโรงหนัง, สายพาน) — ช่วยตัดสินใจได้ดี
- ต้องการ **สรุปโมเดลก่อนโค้ด** เสมอ — อย่ารีบลงมือ
- ระวัง 300 คนมาก — ชอบทางที่ rollback ได้
- ตอนนี้เป็น admin คนเดียวใช้จริง → trust model ยืดหยุ่นได้ (LWW ลงชื่อ+สืบทีหลัง เข้ากับแนวคิดนี้)
- **prefer manual paste มากกว่า clasp push**

## 🔗 Key numbers
- Sheet ID: `1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM`
- Master schema (code.js:1203): `shift_id, name, date, timestamp, pos, shift, range, room, isNew, originOwner, status, last_modified`
- Overlay sheet: `PHX_Overlays_v2` — col5 = payload JSON (เก็บ field ใหม่อัตโนมัติ)
- Build: v3.43 (uncommitted) → ถัดไป v3.44 (LWW)
- User count: ~300 (ระวังทุก deploy)
- Deferred (ค้างจาก v3.42): 🔴 `phxDisableTestMode()` ก่อน rollout · 🔴 Firebase reliability
