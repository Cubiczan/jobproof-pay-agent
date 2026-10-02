# Devpost submission draft — JobProof Pay Agent

## Elevator pitch (≤ short description)

AI verifies contractor before/after proof, then a PayPal agent creates a sandbox Order and Payouts the contractor — proof-gated agentic commerce.

## Full description

### The problem

Home-service and gig platforms still release payment on trust, chat screenshots, or slow human review. Fake “done” claims waste money; delayed payouts frustrate good contractors.

### The solution

**JobProof Pay Agent** puts an AI completeness gate in front of PayPal money movement:

1. Create a job with amount + contractor PayPal email  
2. Upload before/after proof photos (or use demo samples)  
3. Local AI scorer rates completeness (works with **zero** OpenAI keys for judges)  
4. On **pass**, a PayPal agent (`@paypal/agent-toolkit`) creates an **Orders v2** order for the customer  
5. After sandbox approval, we **capture** the order and optionally **Payout** the contractor  

### What we built

- Next.js App Router MVP with end-to-end sandbox payment flow  
- Deterministic local AI + optional OpenAI augmentation  
- PayPal Agent Toolkit tools: `create_order`, `get_order`, `pay_order`  
- PayPal Payouts API for contractor settlement  
- Jobs table for an operator / sponsor-friendly view  
- Demo mode when credentials are missing so the UX still demos  

### How PayPal + AI are used

- **AI:** local heuristic completeness model over image metadata + job context; optional LLM judge  
- **PayPal:** Orders v2 (customer pay) + Payouts (contractor) orchestrated by an agent toolkit layer  

### Demo instructions for judges

```bash
git clone <repo>
cd jobproof-pay-agent
cp .env.example .env.local
# Add PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET from developer.paypal.com (Sandbox)
npm install
npm run dev
```

Walkthrough: Home → Create job → Use kitchen samples → Run AI score → Create PayPal order → Approve with sandbox buyer → Success (capture + payout).

Without credentials, the same path runs in **demo mode** (simulated order/capture IDs) so you can still evaluate UX and AI gating.

### Built with

- Next.js, TypeScript, Tailwind CSS  
- `@paypal/agent-toolkit`  
- PayPal Orders v2 + Payouts (sandbox)  
- Optional OpenAI  

### Links

- Live demo: https://jobproof-pay-agent.vercel.app
- GitHub: https://github.com/icohangar-ops/jobproof-pay-agent
- Hackathon: https://paypalaihackathon.devpost.com/  
- Toolkit docs: https://developer.paypal.com/ai-tools/toolkit  

## Video script outline (< 3 min)

1. (0:00) Problem — contractors need proof-gated pay  
2. (0:20) Create job + sample before/after  
3. (0:50) Run AI score — show PASS reasons  
4. (1:20) Create PayPal order — show order ID / agent path  
5. (1:50) Sandbox approve + success — capture + payout IDs  
6. (2:20) Jobs table + why agentic commerce  
7. (2:45) Close — repo + MIT  

## Tools used (checkboxes for form)

- PayPal Developer Platform (Orders v2, Payouts, Agent Toolkit)  
- AI: local scorer + optional OpenAI  
- Optional sponsor: AG Grid–style jobs table (lightweight HTML table MVP)  


### Media

- Thumbnail: `docs/thumbnail.png`
- Demo video: `docs/jobproof-pay-agent-demo.mp4`
