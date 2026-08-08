import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`qf:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.slice(0, 128) : "";
    if (deviceId.length < 8) return json({ error: "Invalid device id" }, 400);

    const forwarded = req.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0].trim();
    const ipHash = ip ? await hashIp(ip) : null;
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300);

    const { data, error } = await supabase.rpc("record_user_device", {
      _user_id: user.id,
      _device_id: deviceId,
      _ip_hash: ipHash,
      _user_agent: userAgent,
    });

    if (error) {
      console.error("record_user_device failed", error);
      return json({ error: "Could not record device" }, 500);
    }

    return json(data);
  } catch (e) {
    console.error("session-heartbeat error", e);
    return json({ error: (e as Error).message }, 400);
  }
});
