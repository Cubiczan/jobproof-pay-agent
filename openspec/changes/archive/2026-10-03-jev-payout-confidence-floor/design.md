## Context

The payout gate in `src/lib/jev/payout-gate.ts` already POSTs one System One body to `https://thejevai.com/v1/systemone` (override: `JEV_API_URL`) with a Choice of `approve` or `hold`. `parsePayoutChoice` already reads `confidence`. `payoutAfterJevGate` calls PayPal whenever the decision is not `hold`, so a confident wrong `approve` pays. System One answers a Noul in the same `questions` map as `{ type: "noul", noul: number }` — P(yes) from 0 to 1, with no separate confidence field.

## Goals / Non-Goals

**Goals:**

- Hold unless the Choice is `approve`, confidence is at least 0.85, and the dispute Noul is below 0.5.
- One request, both questions, same state (who, amount, reason). No photos. No amount calculation. No legal judgment.
- Fail closed on every other result, including a failed call. Unset `JEV_API_KEY` makes no network call.

**Non-Goals:**

- Changing the PayPal order, capture, or payout implementation.
- Switching the default host to `https://api.typesafe.ai`.
- Asking Jev for a dollar amount, a Score, or a legal conclusion.

## Decisions

1. `PAYOUT_CONFIDENCE_FLOOR` is `0.85`. Continue only when `confidence >= PAYOUT_CONFIDENCE_FLOOR`. Missing or non-finite confidence holds.
2. `PAYOUT_DISPUTE_NOUL` is `0.5`. The Noul question asks whether the written note disputes, changes, or fails to support this payout. `noul >= 0.5` holds. A value below 0 holds as unusable. Only `0 <= noul < 0.5` counts as "does not dispute."
3. Question ids stay `payout_gate` (Choice) and `payout_dispute` (Noul) on the existing request builder. The client, URL, and retry behavior stay as they are.
4. A hold Choice still holds even when confidence is high and the Noul is low. Checks run only after the Choice is `approve`.
5. The stored decision keeps `choice` and `confidence` and adds `noul` so a held approve still shows what Jev returned. The notice still says Jev does not send the payout and is not the legal or financial judgment.

## Risks / Trade-offs

- 0.85 will hold some approves the previous gate would have paid, including the old fixture confidence of 0.84. That is the hole this closes.
- A Noul near 0.5 is uncertain. The stated rule treats that uncertainty as a hold.
- Removing `JEV_API_KEY` still restores today's path.

## Migration Plan

No data migration. Older `jevPayout` records simply lack `noul`. New decisions always set it.

## Open Questions

- None. The floor is a named constant so it can move without a second design pass.
