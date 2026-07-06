# Design — Last-Write-Wins Ownership Model (v3.44 proposal)

**Status:** design only — NOT coded (per Klui, 2026-07-06). Summarize + agree first.

## Why (Klui's reframing)
The chain model (`A→B→C→D` linked via `_g_`) answers the wrong question. Nobody needs to
reconstruct who A/B/C were — they need **who holds this duty NOW**. So: **the last person
recorded as holding a duty owns it** (Last-Write-Wins by timestamp). Keep a signed, timestamped
log so anyone can audit the truth later.

Metaphor: **nameplate on the room door + a sign-in logbook.** Whoever writes their name last owns
the duty. The logbook records who wrote it, when, and who they took it from — open it only if
there's a dispute.

## The linchpin: slot identity already exists (no new key needed)
The master sheet is **immutable** (Storage v3) and every row is uniquely identified by
`makeShiftKey(row)` = `date|pos|name|range`, where `name` = the **original** owner (never changes,
because master never changes). So:

> **slotKey = the master row's key = the identity of "the duty that originally belonged to X".**

This dodges the whole "is date+pos+range unique?" problem. Even extra/`เสริม` positions each have
their own master row → unique. Every ownership record points at a **master slotKey** — never at a
`_g_` ghost. Re-transfers just add another record on the **same** slotKey.

(Note: `shift_id` in the master = `base64(date+pos+name)[:15]` — also name-derived, so equivalent
to the row key. Either works; `makeShiftKey` is what the frontend already uses everywhere.)

## Data model — one record per transfer
```
{
  slotKey    : "date|pos|origOwner|range",   // which duty (master row) — stable
  newOwner   : "D",                          // who holds it after this record
  fromNote   : "C",                          // who they say they got it from (claim, not a link)
  recordedBy : "D",                          // login identity that entered it (accountability)
  at         : "2026-07-06T09:00:00Z",       // LWW tiebreak (server or client ts)
  action     : "transfer" | "swap",
  pairId     : "<actionId>",                 // swap only: links the two legs for display
  _visibility: "draft" | "public"            // keep the Draft/Publish layer
}
```

## Resolution (replaces chain walking)
```
currentOwner(slotKey) = newOwner of the latest PUBLIC record for slotKey (max `at`),
                        else origOwner (no record → master owner).
```
- **Transfer** (give / retro / manual reassign): one record. `newOwner` = receiver.
- **Swap A↔B**: two records sharing `pairId` — {slot: A-duty → B} + {slot: B-duty → A}.
- **Undo / revert**: add a record `newOwner = origOwner` (or delete the record). Latest wins.
- **Two people disagree**: latest `at` wins; both stay in the log → audit resolves it.

## Rendering
- **No name filter (room / date):** for each master row, show `currentOwner(slotKey)`. If it
  differs from origOwner, strike the origin row and show the current owner. "Who's on duty now."
- **Filter by person X:**
  - **Holds now:** slots where `currentOwner === X` (own untouched + received).
  - **Gave away:** slots where `origOwner === X` but `currentOwner ≠ X` (struck, with "→ to whom").
  - **Timeline:** all records for that slot, oldest→newest, each line "by `recordedBy` · from
    `fromNote` · `at`". This is the "สืบความจริง" ledger.

## What this replaces vs keeps
| Component | Fate |
|---|---|
| `_g_` chain keys, `_resolveToReal`, `buildChain`, ghost 3-pass | **replaced** by per-slot latest-record lookup |
| retro multi-hop builder, `_retroFinal`, mirror (`_projectLocalRetro`) | **dropped** — a transfer is one record |
| Draft/Publish (`_visibility`, inline 🌐, SYNC gating, publishAction) | **kept** — orthogonal |
| signed-by-login (`recordedBy`) | **kept / formalized** |
| backend payload round-trip (`Phase_Z_B3_Sync.js:92` stores full JSON) | **kept** — new fields ride along |
| `Phase_PathB_Global._phxApplyOverlaysGlobally` | **rewrite** to LWW (currently applies give/add/swap per-record; make it group-by-slot + latest) |

## Scope options
- **A (safe, small):** LWW only for retro/manual reassign (one record). Keep v3.42 give/swap/ghost
  engine for in-app 2-tap actions. Least risk, doesn't touch stabilized code.
- **B (clean, bigger):** all of give/swap/retro become ownership records; one LWW resolver;
  delete ghost 3-pass + chain resolver. Simplest long-term, but rewrites the core render for 300
  users. De-risk: build LWW resolver alongside, assert it matches the chain resolver on existing
  data (extend `pb-tests.js`), then switch behind a flag.

## Open items to confirm before coding
1. Scope A vs B.
2. `at` source: client timestamp (device clock skew risk) vs server-stamped on publish (safer for LWW ties).
3. Conflicting concurrent records: pure latest-wins, or "warn if two records within N minutes"?
4. Migration: existing `_g_`-chained overlays → flatten to one record per slot (latest) on read.
5. Swap display: keep the paired color dot? (pairId enables it.)
