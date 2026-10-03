## Why

A sandbox payout currently starts as soon as the customer payment is captured. Jev (TypeSafe System One) can read the written payout request and return a typed Choice before that call. The payout itself stays on PayPal Orders and Payouts.

## What Changes

- Before a contractor payout is created, send who, amount, and reason to the System One HTTP API as text, with a Choice of `approve` or `hold`.
- Show that Choice in the job UI. `hold` does not create a payout. `approve` continues into the existing sandbox payout function. The Choice does not send money.
- When `JEV_API_KEY` is unset, skip the call and keep today's payout path. Do not crash.
- Leave PayPal order create and capture unchanged.

## Capabilities

### New Capabilities

- `payout-gate`: A text-only Jev Choice runs before the PayPal payout and can hold it.

### Modified Capabilities

- None.

## Impact

- `src/lib/jev` calls `POST https://thejevai.com/v1/systemone` (the jobproof client host, still documented) with the System One body `{ model, state, questions }`. `JEV_API_URL` can point at `https://api.typesafe.ai/v1/systemone`.
- Job records gain `jevPayout`. A hold sets `paymentStatus` to `payout_held`.
- `.env.example` gains an empty `JEV_API_KEY`. No key is hardcoded and `.env` stays untracked.
