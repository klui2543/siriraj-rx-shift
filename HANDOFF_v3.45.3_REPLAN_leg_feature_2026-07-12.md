# HANDOFF — RE-PLAN the ไม้ (leg) feature — 2026-07-12 (session end)

Branch **`main`**, tip **`8762ed7`**, all pushed + clasp'd. **STOP-AND-RE-PLAN handoff**, not a
"continue building" one.

## ⛔ The decision (Klui, end of session)
> "เละ และแย่มากๆ ตั้งแต่มีระบบส่งไม้มา ระบบเริ่มซับซ้อนมากขึ้นจนเริ่มเละแล้ว …
> มาวางแผนใหม่ใน Session หน้า ผมว่ามีแนวโน้มที่จะลบ Fx ไม้ออกครับ"

Klui finds the **ไม้ (leg) system เละ in ALL three ways** (he picked all): **UX confusing/complex ·
behavior buggy/inconsistent · code too complex**. He wants to **re-plan next session** and is
**leaning toward REMOVING the ไม้ feature** (how far = to decide together next session).

**Do NOT build more leg features. Do NOT do a hasty revert.** Next session opens with a
planning conversation: remove vs. drastically simplify, and how far back.

## ✅ Reassurance (say this to Klui first next session)
The **entire** ไม้/relay system is behind **`window._relayEnabled`** (localStorage `relay_legs`,
**DEFAULT OFF**, `Index.html:2779`). Real ward users see **none** of it — the mess only appears when
the flag is flipped ON to test. So **nothing is broken in production**, and removal is **low-risk +
fully reversible**. This should lower the stress: it's contained, not live.

## 🔪 Rollback / removal map (for planning — nothing done yet)
Two clean levels, pick in the planning convo:

**Level A — remove ONLY today's HANDOFF (ยก/แลกไม้), keep the base ต่อเวร/แบ่งไม้ split.**
- Today's handoff = commits **`21731a6` … `99cdc7e`** (pt1→pt8b, all this session). The clean base
  BEFORE the handoff = **`36ceb99`** (base ต่อเวร split, which Klui called "feature-complete" last
  session).
- Caveat: a plain `git revert 36ceb99..HEAD` would also revert the interleaved docs/stamps and the
  non-relay nothing-else (there was no non-relay work today) — cleaner to hand-excise the leg-handoff
  code (functions listed below) OR reset a throwaway branch to `36ceb99` and cherry-pick nothing.
- Functions/ْsurfaces ADDED today for the handoff (excision checklist):
  `_relayLegOverrides`, `_relayApplyOverrides`, `_relayLegsFor`, `_relayActorName`,
  `_relayLegWindowText`, `_relayAuthorOverride`, `_relayLegStepDesc`, `_legSwapColor`,
  `_relayOpenLegMenu` (rewritten), `renderLegMenuStep`, `_relayLegGiveStart`, `_relayLegSwapStart`,
  `_relayLegEditAllFromMenu`, `_relayLegWholeFromMenu`, `_relayLegGiveCommit`, `_relayLegSwapCommit`;
  `actionState.{legSwap,legGive,legMenu}`; the `relayleg` branch in `swfOpenConfirm`, `_swfSummaryHtml`,
  `_swfActionShifts`, `_pbChainReps`, `_collectConnectedChain` (pairId), `renderPublishModal`
  typeText/relText; the `_relayStruck` emission in `_relayExpand` + its renderTable/calendar branches;
  the `__legswap` add-strike branches in both `getUsedMap`s; `data-relay-leg*` attrs on leg rows.
  All of it is `window._relayEnabled`-gated and reads a NEW action type `relayleg` (server-free — no
  GAS rows to clean).

**Level B — remove the ENTIRE ไม้/relay system (base split + handoff).**
- Bigger: the base relay landed across v3.45 (last session, many commits). Since it's ALL flag-gated
  OFF, the lowest-risk option may be to **leave it dormant** (flag off = dead code path, users never
  see it) rather than a risky wide excision — decide next session whether dead-but-off is acceptable
  or a full removal is wanted.

## 🧭 Next-session opening checklist
1. Lead with the reassurance (flag OFF → not live).
2. Ask Klui: (a) Level A or Level B? (b) hard-remove the code, or just leave it flag-OFF/dormant?
   (c) if any leg idea survives, what's the ONE simplest version worth keeping (e.g. nothing, or
   just "split a shift for display" with no handoffs at all)?
3. Only then act. Verify with a fresh check + confirm the non-relay app is byte-for-byte unaffected
   (diff the flag-OFF render).

## Lesson (for me)
I built the handoff in ~10 incremental "just one more fix" stages (pt1→pt8b) across the session,
each locally reasonable, but they compounded into a system Klui calls เละ. The tell I missed:
**แลกไม้ is fundamentally complex because a ไม้ isn't a whole shift** — that should have been a
"do we even want this?" checkpoint BEFORE 8 stages of symmetry hacks, not after. Step back and
re-scope sooner when a feature needs escalating hacks to stay consistent.

## Today's leg-handoff commits (all flag-gated, all pushed)
```
21731a6 pt1 sticky-note override      2acf2ab pt3 timeline step + holder
10febe2 pt2 cell-picker → leg menu    d100d21 pt4 timeline = original split
cfc9527 pt5 received-shift dot         0c81a43 pt6 golden dot both sides
e61339a pt7 reuse popup + main wording 1f163d3 pt8 struck source rows
99cdc7e pt8b actor name + partner strike swap-style
```
Verified green throughout (resolver/invariant/menu harnesses in the session scratchpad), but
"green harnesses" ≠ "not เละ" — the harnesses tested the pieces, not the whole's coherence.
