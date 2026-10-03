## 1. Payout gate

- [x] 1.1 Add the System One client and the approve/hold Choice over the written payout request
- [x] 1.2 Run the gate inside the payout path so a hold skips PayPal Payouts and an approve calls the existing payout function
- [x] 1.3 Store the decision and show it on the job and success screens
- [x] 1.4 Leave an empty `JEV_API_KEY` in `.env.example`
- [x] 1.5 Cover a missing key and a hold with a test script
