## Context

JobProof Pay Agent creates a PayPal sandbox Order, captures it, then calls Payouts (`createPayout` via `agentPayoutToContractor`). The jobproof repo (`icohangar-ops/jobproof`) already posts System One requests to `https://thejevai.com/v1/systemone` with `Authorization: Bearer`, `Content-Type: application/json`, and `{ model, state, questions }`. That host's current docs still publish the same URL and body. TypeSafe's own host is `https://api.typesafe.ai/v1/systemone` with the same body. Jev answers Choice, Score, or Noul. It does not accept images.

## Goals / Non-Goals

**Goals:**

- One Choice question, `approve` versus `hold`, over the written payout request (who, amount, reason) before `createPayout`.
- A hold persists on the job and does not call PayPal Payouts. An approve calls the existing payout function and does not invent a batch id.
- No `JEV_API_KEY` means the payout function runs as it does today.
- The UI shows the Choice and says it is a text gate, not the legal or financial judgment and not the payout.

**Non-Goals:**

- Replacing Orders v2, capture, or Payouts.
- Sending photos, running a vision model, or treating the Choice as authorization to move money by itself.
- A local financial policy that overrides an `approve` Choice.

## Decisions

1. Default URL is `https://thejevai.com/v1/systemone`, matching the verified jobproof client. `JEV_API_URL` overrides it, including to `https://api.typesafe.ai/v1/systemone`. Default model alias is `jev-latest` (current docs). `JEV_MODEL` overrides it. The key is only `JEV_API_KEY`, so an unset variable always keeps the old path.
2. The request state is a short text block: who, amount, reason. Image fields on the job are not copied into it.
3. Only the Choice `approve` continues. `hold`, any other choice, or a failed call while a key is set does not call `createPayout`. A transport or parse failure is a hold, not a crash and not an approve.
4. One retry on HTTP 429 or 529, matching the jobproof client, then hold.
5. `payout_held` is a payment status so the badge and the payout retry stay distinct from `paid` and `payout_sent`. Capture is not repeated on retry; retry hits the payout route, which runs the gate again.
6. The gate result is stored on `job.jevPayout`, including when the key was unset (`skipped`), so the screen can show which path ran.

## Risks / Trade-offs

- A configured key can hold a demo payout the sandbox would otherwise send. That is the gate. Retry runs it again.
- A hosted call sees the contractor email, amount, and reason. It does not see proof photos.
- Fail-closed on a bad response blocks the payout until the call succeeds with `approve` or the key is removed. Removing the key restores today's path.

## Migration Plan

No data migration. Existing jobs lack `jevPayout`. Unset `JEV_API_KEY` keeps payouts moving.

## Open Questions

- None. The Choice is the only question; Score and Noul stay available in the client types but this gate does not need them.
