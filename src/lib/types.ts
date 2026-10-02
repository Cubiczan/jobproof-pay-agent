export type PaymentStatus =
  | "unpaid"
  | "awaiting_ai"
  | "ai_failed"
  | "ready_to_pay"
  | "order_created"
  | "paid"
  | "payout_sent"
  | "error";

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
