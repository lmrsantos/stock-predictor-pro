import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REVIEWER_EMAIL = "chatgpt-reviewer@quant-forecast.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let key = url.searchParams.get("key") ?? "";
    if (!key && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      key = body?.key ?? "";
    }

    const expected = Deno.env.get("REVIEWER_ACCESS_KEY") ?? "";
    if (!expected || key !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Ensure the reviewer account exists and is confirmed.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let reviewer = list?.users?.find((u) => u.email?.toLowerCase() === REVIEWER_EMAIL);

    if (!reviewer) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: REVIEWER_EMAIL,
        password: crypto.randomUUID() + crypto.randomUUID(),
        email_confirm: true,
      });
      if (createErr) throw createErr;
      reviewer = created.user!;
    }

    // Ensure top-tier access in both environments (no Stripe needed).
    const periodEnd = new Date(Date.now() + 90 * 86400000).toISOString();
    for (const environment of ["sandbox", "live"]) {
      await admin.from("subscriptions").upsert(
        {
          user_id: reviewer.id,
          stripe_subscription_id: `reviewer_${environment}`,
          stripe_customer_id: "reviewer_customer",
          product_id: "elite",
          price_id: "elite_yearly",
          status: "active",
          environment,
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd,
        },
        { onConflict: "stripe_subscription_id" },
      );
    }

    // Top up AI actions so every feature is usable.
    const { data: wallet } = await admin
      .from("ai_credit_wallets")
      .select("balance")
      .eq("user_id", reviewer.id)
      .maybeSingle();
    if (!wallet || Number(wallet.balance) < 1000) {
      await admin.rpc("grant_ai_credits", {
        _user_id: reviewer.id,
        _amount: 5000,
        _note: "Reviewer access top-up",
      });
    }

    // Mint a one-time magic-link token — no password is ever exposed.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: REVIEWER_EMAIL,
    });
    if (linkErr) throw linkErr;

    return new Response(
      JSON.stringify({ token_hash: link.properties.hashed_token, email: REVIEWER_EMAIL }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("reviewer-login failed", e);
    return new Response(JSON.stringify({ error: "Reviewer login failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
