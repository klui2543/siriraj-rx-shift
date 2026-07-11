# DESIGN — Relay-baton time-split ownership (ส่งไม้ต่อเวลา)

**Started 2026-07-11 on `main`.** Feature requested by Klui: a shift that isn't fully
covered by one person can be split into **legs** ("ไม้", relay baton) — each leg = one
owner covering a sub-time-window. Klui chose the **"full / system truly knows"** depth
(legs are real ownership: feed conflict-check, hour/shift count, export) built
**staged + behind a flag** so the live app never breaks mid-build.

Mockup approved (relay entry dialog + per-leg table rows + timeline line): app-language,
`relay_mockup.html` (scratchpad) / artifact `b8daf465`.

---

## Data model

A relay is a normal give/swap/add action PLUS an optional `legs` array. Legacy / flag-OFF
ignores `legs` → behaves as today's whole-shift transfer (safe fallback).

```
action.legs = [
  { owner: 'ขลุ่ย',    start: '08:00', end: '12:00' },   // ไม้ 1 (giver keeps)
  { owner: 'กล้วยหอม', start: '12:00', end: '16:00' },   // ไม้ 2 (recipient)
  ...                                                     // ไม้ 3+ optional
]
```

- Legs tile the master shift's full range in order; `legs[i].end === legs[i+1].start`.
- `owner` is a known name (same picker rule as `partnerName`).
- The master row (`date|pos|origOwner|range`) is REPLACED in effective data by the leg-rows.
- A leg-row = `{...masterRow, name: leg.owner, range: leg.start+'-'+leg.end, _leg:{actionId, i, of}}`;
  its `makeShiftKey` is naturally distinct (range differs), so downstream row-by-row code
  (table, calendar, conflict, export) mostly "just works" once legs are rows.

## Flag

`window._relayEnabled` (default **false**). When false: `legs` is stored but never
expanded/rendered — the action is a plain whole-shift transfer. Mirrors the existing
`_lwwEngine` / `_syncPublish` flag pattern.

---

## Staged plan (each stage: commit+push, harness, app stays working)

- **Stage 1 — capture + display** (this milestone)
  - 1a. ✅ DONE (`a02ed6c` flag+doc, `e66b800` capture UI). flag `window._relayEnabled`;
        relay entry UI in `swfOpenConfirm` (give only); `_relayCollect` validates →
        `_relaySaveLegs` persists `action.legs=[{owner,start,end}]`. 25-check `relay_harness`.
        Helpers: `_relayRangeParts/_relayMin/_relayFmt/_relayMid/_relayRenderLegs/_relayInit`.
  - 1b. ✅ DONE (`75bf3ee`). `_relayGather(mid)` (legged give/add from OverlayManager +
        pathBOverlays → slotKey, dedup) + `_relayExpand(rows, mid)` (replace matching master
        row with per-leg rows `{...master, name:leg.owner, range:leg.start+'-'+leg.end,
        _relayLeg:{i,of,actionId,from}}`; drop the whole-shift ghost of that action). Wired
        into `getEffectiveData` return → table + calendar both split. `renderTable` adds a
        'ไม้ N' chip (`.relay-leg-tag`). 24-check `relay1b_harness` (Sonnet).
  - 1c. ⏳ `renderBanner` count still tallies WHOLE shifts (its own path, not getEffectiveData)
        — the giver's kept leg isn't recounted. Fix count semantics here.

### 🔴 Klui live-test feedback 2026-07-11 (Stage 2/3 backlog — do FRESH, substantial)
1a. **Names incomplete in the leg typeahead.** `window.allPharmacistNames` (7227) = current-month
    schedule names + `P2B._peopleNames` only. Missing registered accounts (`_registeredUsers`,
    ~17254) and people from other months. → union a fuller source (may need backend).
1b. ✅ **FIXED — publish now propagates legs.** Root cause: `phxGetAllActiveOverlaysForMonth`
    (`Phase_PathB_Global.js`) whitelists which payload fields become `pathBOverlays` entries and
    never included `legs` — every viewer's `_relayExpand` silently saw a legless action. `phxPushActions`
    was already fine (stores the full JSON payload verbatim). Fix: added `legs: Array.isArray(payload.legs)
    ? payload.legs : null` to the pushed overlay object; also folded a legs fingerprint into
    `_pbOverlaySignature` (Index.html) so a future legs-only edit (see 1d) still trips the live-poll
    refresh. Verified with a harness that runs the real `phxGetAllActiveOverlaysForMonth` against a
    fake sheet row (legs survive) and feeds `_relayGather`/`_relayExpand` a `pathBOverlays`-only viewer
    with zero local drafts (both leg owners' rows appear) — 11/11 checks pass. Not yet re-verified on
    live GAS by Klui (needs a new deployment version to go live — see `HANDOFF_v3.45_relay_2026-07-11.md`).
1d. ✅ **DONE — edit legs after publish (timeline 🏃✎).** New `_relayEditLegs(mid, id)` opens a small
    modal that REUSES the confirm-dialog leg editor (`_relaySectionShellHtml`+`_relayInit`+`_relayCollect`).
    Entry point = a 🏃✎ control in the timeline hop (`buildTimelineHTML`, `data-tl-relayedit`), shown to
    the AUTHOR (own chain) or admin, on give/add carrying legs, draft OR published. Save → `_relaySaveLegs`
    (local) + (if public) mirror `legs` into `pathBOverlays` + `_phxScheduleSync` → propagates via the
    Stage-1b server fix. Turning the switch OFF + save clears the split back to a whole-shift transfer.
    Author-only, no reason prompt (unlike `_pbEditRecipient`'s admin-override — a relay split is the
    owner's own to adjust). 12-check `relay_edit_harness` (edit ไม้2 owner → propagates; toggle-off clears).
1c-disp. **Time clarity.** Show who covers which time plainly (timeline line + confirm summary +
    maybe the picker), not only the table range.
1e. **Swap + special-clinic must support relay too.** Today only give/add; swap is deferred and
    clinic (`range==='ตรวจสอบ'`) disables the toggle. Extend to both.
- **Stage 2 — time-awareness:** conflict/overlap excludes sibling legs of one shift
  (`shiftToMinutes`/`checkShiftConflict`/`detectClientOverlaps`); count semantics (1c).
- **Stage 3 — sharing + reach:** publish→server legs (1b) + edit-after-publish (1d) + export
  (PDF/ICS/`_phxB3bSerializeShifts`) + history/timeline per-leg + LWW `ledger`/`buildRecords`
  per-leg + swap-relay & clinic (1e) + fuller name source (1a) + swap-flow view.

## Pipeline map (from Explore agent 2026-07-11 — key touch-points)

Identity: `makeShiftKey` (date|pos|name|range) — the ownership key everywhere; range is
opaque identity, never a sub-window today. Effective data: `getEffectiveData` (~2795) =
`rawData.concat(buildGhostRows)`. Ghosts: `buildGhostRows`/`_lwwBackedGhosts` copy `range`
VERBATIM (the seam to change). Render: `renderTable` (~7287) 1 shift→1 `<tr>`; `renderCalendar`
badge loop. Count: `renderBanner` (~3971) counts whole shifts (no hour math today). Conflict:
`shiftToMinutes`/`checkShiftConflict`/`parseRangeToMinutes`/`detectClientOverlaps` (range-driven).
Export: `_buildPortraitTableHTML`/`_buildLandscapeCalendarHTML`/`_ecmBuildClientICS`/
`_phxB3bSerializeShifts`. Ownership: `LWW.buildRecords/ledger/currentOwner`, `PBOverlays.getUsedMap/buildChain`
— all whole-shift `slotKey→newOwner`.

## Branch / deploy note (2026-07-11)

`main` is canonical (v3.44-lww merged in). clasp auto-push Stop hook + cloud sessions push
to main between turns → **`git fetch` + `status -sb` before every push**. Leave
`_SYNC_STAMP.js` (hook artifact) untouched; stage only feature files. Flag OFF = safe to
auto-deploy mid-build.
