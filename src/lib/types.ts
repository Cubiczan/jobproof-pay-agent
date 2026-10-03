export type PaymentStatus =
  | "unpaid"
  | "awaiting_ai"
  | "ai_failed"
  | "ready_to_pay"
  | "order_created"
  | "paid"
  | "payout_held"
  | "payout_sent"
  | "error";

/** Text-only Jev gate recorded before a contractor payout. */
export type JevPayoutDecision = {
  /**
   * approve may continue into PayPal only when confidence meets the floor and
   * the dispute Noul is below 0.5. hold stops. skipped means no API key.
   */
  decision: "approve" | "hold" | "skipped";
  /** True only after the existing PayPal payout function was invoked. */
  payoutAttempted: boolean;
  model: string | null;
  choice: string | null;
  confidence: number | null;
  /** P(the note disputes, changes, or fails to support this payout). */
  noul: number | null;
  probabilities: Record<string, number> | null;
  note: string;
  evaluatedAt: string;
};

export type AiScoreResult = {
  score: number;
  passed: boolean;
  threshold: number;
  reasons: string[];
  method: "local" | "openai";
  details: Record<string, number | string | boolean>;
};

export type Job = {
  id: string;
  title: string;
  description?: string;
  contractorEmail: string;
  contractorName?: string;
  amount: number;
  currency: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  beforeImageMeta?: ImageMeta;
  afterImageMeta?: ImageMeta;
  aiScore?: AiScoreResult;
  paymentStatus: PaymentStatus;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalPayoutBatchId?: string;
  jevPayout?: JevPayoutDecision;
  createdAt: string;
  updatedAt: string;
  notes?: string;
};

export type ImageMeta = {
  name: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
  isSample?: boolean;
  uploadedAt: string;
};

export type CreateJobInput = {
  title: string;
  description?: string;
  contractorEmail: string;
  contractorName?: string;
  amount: number;
  currency?: string;
};
