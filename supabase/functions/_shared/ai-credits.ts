// supabase/functions/_shared/ai-credits.ts
// Per-user AI credit metering. Every AI Gateway call in this project is charged
// to the signed-in user's wallet (plan allowance + purchased top-ups) so that
// end-user activity never silently drains the workspace balance.

import { createClient } from "npm:@supabase/supabase-js@2";

export const AI_CREDIT_COSTS = {
  quant_agent: 1,
  chat_insights: 1,
  portfolio_advisor: 3,
  portfolio_advisor_chat: 1,
  ipo_intelligence: 5,
} as const;

export type AiFeature = keyof typeof AI_CREDIT_COSTS;

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export interface ChargeOk {
  ok: true;
  userId: string;
  balance: number;
  cost: number;
  tier: string;
}
export interface ChargeFail {
  ok: false;
  response: Response;
}

/**
 * Authenticates the caller and debits `cost` credits for `feature`.
 * Returns a ready-to-return Response when the user is anonymous (401) or out
 * of credits (402, `code: "OUT_OF_CREDITS"`).
 */
export async function chargeAiCredits(
  req: Request,
  feature: AiFeature,
  corsHeaders: Record<string, string>,
  costOverride?: number,
): Promise<ChargeOk | ChargeFail> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return {
      ok: false,
      response: json(
        { error: "Sign in to use AI features.", code: "AUTH_REQUIRED" },
        401,
      ),
    };
  }

  const supabase = admin();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return {
      ok: false,
      response: json(
        { error: "Sign in to use AI features.", code: "AUTH_REQUIRED" },
        401,
      ),
    };
  }

  // Fair-use guard: one login shared across many devices burns the monthly
  // allowance fast, so hard-block clear abuse before spending anything.
  const { data: sharing } = await supabase.rpc("account_sharing_status", {
    _user_id: user.id,
  });
  const share = sharing as
    | { device_allowance: number; devices_24h: number }
    | null;
  if (share && share.devices_24h > share.device_allowance + 2) {
    return {
      ok: false,
      response: json(
        {
          error:
            "This login is active on too many devices. Plans are personal — sign out elsewhere or upgrade to continue.",
          code: "SHARING_LIMIT",
          devices: share.devices_24h,
          allowed: share.device_allowance,
        },
        429,
      ),
    };
  }

  const cost = costOverride ?? AI_CREDIT_COSTS[feature];
  const { data, error } = await supabase.rpc("consume_ai_credits", {
    _user_id: user.id,
    _feature: feature,
    _cost: cost,
  });


  if (error) {
    console.error("consume_ai_credits failed", error);
    return {
      ok: false,
      response: json(
        { error: "Could not verify your AI credits. Try again shortly.", code: "CREDIT_CHECK_FAILED" },
        500,
      ),
    };
  }

  const result = data as { allowed: boolean; balance: number; cost: number; tier: string };

  if (!result?.allowed) {
    return {
      ok: false,
      response: json(
        {
          error: "You're out of AI credits. Top up or upgrade your plan to keep using AI features.",
          code: "OUT_OF_CREDITS",
          balance: result?.balance ?? 0,
          cost,
          tier: result?.tier ?? "free",
        },
        402,
      ),
    };
  }

  return { ok: true, userId: user.id, balance: result.balance, cost, tier: result.tier };
}

/** Refunds a previously charged amount when the AI call itself failed. */
export async function refundAiCredits(userId: string, amount: number, note: string) {
  try {
    await admin().rpc("grant_ai_credits", {
      _user_id: userId,
      _amount: amount,
      _note: note,
    });
  } catch (e) {
    console.error("refundAiCredits failed", e);
  }
}
