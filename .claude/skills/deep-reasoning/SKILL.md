---
name: deep-reasoning
description: "Staged reasoning before a hard decision: design / architecture / security / protocol / storage choices, anything large or hard to reverse, or a root cause that has already resisted one fix. Forces evidence, 2-3 options, a pre-mortem and a recorded conclusion. Skip for small, already-clear work."
---

# Deep reasoning

Use before committing to a decision that is hard to reverse. Depth by size: **M** = steps 1, 2, 5 in a few lines; **L** = all five steps plus a second-opinion call (an advisor tool, a stronger model or a reviewer). Small or obvious work: skip.

1. **Frame.** One sentence: the decision. List hard constraints (project rules, real data, protocol compatibility) and what must not break.
2. **Evidence, not memory.** Look in the project's knowledge index first and open only the matching note; if nothing matches, search the shared knowledge library. Read the real code with the code-search tool instead of recalling it. For each note check its "applies when", "do not use when" and confidence.
3. **Options.** 2-3 real alternatives (include "do nothing / smaller"). For each: cost, risk, reversibility, what it forces later.
4. **Attack your pick.** Pre-mortem: "it failed in production - why?" Check edge cases, concurrent sessions or users, data already stored, other pages or clients sharing the entity. If a fact is unverified, verify it or label it as an assumption.
5. **Conclude and record.** Recommendation + the 1-2 reasons that decided it + how it will be verified (test or measurement). Write it in the project's decision record (the task's reasoning section or the fix log) with the note paths used. **L only:** make the second-opinion call before step 5 is final; if it contradicts evidence you found, reconcile with a second call.

Do not: build before the user says to; re-litigate a decision the user already made; expand scope beyond the item at hand.
