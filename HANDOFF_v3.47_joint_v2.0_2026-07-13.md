# HANDOFF — joint v2.0 (ปาร์ตี้ยืดหยุ่น) shipped; v2.1 (เวลารายคน + ICS) TODO — 2026-07-13

Branch **`main`**, tip **`ba8bead`** (feat `7dd0c4f`), all pushed + **GAS deployed `@342`** at same `/exec`.
Continuation of `HANDOFF_v3.46_joint_v1_2026-07-13.md`.

## TL;DR
The old **ไม้/relay** feature was removed and replaced by **"ต่อเวรแบบเจ้าของร่วม" (joint co-ownership)**.
Shipped so far: **v1 → v1.1 → co-owner surfacing → v2.0 (flexible party)**. Only **v2.1 (per-person
work-time labels + ICS export)** is left. Nothing is broken in production; every step verified headless.

> ⚠️ **All joint mutations (create / add / join / leave / edit-note) need LOGIN + the real GAS server
> to work end-to-end.** Logic was verified headless (node static server + browser eval); the true
> login→`google.script.run`→sheet round-trip is **Klui's live-test to confirm**.

---

## The concept (Klui's design — replaces ไม้)
A shift stays **ONE indivisible unit** (never time-split). Attach a free-text **note** + a **party** of
co-owners. Grid shows all names concat **"A + B + C 🤝"**. No strikethrough/ghost/chain/fractional
ownership — that was the root of the old ไม้ mess ("ไม้ ≠ เวรทั้งตัว"). Data = **append-only linked
records**, each participant signs a row under **their own name** (server writes rows only under the
writer's name; cross-user = admin-only), so it's sync-legal + tamper-evident.

## v2.0 — what shipped this session (answers Klui feedback #1–#4)
1. **Manage from tapping the shift** (not only the 🤝 marker). A joint shift has no give/swap.
2. **Party > 2, add members anytime** (➕ เพิ่มคน; ➕ เข้าร่วมเวรนี้ for a non-member).
3. **Join = reason + log, NO password** ("easy in"); **leave = password + reason** ("strict out").
   You can ADD others but only REMOVE yourself.
4. **Collapse to sole owner**: when currentOwners hits 1 → normal single-name shift (no 🤝); the
   last member **cannot leave**; works even when the original owner left (their row vanishes).

### Architecture pivot (the important change to understand)
v1 painted owners onto the **creator's master row** + synth co-owner "participation rows". That can't
express "original owner leaves". **v2 = suppress the master/anchor row + synth ONE joint row per
current member** — all in `getEffectiveData` (filtering the **returned array only**, never `rawData`;
`findShiftByKey`/`getShiftIndex` + the synth's own base-resolve still read rawData).
- Helpers (Index.html ~3210): `_jointSuppressKeys(jm)` (keys w/ ≥1 current owner) · `_jointRowsForPerson(person,mid,jm)`
  → `{...base, name:person, _ghost:'joint', _jointRow:true, _ghostKey:sk, _jointActionId, _jointOwners}`.
- `getEffectiveData` (~2807): mode-1 synths for the viewed user; mode-2 ward synths one per joint.
- `renderTable` (~7798): `_jointRow` → ≥2 owners = concat + 🤝; `<2` = single name, **no** 🤝 (collapse);
  ghost border skipped via `!i._jointRow`; `_jointRow` is tappable.
- `openActionModalForKey` (~5025): **TOP intercept** (before the bound-name guard) — joint key →
  `_jointShowNote(actionId)` + return. This is what makes give/swap unreachable on a joint and lets a
  co-owner tap without the "can't edit others" alert.
- **v1's `_jointPart` synth is fully replaced** (no orphan refs).

### Data model (records + reducer)
- base `joint {shiftKey, owners:[creator,...], note}` · `joint_note {refActionId, note}` ·
  `joint_leave {refActionId, viewerName}` (self, pw+reason) · 🆕 `joint_join {refActionId, member, viewerName:adder}` ·
  🆕 `joint_time {refActionId, member, timeRange, viewerName}`.
- **`_combinedJointMap` (~3165): currentOwners = per-person in/out timeline** (base owners + `joint_join`.member
  = "in"@createdAt; `joint_leave`.viewerName = "out"; latest event wins, tie→out). Replaces `owners−leavers`;
  handles add + leave-then-rejoin. Also emits **`timeMap`** = latest `joint_time` per member (for v2.1).
- Plumbing that MUST carry any new joint field (learned the hard way): `isJoint` (3135), `norm` (3136),
  the **OverlayManager fallback normalizer** (~2916, for anon/non-bound views), and the **server
  read-whitelist `Phase_PathB_Global.js:82-85`**. Client push + server store are verbatim; `reason` is
  audit-only (not stored on the record).
- Membership UI (all in `_jointShowNote` manage overlay, reachable via 🤝 marker + tap + menu):
  `_jointCoOwnerPicker` gained `opts{excludeNames,hideNote,confirmLabel,title,subtitle}` · `_jointReasonModal`
  (`_JOINT_JOIN_REASONS`, no pw) · `_jointWriteJoin` (audit-before + addAction public) · `_jointOpenAddPicker`
  · `_jointSelfJoin` · `_jointLeave` blocks when currentOwners.length ≤ 1. All writes `_visibility:'public'`,
  `viewerName` pinned to the actor. **Orphan guard**: base still `draft` → block join.

---

## ⏭️ v2.1 — the ONLY thing left (Klui feedback #5: per-person work-time labels)
CONFIRMED with Klui: times are **DESCRIPTIVE ONLY** — the shift stays one unit, **no** seam/bar/ownership
like old ไม้. Each member sets their **own** independent start–end window. Shown **only in the 🤝 overlay
+ ICS** (grid stays "A + B + C 🤝"). Works for regular shifts AND clinic (`range==='ตรวจสอบ'` = free-entry).
The `joint_time` record + `timeMap` are **already wired** (reducer + whitelist done in v2.0).

**STEP 5 — time entry + display** (Index.html):
- In `_jointShowNote` add a `⏰ ลงเวลาของฉัน` button → modal with 2× `<input type="time">` → write
  `OverlayManager.addAction(mid, {action:'joint_time', _visibility:'public', refActionId, shiftKey, member:me, timeRange, viewerName:me})` + `phxAuditLog('joint_time',...)` before write. Reuse `parseRangeToMinutes` (~7072) + inline `pad` to validate; NO seam/bar.
- Show `st.timeMap[owner]` beside each owner chip in the overlay (the chips loop ~5994).

**STEP 6 — ICS export** (`_ecmBuildClientICS` ~11728): its enum uses its **OWN** `ownShifts + buildGhostRows`
per person (NOT getEffectiveData) → must also **drop `_jointSuppressKeys` keys + append
`_jointRowsForPerson(person,mid,jm)`**. Then splice into DESCRIPTION in BOTH branches (before `.join`:
all-day clinic ~11925 / timed ~12001): `descLines.push('เวลาของคุณ: '+(timeMap[person]||'—'))` +
`'ผู้ร่วมเวร: '+currentOwners.map(displayName).join(' + ')`. DTSTART/DTEND stay from base range; escape via existing `escICS`.

**Verify v2.1:** co-owner's ICS has the shift + note + their own time; the original owner who LEFT does
not get the shift. Set B's time → overlay shows it beside B; latest write wins.

---

## Decisions locked (don't re-litigate)
- Times = descriptive labels, overlay + ICS only, grid clean. · Join = reason+log no password; Leave =
  password+reason. Add others, remove only self. · Collapse to 1 = sole owner, last can't leave. · Manage
  via tap/marker/menu → the one `_jointShowNote` overlay.

## Deploy / verify
- **Any change to `Phase_PathB_Global.js` (or any GAS file) → `npx clasp push -f` then
  `npx clasp deploy -i AKfycbxkjlqyToAUAi8UPXQptRanT0tq9OX0nyKVKamjZJuMvbRGkzClPzMkuY2EnT17HOjE -d "..."`**
  (creates a NEW version; save alone is not enough). Currently `@342`.
- **Headless harness**: `.claude/launch.json` → node static server (scratchpad `static-server.js`) on :8099;
  Claude_Browser preview → `javascript_tool` eval. Inject `pathBOverlays` with base `joint` + `joint_join`/
  `joint_leave`/`joint_time` (all `_visibility:'public'`) then call `_combinedJointMap`/`getEffectiveData`/
  `renderTable`/`renderBanner`/`renderCalendar`/`_ecmBuildClientICS`. Test matrix: 3-person; original-owner-
  leaves→sole owner ≠ creator; collapse-to-1 blocks leave; leave-then-rejoin; received-shift `_g_` joint;
  **one give + one swap regression each pass**. Note: ward view with NO filter shows a "please filter" gate
  (not a bug) — mode-2 = date/room filter. `synchk.js` in scratchpad checks all 9 inline scripts.

## Key files
- `Index.html` — reducer/helpers 3133-3260, getEffectiveData 2807-2870, renderTable 7798-7905,
  openActionModalForKey 5025, joint UI (picker/manage/join/leave/edit) 5868-6260, calendar ~8130,
  banner ~4099, ICS 11728-12014, fallback normalizer 2916-2938.
- `Phase_PathB_Global.js` — read-whitelist 56-85 (owners/note/refActionId/**member/timeRange**).
- `Phase_Z_B3_Sync.js` — write path (stores payload verbatim; no change needed).
- Plan: `~/.claude/plans/humble-noodling-balloon.md`. Auto-memory project file has full detail.

## Lesson (kept)
Old ไม้ compounded from ~10 "just one more fix" stages without a "do we want this?" checkpoint. The joint
redesign removes fractional ownership entirely. **v2.1's times MUST stay descriptive** — if they ever start
partitioning the shift, that's the ไม้ trap returning. Ship v2.1, let Klui live-test, don't stack more
untested architectural changes on top.
