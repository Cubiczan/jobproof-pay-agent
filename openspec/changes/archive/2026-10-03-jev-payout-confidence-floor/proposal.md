## Why

A confident wrong `approve` still creates a sandbox payout. Choice confidence is parsed and stored, then ignored. The written note can also dispute, change, or fail to support the payout, and nothing checks that before PayPal runs.

## What Changes

- Continue into the existing payout function only when the Choice is `approve`, its confidence is at least `PAYOUT_CONFIDENCE_FLOOR` (0.85), and a dispute Noul on the same state is below 0.5.
- Ask both questions in one System One POST to the host the app already uses (`https://thejevai.com/v1/systemone`). Do not add a second round trip.
- Treat a Noul at or above 0.5 as a dispute and hold. Any other choice, low or missing confidence, a missing or unusable Noul, a failed call, or a missing key does not create a payout. A missing key still skips the network call and keeps today's sandbox path.
- Do not send proof photos. Do not ask Jev to compute an amount or write a legal judgment. UI copy still says this is not the payout and not a legal judgment.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `payout-gate`: An approve Choice pays only when confidence meets the named floor and the parallel dispute Noul is below 0.5.

## Impact

- `src/lib/jev/payout-gate.ts` adds the Noul to the existing request and applies both checks before `createPayout`.
- The job screen and agent description state that approve alone does not send money.
- No new environment variable. Unset `JEV_API_KEY` stays the local path.
