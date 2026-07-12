# HANDOFF — v3.45 relay Stage 1c/1d/1f + calendar spillover (2026-07-11, cont.)

Branch **`main`**, base `bfffad9` (prior handoff). 5 feature commits + hook stamps this
session, all **pushed to origin + clasp-pushed to GAS**. Tip `541b37d`.

Prior handoff (earlier same day): `HANDOFF_v3.45_relay_2026-07-11.md`. That session shipped
relay Stage 1a+1b (capture/display/publish-legs) + admin-cancel + deploy-fix + changelog.
**This session closed out the Stage-2/3 backlog it left behind.**

---

## 🚀 DEPLOY
Same as always: `clasp push` (Stop hook) keeps the GAS *editor* current, but **`/exec` serves a
pinned deployment version**. Every fix below needs a **new deployment version** (or use `/dev`
for instant testing) before Klui can see it live. Klui hit this gotcha again this session —
worth reminding him up front next time.

---

## ✅ WHAT SHIPPED THIS SESSION

### 1. Relay Stage 1b — publish propagates legs to every viewer (`c0f9e5e`)
**Root cause found & fixed on the SERVER, not the client.** `phxGetAllActiveOverlaysForMonth`
(`Phase_PathB_Global.js`) builds the public overlay feed every viewer polls — it whitelisted a
fixed field list per overlay and silently dropped `legs`. So after publish, only the publisher's
own OverlayManager (local) still had `legs`; everyone else's `pathBOverlays` entry was legless →
`_relayExpand` never split for them. Fix: pass `legs: Array.isArray(payload.legs)?payload.legs:undefined`
through. No client change needed — `_relayGather`/`_relayExpand` already read `pathBOverlays`
generically. 11-check `relay_publish_harness`.

### 2. Relay Stage 1d — edit legs after publish (`7cace7d`)
New `_relayEditLegs(mid, id)`: small modal reusing the confirm-dialog leg editor
(`_relaySectionShellHtml`/`_relayInit`/`_relayCollect`). Entry point = **🏃✎ in the timeline hop**
(Klui's choice via AskUserQuestion) — shown to the author (own chain) or admin, on give/add
carrying legs, draft OR published. Save → `_relaySaveLegs` (local) + if public, mirrors `legs`
into `pathBOverlays` + `_phxScheduleSync` (propagates via the Stage-1b fix). Toggle-off + save =
clear split back to whole-shift transfer. No reason-prompt (unlike admin-override name edit —
a relay split is the owner's own to adjust). 12-check `relay_edit_harness`.

### 3. Calendar — cross-month day+month matching (`72f0b27`)
Klui reported a relay leg's date looked wrong ("2/12 → 2/1"). Investigation (console diagnostics,
not guessing) proved it was **not a relay bug**: `rawData` genuinely has the shift dated `02/01`
(Jan 2). Root cause: BOTH `renderCalendar` (badge placement) and the calendar cell-click handler
bucketed shifts into a day-cell by `parseInt(date.split('/')[0]) === day` — **day-of-month only,
ignoring month**. A schedule sheet with a shift dated into the next month (Jan 2, stored in a
December sheet) collided onto the December day-2 cell. Fixed by comparing shift month vs calendar
month (new helper `_calSelectedMonthNum()`); unparseable month falls back to day-only (safe for
normal single-month schedules). This *stopped the mis-placement* but made the spillover shift
disappear from the calendar grid entirely (day 2/1 has no cell in a December-only grid) — see #4.

### 4. Calendar — render spillover days as their own cells (`44098c5`)
Follow-up: `renderCalendar` now **extends the grid** — scans the rendered person's
`getEffectiveData()` for shifts dated in the immediately-following month, and appends those days
(`1..maxSpill`) as extra cells after month-end. Replaced the old `for day=1..totalDays` loop with
a `_calCells` list of `{day, mon, yr, spill}`. Spillover cells get `.cal-spill` tint +
`.cal-spill-mon` month tag (e.g. "2 ม.ค."), carry `data-cal-month`/`data-cal-view-month` so both
the edit-tap handler and the view-picker resolve by the cell's own month. Dec→Jan rolls the year.
No-spillover schedules are unchanged (grid stays month-sized). 17-check `calendar_spillover`
harness.

### 5. Relay — tap a leg-row in the table to manage it (`7144959`)
Klui found: tapping a leg-row in the table silently did nothing ("can't manage a legged shift").
Root cause: a leg-row's key is a synthetic sub-range (`02/01|I-11|ณรพล|08:30-12:30`) not present
in `rawData`, so `openActionModalForKey → findShiftByKey` returned null and bailed quietly.
Fixed by stamping leg-rows with `data-relay-actid`/`data-relay-mid` in `renderTable`, and the
global edit-mode click handler now intercepts those FIRST and opens `_relayEditLegs` (same modal
as the timeline 🏃✎). Edit-mode only.

---

## 🧪 VERIFIED
Every commit: `node --check` on all 9 inline `<script>` blocks (`check_scripts.js`). Behavioral
harnesses (session-local scratchpad, extract-and-run against the REAL shipped functions):
`relay_publish_harness` 11 · `relay_edit_harness` 12 · `calendar_crossmonth` 12 ·
`calendar_spillover` 17. **Klui live-tested most of this on GAS mid-session** and reported the
bugs that drove fixes #3/#4/#5 — the loop was: ship → Klui tests → reports symptom → diagnose
with console snippets (not guesses) → fix → re-verify.

Harnesses live in the session scratchpad (not committed) — rebuildable from the VERIFIED list
above; each harness extracts the real function bodies from `Index.html` via regex + runs them
against fabricated data, so they test the shipped code, not a paraphrase.

---

## ⏳ NEXT — deliberately parked (Klui's call, not forgotten)

- **Swap-a-leg** ("แลก a leg with another person's shift"). Klui confirmed relay only needs to
  cover give/add for now ("เอาในกรณีแลกเวรออก"). If ever revisited: recommend swapping the WHOLE
  shift first, then splitting — much simpler than a native partial-swap.
- **Clinic-split (relay for `range==='ตรวจสอบ'` shifts).** Klui: "ตอนนี้ผมว่าเริ่มยากละ" — parked.
  It's SAFE as-is: `_relayInit`/`_relayRangeParts` already returns null for a clinic shift → the
  toggle auto-disables with "เวลาไม่ชัดเจน" (dead switch, not broken). Two ideas floated for later,
  no decision made:
  - **(A)** seed an estimated window via `estimateSpecialClinicRange` (existing helper — weekend
    07:00-23:00, weekday 16:00-23:00) marked "ประมาณ · แก้ได้", then split by time as normal —
    keeps count/conflict-check working.
  - **(B)** order-only legs ("ใครก่อน-หลัง", no clock times) — matches clinic reality better but
    loses the time-based features (conflict detection, hour counting).
- **1a fuller name source** — `allPharmacistNames` (~7227) = this-month schedule + `P2B._peopleNames`
  only; still missing registered accounts (`_registeredUsers`) + other months. Untouched this
  session.
- **1c-disp / count** — clearer "who covers until when" display; `renderBanner` count still tallies
  whole shifts (its own path, not `getEffectiveData`). Untouched this session.
- **Bottom nav + swap-flow view** — still the oldest deferred item, unrelated to relay.

## Relay feature state — summary
**Core is solid and Klui-usable end to end:** split (give/add) → publish → every viewer sees their
leg → edit any leg's owner/time (draft or published, via timeline 🏃✎ or tapping the row directly)
→ toggle off to un-split. Recommended Klui actually USE it with the team for a cycle or two before
adding swap/clinic support — real usage will surface what's actually needed vs. speculative.

## ⚠️ GOTCHAS (carried forward + reconfirmed)
- Relay flag (`window._relayEnabled`, localStorage `relay_legs`) default OFF — all relay work is
  safe to auto-deploy. Klui saw it reset to `false` once mid-session after what looked like a GAS
  redeploy; if it happens again, `setRelayLegs(true)` recovers instantly (legs data itself is
  never lost — confirmed via diagnostics, it's purely a display-gate).
- `/exec` pinned-version gotcha bit Klui again this session — remind proactively next time a fix
  needs live testing, rather than waiting for "it's not showing up."
- `docs/DATA_MAP.md` still sits untracked (pre-existing, not this session's work) — left alone.
- Stop hook does `clasp push` (→ GAS editor) but **NOT `git push`** — git pushed manually each
  checkpoint this session (5 stamp-commit catch-ups along the way).
