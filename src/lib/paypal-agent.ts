/**
 * PayPal Agent layer — wraps @paypal/agent-toolkit (create_order / get_order / pay_order)
 * plus deterministic orchestration used by JobProof without requiring an LLM.
 */
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import {
  createOrder,
  captureOrder,
  createPayout,
  getPayPalMode,
  type CreatedOrder,
} from "./paypal";
import type { Job } from "./types";

let toolkit: PayPalAgentToolkit | null = null;

export function getPayPalToolkit(): PayPalAgentToolkit | null {
  if (getPayPalMode() === "demo") return null;
  if (toolkit) return toolkit;

  toolkit = new PayPalAgentToolkit({
    clientId: process.env.PAYPAL_CLIENT_ID!,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    configuration: {
      actions: {
        orders: { create: true, get: true, capture: true },
      },
      context: {
        sandbox: getPayPalMode() === "sandbox",
      },
    },
  });
  return toolkit;
}

export type AgentPayResult = {
  path: "agent-toolkit" | "rest-fallback" | "demo";
  order: CreatedOrder;
  approveUrl?: string;
};

/**
 * Agent action: after AI pass, create a PayPal Order for the customer to pay.
 * Tries toolkit create_order first; falls back to direct Orders v2 REST.
 */
export async function agentCreateCustomerOrder(
  job: Job,
  urls: { returnUrl: string; cancelUrl: string }
): Promise<AgentPayResult> {
  const mode = getPayPalMode();
  if (mode === "demo") {
    const order = await createOrder({
      amount: job.amount,
      currency: job.currency,
      description: `JobProof: ${job.title}`,
      customId: job.id,
      returnUrl: urls.returnUrl,
      cancelUrl: urls.cancelUrl,
    });
    return {
      path: "demo",
      order,
      approveUrl: order.links?.find((l) => l.rel === "approve")?.href,
    };
  }

  const tk = getPayPalToolkit();
  if (tk) {
    try {
      const tools = tk.getTools();
      const create = tools.create_order;
      if (create?.execute) {
        const result = await create.execute(
          {
            currencyCode: "USD",
            items: [
              {
                name: job.title.slice(0, 120),
                quantity: 1,
                description: `Contractor job ${job.id}`,
                itemCost: job.amount,
                taxPercent: 0,
                itemTotal: job.amount,
              },
            ],
            discount: 0,
            shippingCost: 0,
            shippingAddress: null,
            notes: `JobProof Pay Agent — ${job.id}`,
            returnUrl: urls.returnUrl,
            cancelUrl: urls.cancelUrl,
          },
          { toolCallId: `jp-create-${job.id}`, messages: [] }
        );
        const parsed =
          typeof result === "string" ? JSON.parse(result) : (result as CreatedOrder);
        const order = parsed as CreatedOrder;
        return {
          path: "agent-toolkit",
          order,
          approveUrl:
            order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")
              ?.href,
        };
      }
    } catch (err) {
      console.warn("[paypal-agent] toolkit create_order failed, using REST", err);
    }
  }

  const order = await createOrder({
    amount: job.amount,
    currency: job.currency,
    description: `JobProof: ${job.title}`,
    customId: job.id,
    returnUrl: urls.returnUrl,
    cancelUrl: urls.cancelUrl,
  });
  return {
    path: "rest-fallback",
    order,
    approveUrl: order.links?.find((l) => l.rel === "approve")?.href,
  };
}

export async function agentCaptureOrder(orderId: string) {
  const mode = getPayPalMode();
  if (mode === "demo" || orderId.startsWith("DEMO-")) {
    return captureOrder(orderId);
  }

  const tk = getPayPalToolkit();
  if (tk) {
    try {
      const tools = tk.getTools();
      const pay = tools.pay_order;
      if (pay?.execute) {
        const result = await pay.execute(
          { id: orderId },
          { toolCallId: `jp-pay-${orderId}`, messages: [] }
        );
        const parsed = typeof result === "string" ? JSON.parse(result) : result;
        const response = (parsed as { response?: { id: string; status: string; purchase_units?: { payments?: { captures?: { id: string }[] } }[] } })
          ?.response;
        if (response) {
          return {
            id: response.id,
            status: response.status,
            captureId: response.purchase_units?.[0]?.payments?.captures?.[0]?.id,
            raw: parsed,
          };
        }
      }
    } catch (err) {
      console.warn("[paypal-agent] toolkit pay_order failed, using REST", err);
    }
  }

  return captureOrder(orderId);
}

export async function agentPayoutToContractor(job: Job) {
  return createPayout({
    email: job.contractorEmail,
    amount: job.amount,
    currency: job.currency,
    note: `JobProof payout for "${job.title}" (${job.id})`,
    senderItemId: job.id.replace(/-/g, "").slice(0, 30),
  });
}

export function describeAgentCapabilities() {
  return {
    mode: getPayPalMode(),
    toolkitLoaded: Boolean(getPayPalToolkit() || getPayPalMode() === "demo"),
    tools: ["create_order", "get_order", "pay_order", "payouts (REST)"],
    aiRequired: false,
    notes:
      "JobProof uses a deterministic PayPal agent orchestrator. Optional OpenAI only augments the photo completeness scorer.",
  };
}
