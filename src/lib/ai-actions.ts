// User-facing translation of internal AI credits.
// 1 credit == 1 "AI action". Never show the word "credit" in the UI.

export const AI_ACTION_COSTS = {
  quant_agent: 1,
  chat_insights: 1,
  portfolio_advisor: 3,
  portfolio_advisor_chat: 1,
  ipo_intelligence: 5,
} as const;

export type AiActionKind = keyof typeof AI_ACTION_COSTS;

export const AI_ACTION_LABELS: Record<AiActionKind, string> = {
  quant_agent: "QuantAgent question",
  chat_insights: "Chart insight",
  portfolio_advisor: "Portfolio review",
  portfolio_advisor_chat: "Portfolio follow-up",
  ipo_intelligence: "IPO intelligence report",
};

export function actionCostLabel(kind: AiActionKind): string {
  const n = AI_ACTION_COSTS[kind];
  return n === 1 ? "1 AI action" : `${n} AI actions`;
}

export type UsageBand = "light" | "medium" | "heavy" | "over";

export interface UsageVerdict {
  band: UsageBand;
  label: string;
  hint: string;
}

/** Classifies how hard someone is using their monthly allowance. */
export function usageVerdict(used: number, allowance: number): UsageVerdict {
  const pct = allowance > 0 ? used / allowance : 0;
  if (pct >= 1) {
    return {
      band: "over",
      label: "Out of AI actions",
      hint: "Your monthly allowance is used up. Upgrade or top up to keep asking.",
    };
  }
  if (pct >= 0.7) {
    return {
      band: "heavy",
      label: "Heavy user",
      hint: "You're using most of your monthly allowance — a bigger plan is usually cheaper.",
    };
  }
  if (pct >= 0.3) {
    return {
      band: "medium",
      label: "Medium user",
      hint: "Comfortably inside your monthly allowance.",
    };
  }
  return {
    band: "light",
    label: "Light user",
    hint: "You have plenty of AI actions left this month.",
  };
}
