# HANDOFF — v3.45 relay 1c count + 1e clinic-split + 1f live-test fixes (2026-07-12)

Branch **`main`**, base `62d0417` (prior handoff tip). 3 feature commits this session,
all **pushed to origin/main**. Tip `9757a7b`.

Prior handoff: `HANDOFF_v3.45_relay_2026-07-11_cont.md` (closed Stage 1b/1d + calendar
spillover). **This session closed the two 1c items it parked (count + who-covers display)
and shipped clinic-split — a NEW design Klui specified mid-session — then Klui live-tested
it on GAS mid-session and reported 6 issues; 4 confirmed+fixed same session (§1f below).**

---

## 🚀 DEPLOY (unchanged, remind Klui up front)
`clasp push` (Stop hook) keeps the GAS *editor* current, but **`/exec` serves a PINNED
deployment version**. Everything below needs a **new deployment version** (or `/dev`) before
Klui can see it live. Both features are behind `window._relayEnabled` (default **OFF**) — so
`setRelayLegs(true)` in the console first, then test.

---

## ✅ WHAT SHIPPED

### 1. `renderBanner` count is leg-aware (`b910bf3`)
`renderBanner` tallied `rawData` + `buildGhostRows` filtered by the used-map — a path that
**never saw legs**. So a relay-split shift credited only the whole ghost to the recipient and
gave the giver **ZERO** for the ไม้ he still covers (his master key is marked "given away").
Now counts from `getEffectiveData()` (already `_relayExpand`-ed): a `_relayLeg` row always
credits its owner +1; non-leg rows keep the whole-give exclusion. **Flag OFF → reduces EXACTLY
to the old own-active + ghosts-active count** (proven in the harness). Clinic legs (no duration)
also count +1 each = per-person presence, matching the table's one-row-per-ไม้.

### 2. Clinic-split — "handoff-time-only" (idea C) (`f30ef01`)
Klui's design, decided this session: a clinic (`range==='ตรวจสอบ'` / ⚠️) shift has no clear
head/tail, so **don't ask for start/end — capture ONLY the seam time(s)**. One seam = person-1's
END and person-2's START at once; the first ไม้'s head and last ไม้'s tail stay OPEN. N people →
N−1 seams. (Supersedes the old parked ideas A=estimate-window / B=order-only.)

- **`_relayInit`** — a clinic shift now enters CLINIC mode instead of disabling the toggle;
  seeds handoff-only legs (`end=''`, user fills the seam); state has no `startMin/endMin`.
- **`_relayRenderLegs`** — no proportion bar (a purple hint instead); last ไม้ shows
  "อยู่ต่อ จนจบ"; `+ เพิ่มไม้` seeds a blank seam.
- **`_relayCollect`** — clinic branch emits `{owner, start, end, clinic:true}` with open
  head/tail; seams must be present + strictly increasing; ≥2 distinct owners.
- **`_relayExpand`** — a clinic ไม้ **KEEPS the shift's own range** (`ตรวจสอบ`) so
  `isSpecialClinic` stays true (badge + all-day .ics path); the seam window rides on `_relayLeg`.
- **Editable post-publish for free** via the existing `_relayEditLegs` modal (same path).

### 3. 1c-disp — who-covers display, leg-aware everywhere (folded into `f30ef01`)
- **Table**: a clinic ไม้ appends its handoff window — `ถึง 11:00` / `11:00 เป็นต้นไป` / `11:00–14:00`.
- **Calendar**: a small ไม้-number superscript on every split badge (normal + clinic), tinted
  with the leg colour, so a split is distinguishable from a whole-shift badge.
- **Timeline** (`buildTimelineHTML` holder line): "· แบ่งเป็น N ไม้" so a give's kept ไม้
  isn't hidden behind "อยู่กับ: <recipient>".

### 4. ICS export — leg-aware + clinic note (folded into `f30ef01`)
The `.ics` builder built `shifts` from `ownShifts + ghosts` directly — same leg-blindness as the
count. Made it leg-aware with the **same formula** (re-expand `rawData + ghosts`, keep this
person's rows/legs) so the **giver's kept ไม้ survives the used-map** and gets exported. A
clinic ไม้ stays an **ALL-DAY** VEVENT (head/tail unknown) with a note per Klui's words:
"จะมีคนมาต่อ [เวลา]" (open head) / "มารับต่อจากคนก่อนเวลา […]" (open tail) / "อยู่ช่วง …
แล้วมีคนมาต่อ" (middle). Title gets a "· ไม้ N/M" tag. Timed (non-clinic) legs export as their
sub-window automatically. **Flag OFF → export is byte-for-byte unchanged.**

### 5. Live-test bugfix round — 1f (`9757a7b`)
Klui deployed, ran `setRelayLegs(true)`, split a real clinic shift end-to-end (split → publish →
export .ics — see the exported "103(3)\*\*L คลินิกพิเศษ · ไม้ 1/2" event with the "จะมีคนมาต่อ
เวลา 01:13" note, confirming §4 worked) and reported 6 issues. **4 confirmed as real bugs and
fixed same session:**

- **Calendar day-picker leg-blind (items 1+6).** `openCellShiftPicker`/`_renderPickRow` (the
  "เลือกเวรในวันนี้" popup, edit mode) never got the leg-tap fix the table got in commit
  `7144959`. A leg's synthetic key isn't in `rawData`, so tapping it either silently did nothing
  (recipient's ไม้2+) or — worse, for the giver's own KEPT ไม้1, whose key happens to still
  resolve to the real master row — opened the wrong modal ("ยกเลิกการยกเวร", undo-the-give)
  instead of the leg editor. Fixed: `_renderPickRow` now stamps `data-relay-actid`/`mid` and
  shows the ไม้ tag + handoff window; the click handler checks that FIRST and routes to
  `_relayEditLegs`. `openCellViewPicker` (view mode) gets the ไม้ tag for display parity only
  (no edit routing needed there).
- **Relay entry removed from mid-`add` (item 2).** Klui: "ต้องรับมาเป็นของเราจริงๆ ก่อน" — a
  shift must already be truly yours before you split it; mid-receive isn't settled. Turns out
  this wasn't just a UX call — it was covering a **real bug**: `swfOpenConfirm`'s "เสร็จสิ้น ·
  เผยแพร่" handler only ever called `_relaySaveLegs` for `kind==='give'`, so legs configured
  while receiving (`add`) were silently discarded on publish anyway. Restricted all 4 relay
  entry points in `swfOpenConfirm` (relayHtml render, `_relayInit` call, `swfKeep`, `swfDone`) to
  `kind === 'give'` only. Post-hoc `_relayEditLegs` (🏃✎ / table-tap) is untouched — by the time
  that's reachable an add is already a committed action, i.e. "already yours."
- **ICS export cross-month spillover (item 3a).** `_ecmBuildClientICS` always dated every shift
  under the currently-selected SHEET's year/month, never reading a shift's own month from
  `s.date` — so Klui's Jan-2 shift (stored in a December sheet) exported as Dec-2, or effectively
  "didn't know about 2 มกราคม." Same root cause the calendar grid already handles (commit
  `72f0b27`/`44098c5`) — mirrored that exact rule (immediately-following-month only, Dec→Jan
  rolls the year; unparseable/same-month falls back to the sheet's own), applied BEFORE the
  existing Round3 +1-day adjustment so the two compose correctly.
- **Table display decluttered (item 5).** A clinic ไม้'s handoff time was inline text appended
  right next to the clickable "ตรวจสอบ" badge — read as one run-on chip (Klui: "แปลก"). Moved
  the same text into a `title` tooltip on the ไม้ tag (hover/long-press) instead — info still
  there, row reads clean.

**2 items held — Klui's explicit choice, NOT code fixes:**
- **(3b) An older legged action doesn't appear in `.ics` export.** Traced to: this session's
  export code IS leg-aware and generic (would pick up ANY action with `legs.length>=2`) — the
  likely explanation is the action was published BEFORE the Stage-1b server-propagation fix
  (07-11, commit `c0f9e5e`), so the server's stored copy may still be legs-less from back then (a
  stale-data problem, not a gap in this session's code). **Klui's call: troubleshoot by reopening
  🏃✎ on that action and re-saving** (re-mirrors legs into `pathBOverlays` + resyncs) rather than
  a code change. If that DOESN'T fix it, that's new information — worth a fresh look.
- **(4) PDF/table-combined export (`_exportCalendarPDF_v2`, `_exportCalendarPNG_v2`) is still
  leg-blind AND cross-month-blind** — separate functions, untouched this session (only the `.ics`
  path got fixed). **Klui's call: parked** until after this round's live-test (no new GAS deploy
  version exists yet to test against regardless).

---

## 🧪 VERIFIED
Every commit: `node --check` on all 9 inline `<script>` blocks (`check_scripts.js`). Behavioral
harnesses (session scratchpad, extract-and-run against the REAL shipped functions):
- `relay_count_harness` **13** — bugfix (giver's kept ไม้ = 1, was 0), whole-give equivalence,
  3-way split, flag-off equivalence + a guard that the harness filter == shipped `renderBanner`.
- `clinic_relay_harness` **13** — `_relayCollect` clinic branch (2-way/3-way, all validations) +
  `_relayExpand` clinic marker (range preserved, `isSpecialClinic` stays true, open head/tail).
- `export_clinic_harness` **11** — leg-aware `shifts` (kept-ไม้ survives used-map) + all 3 note
  branches, guarded against export-source drift.
- `export_spillover_harness` **6** — Klui's exact Dec-sheet+Jan-2 case, non-December wraparound
  (no year rollover), unparseable-date fallback, spillover+Round3 composition, and a Round3-alone
  regression guard.

Harnesses live in the session scratchpad (not committed) — each extracts real function bodies
from `Index.html` (brace-matched, comment-aware) and runs them, so they test shipped code.

**Klui live-tested §1-4 on GAS this session** (real clinic split, publish, .ics export all
confirmed working) and reported the 6 issues that drove §5. **The §5 fixes are NOT yet
live-tested** — need a new GAS deployment version (or `/dev`) next round.

---

## ⏳ NEXT
- **Live-test the 1f fixes**: calendar day-picker tap-to-edit on a leg (both giver/recipient
  sides), confirm the relay toggle no longer appears mid-`add`, re-export December .ics and
  check the Jan-2 shift dates correctly, eyeball the decluttered table row (hover the ไม้ tag).
- **(3b)** troubleshoot the old-leg .ics gap: reopen 🏃✎ on that action and re-save; report back
  if that does NOT fix it.
- **(4)** PDF/table-combined export leg+cross-month awareness — parked, revisit after live-test.
- **Swap-a-leg** (แลก partial ↔ whole) — genuinely complex; recommend swap the WHOLE shift
  first, then split. Klui said relay only needs give/add for now.
- **1a fuller name source** — `allPharmacistNames` still misses `_registeredUsers` + other months.
- **1c-disp polish (low)** — `_buildPBTimelineHTML` (the SERVER/other-viewer timeline) is still
  leg-blind; only the local `buildTimelineHTML` got the "แบ่งเป็น N ไม้" note. A fuller per-ไม้
  holder breakdown ("A ถึง 11:00 · B ต่อ") is also possible but wasn't needed.
- **Bottom nav + swap-flow view** — oldest deferred item, unrelated to relay.

## ⚠️ GOTCHAS (carried + reconfirmed)
- 🔴 **HEAD went DETACHED again mid-session** (after the 1st push, before the 2nd). Symptom:
  `git push origin main` said "Everything up-to-date" while the new commit sat on a detached
  HEAD (`## HEAD (no branch)`). Recovered: `git branch -f main <sha>` → `git checkout main` →
  push (clean fast-forward, no force). **ALWAYS `git status -sb` right after commit/push and
  confirm it reads `## main...origin/main`, not `## HEAD (no branch)`.**
- `/exec` pinned-version gotcha — remind Klui a fix needs a NEW deploy version to test live.
- Relay flag (`window._relayEnabled`, localStorage `relay_legs`) default OFF — all this is safe
  to auto-deploy; `setRelayLegs(true)` to test, legs data is never lost (display-gate only).
- `docs/DATA_MAP.md` still untracked (pre-existing) — left alone.
- Stop hook does `clasp push` (→ GAS editor) but **NOT `git push`** — push git manually.
