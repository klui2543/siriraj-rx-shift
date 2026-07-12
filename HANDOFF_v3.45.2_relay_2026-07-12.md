# HANDOFF — v3.45.2 ต่อเวร (relay) redesign + full mobile polish (2026-07-12)

Branch **`main`**, tip **`8ff8eb8`** (+ later stamp commits), all **pushed to origin +
clasp-pushed to GAS editor**. 11 feature commits this session (listed at the bottom).

Prior handoff: `HANDOFF_v3.45_relay_2026-07-11_cont.md` — that shipped relay as legs riding on
a **give** action. **This session THREW THAT AWAY and rebuilt relay as its own action, then
polished it across ~11 live-test rounds on Klui's phone until it was clean.** ต่อเวร is now
**feature-complete per Klui.**

---

## 🚀 DEPLOY (unchanged, still bites)
`clasp push` (Stop hook) keeps the GAS *editor* current, but `/exec` serves a **pinned
deployment version**. Every change below needs a **NEW deployment version** (or `/dev`) before
Klui sees it live. Several "it's not showing" reports this session were just the stale pin —
**remind him up front**.

Relay is behind a flag: **`window._relayEnabled`** (localStorage `relay_legs`, **per-device,
default OFF**). Turn it on via the **new Settings toggle "🏃 โหมดต่อเวร (แบ่งไม้)"** (or
`setRelayLegs(true)` in a console). **Must be flipped ON on EACH device** — this was the cause
of "ไม้ไม่ขึ้นบนมือถือ / คอมกับมือถือห่างกัน 2 เวร" (data syncs fine; mobile just wasn't
rendering legs).

---

## ✅ WHAT ต่อเวร IS NOW (the redesign)

**Relay is a first-class action `action:'relay'`**, sitting beside แลก/ยก in the shift menu
("🏃 ต่อเวร — แบ่งช่วงเวลา"), offered on own shifts + committed received-ghosts when the shift is
splittable (parseable time range OR a clinic `ตรวจสอบ` shift).

- **Ownership NEVER moves.** `getUsedMap` (OverlayManager + PBOverlays) and `buildGhostRows`
  don't know `relay` → no strike, no ghost. `_relayExpand` (in `getEffectiveData`) fans the
  **master row** into one row per ไม้ for every viewer — recipients need no ghost. **Zero server
  change**: `phxPushActions`/`phxPullAll` store/return the full action JSON (legs included);
  the public projection `phxGetAllActiveOverlaysForMonth` passes `action` + `legs` through.
- **Confirm dialog** = leg editor always-on (`_relayInit` `opts.forceOn`, no toggle — the legs
  ARE the transaction). Keep-draft is friction-free; publish re-validates ≥2 legs.
- **Cancel is trivially safe** (the whole reason for the redesign): draft → delete; published →
  legless husk + resync (renders as nothing) → shift reverts to its owner in full. A give-ridden
  split used to strand the whole shift with the recipient — that class of bug is gone.
- **Clinic split (idea C):** a `ตรวจสอบ` shift has no head/tail, so you enter only the **handoff
  time(s)**; leg = `{owner, start, end, clinic:true}` with open head/tail; range stays `ตรวจสอบ`
  so the badge + all-day `.ics` path still fire.
- **Legacy give+legs data is INERT** — `_relayGather` accepts only `action:'relay'` (Klui's
  "ล้างของเก่า"). Any old test give with legs behaves as a plain whole give; undo it via its
  timeline ✕ if you want to re-split.

### Where legs show
- **Table:** one row per ไม้; name cell = `name + ไม้N chip + ▶` as ONE nowrap inline unit
  (no colour dot — the chip is colour-coded). Tap ▶ = per-ไม้ timeline; tap the row (edit mode)
  = the action menu (see below).
- **Calendar:** badge gets a `(ไม้ n)` second line (tinted), never widening the cell.
- **Timeline step:** summary line **"<the rest> ต่อเวรจาก <owner>"**, then the ไม้ list ONE per
  row — block centered, rows share a left edge. Holder line lists every ไม้-owner, names only.
  Clinic open-tail reads "HH:MM น. เป็นต้นไป", open-head "ถึง HH:MM".
- **ICS export:** each ไม้ = its own event (per-leg UID salt); clinic ไม้ = all-day + a note
  naming the neighbours ("… B มาต่อเวลา 11:00" / "มารับต่อจาก A …"); timed ไม้ get รับต่อจาก/
  ส่งต่อให้ desc lines + "· ไม้ N/M" in the summary.
- **Banner count** (`renderBanner`) is leg-aware: each ไม้-owner +1 (incl. the giver's kept ไม้).

### A split shift is still one shift (edit-mode actions)
Tapping a ไม้ row in edit mode opens the **action menu for the underlying shift**
(`_relayOpenLegMenu` → `openActionModalForKey(relay.shiftKey)`) — สลับ / ยก / **🏃 แก้ไม้**
(the ต่อเวร button flips to "แก้ไม้" when a relay already exists). **Giving/swapping the WHOLE
shift auto-cancels the split** (`_relayClearForShift` on give/swap commit) — DESIGN DECISION
(my inference, Klui hasn't objected): a whole-shift transfer supersedes the internal split.

---

## ✅ NON-RELAY FIXES THIS SESSION
- **`renderBanner` count** made leg-aware (was: giver's kept ไม้ dropped by the used-map).
- **`รหัสเวร` filter no longer bound to the login user** — pos typeahead options are now ALWAYS
  `window.allPositionCodes` (every code), and `triggerUpdate` only auto-clears a chosen code
  that exists NOWHERE in the schedule (not merely absent from the name-filtered view).
- **Shift-handoff name pickers are KNOWN-NAMES-ONLY** — removed the free-text "ไม่มีชื่อในระบบ —
  พิมพ์ชื่อเอง" opt-in from the shared `_lwwNamePicker` (used by swap/add จากใคร + แก้ผู้รับ +
  admin override) and made the relay leg-owner typeahead reject unrecognised names. ⚠️ this is
  broader than relay (affects swap/edit pickers too) — if Klui wanted it relay-only, revisit.
- **Timeline history is read-only in view mode** — the ✎/✕ (edit-recipient, remove-hop, cancel-
  published) + 🏃✎ controls are gated behind `editModeActive` (const `_tlEdit`) in the author
  builder; PB-builder ADMIN controls stay ungated (an admin viewing another's chain may not be
  able to enter edit mode).
- **Cross-month spillover calendar:** shows the day in its own tinted cell but **no month label**
  (Klui). `data-cal-month` still carries the real month for taps.
- **Cell-picker leg tag** moved to AFTER the pos code.

---

## 🧪 VERIFIED
Every commit: `node --check` on all 9 inline `<script>` blocks (`check_scripts.js`). Behavioural
harnesses (session scratchpad, extract-and-run against the REAL shipped functions), all green:
- `relay_count` **18** (leg-aware count incl. flag-off=whole-back, legacy-give inert, **S7 dedup**
  = received-then-split shows exactly the ไม้ rows, no leftover whole ghost/master)
- `relay_ownshift` **16** (own-key round-trip with real `makeShiftKey`, given-away→undo routing,
  concise-wording guards, handoff-summary, edit-mode-gate guards)
- `clinic_relay` **18** · `export_clinic` **11** · `export_spillover` **6** · `relay_menu` **10**
  (find-relay-by-key, แก้ไม้ menu, give/swap-clears-relay wiring)

Plus **headless CSS verification** for every layout change: a node static server serving a tiny
test page + `mcp__Claude_Preview__preview_eval` measuring `getBoundingClientRect` at 375px
(screenshots timed out; rect-measuring is the reliable path here). Confirmed: table ไม้ chip
one-line + in-cell, calendar `(ไม้ n)` no overflow, timeline 1-per-row centered/left-aligned, no
horizontal scroll anywhere.

---

## ⏳ DEFERRED (Klui's explicit call — parked, not forgotten)
- **"ยังมีเรื่องที่ปรับเกี่ยวกับการ Edit อยู่ค่อนข้างเยอะ"** — Klui has MORE edit-flow changes
  in mind but parked them here. Ask him to enumerate next session.
- **The give/swap-cancels-split design decision** — confirm it's what he wants (vs. blocking
  give/swap while a shift is split, or carrying the split).
- **PDF / รวม-table exports** (`_exportCalendarPDF_v2` / `_exportCalendarPNG_v2`) are still
  leg-blind + cross-month-blind (separate export paths, untouched).
- **Relay flag rollout** — still per-device + default OFF. Options Klui declined for now: sync
  the flag via prefs, or default-ON for the whole team.
- **Bottom nav (3 tabs) + swap-flow view** — oldest deferred items, unrelated to relay.

## ⚠️ GOTCHAS (carried forward)
- `/exec` pinned-version gotcha (see DEPLOY).
- Relay flag is **per-device** — the Settings toggle is how you enable it on a phone.
- `docs/DATA_MAP.md` still sits untracked (pre-existing, left alone).
- Stop hook does `clasp push` (→ GAS editor) but **NOT `git push`** — git pushed manually each
  checkpoint (stamp commits were caught up along the way).
- HEAD-detached hazard: **always verify `## main...origin/main`** after a push.

## Commits this session (excl. stamp commits)
```
9ff4537 relay becomes a first-class action (no longer rides on ยกเวร)
4adbe13 lean timeline breakdown + edit-mode gate
cf6afcd calendar runner glyph · known-names-only · edit-mode-gated history
467030e calendar (ไม้ n) label · timeline legs wrap (no h-scroll)
28a9016 รหัสเวร filter = all codes · mobile ไม้ chip stays in the name cell
027942b relay display toggle in Settings (enable on mobile, no console)
3a6c7d6 no dot · 2-ไม้/row timeline · holder lists names · "เป็นต้นไป"
4a641c5 leaner timeline (drop อยู่/ตั้งแต่ · handoff summary · names-only holder)
a2f43cb one-line ไม้ chip in table · centered left-aligned ไม้ list
e982bd1 no 🏃 in timeline · dedup split shift · split shift stays actionable
8ff8eb8 ไม้ tag after pos in cell picker · drop spillover month label
```
