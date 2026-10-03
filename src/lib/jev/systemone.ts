/**
 * System One HTTP client.
 *
 * Call shape matches icohangar-ops/jobproof `lib/jev/client.ts`, checked against
 * current docs:
 * - POST https://thejevai.com/v1/systemone (jobproof default; still documented)
 * - POST https://api.typesafe.ai/v1/systemone (TypeSafe host, same JSON body)
 * Body: { model, state, questions }. Auth: Authorization: Bearer <key>.
 * Questions are Choice, Score, or Noul. Jev does not accept images.
 */

export const DEFAULT_SYSTEMONE_URL = "https://thejevai.com/v1/systemone";
export const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_MODEL = "jev-latest";

export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export type ScoreQuestion = {
  type: "score";
  instructions: string;
  criteria: string[];
};

export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
};

export type SystemOneQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export type SystemOneRequest = {
  model: string;
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, SystemOneQuestion>;
};

function retryDelayMs(headers: Headers): number {
  const millis = headers.get("retry-after-ms");
  if (millis != null && millis !== "" && Number.isFinite(Number(millis))) {
    return Math.min(Math.max(0, Number(millis)), 1000);
  }
  const seconds = headers.get("retry-after");
  if (seconds != null && seconds !== "" && Number.isFinite(Number(seconds))) {
    return Math.min(Math.max(0, Number(seconds) * 1000), 1000);
  }
  return 200;
}

export function resolveSystemOneUrl(env: Record<string, string | undefined>): string {
  return (env.JEV_API_URL ?? "").trim() || DEFAULT_SYSTEMONE_URL;
}

export function resolveModel(env: Record<string, string | undefined>): string {
  return (env.JEV_MODEL ?? "").trim() || DEFAULT_MODEL;
}

export function resolveJevApiKey(env: Record<string, string | undefined>): string {
  return (env.JEV_API_KEY ?? "").trim();
}

/** POST one System One evaluation. One retry on 429 or 529, matching jobproof. */
export async function postSystemOne(
  body: SystemOneRequest,
  options: { apiKey: string; url: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 4000;
  let delayMs = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const response = await fetchImpl(options.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "jobproof-pay-agent/0.1",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if ((response.status === 429 || response.status === 529) && attempt === 0) {
      delayMs = retryDelayMs(response.headers);
      continue;
    }
    if (!response.ok) throw new Error(`Jev request failed: ${response.status}`);
    return response.json() as Promise<unknown>;
  }
  throw new Error("Jev request failed");
}
