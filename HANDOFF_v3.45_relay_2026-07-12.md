# HANDOFF — v3.45 relay 1c count + 1e clinic-split (2026-07-12)

Branch **`main`**, base `62d0417` (prior handoff tip). 2 feature commits this session,
both **pushed to origin/main**. Tip `f30ef01`.

Prior handoff: `HANDOFF_v3.45_relay_2026-07-11_cont.md` (closed Stage 1b/1d + calendar
spillover). **This session closed the two 1c items it parked (count + who-covers display)
and shipped clinic-split — a NEW design Klui specified mid-session.**

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

Harnesses live in the session scratchpad (not committed) — each extracts real function bodies
from `Index.html` (brace-matched, comment-aware) and runs them, so they test shipped code.

**Klui has NOT live-tested clinic-split yet** — no GAS session this run. The loop next time:
new deploy version → `setRelayLegs(true)` → real clinic split (split → publish → both people
export .ics) → confirm all-day + "จะมีคนมาต่อ".

---

## ⏳ NEXT — parked (Klui's call)
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
