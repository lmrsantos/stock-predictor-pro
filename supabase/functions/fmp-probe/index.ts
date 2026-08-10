Deno.serve(async () => {
  const key = Deno.env.get("FMP_API_KEY")!;
  const paths = ["profile?symbol=CSX", "income-statement?symbol=CSX&limit=2", "ratios?symbol=CSX&limit=1"];
  const out: Record<string,string> = {};
  for (const p of paths) {
    const r = await fetch(`https://financialmodelingprep.com/stable/${p}&apikey=${key}`);
    out[p] = r.status + " :: " + (await r.text()).slice(0, 300);
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Access-Control-Allow-Origin": "*" } });
});
