import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "604800",
};

function ms(round = 2) {
  return (t: number) => (Math.round(t * 10 ** round) / 10 ** round).toFixed(round);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const start = performance.now();
  const timing: Record<string, string> = {};

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      }
    );

    const t0 = performance.now();
    const {
      data: { user },
    } = await supabase.auth.getUser(
      req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
    );
    timing.auth_ms = ms()(performance.now() - t0);

    if (!user)
      return new Response(JSON.stringify({ error: "Unauthorized", timing }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const { list_id } = (await req.json()) as { list_id?: string };
    if (!list_id)
      return new Response(JSON.stringify({ error: "list_id required", timing }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const t1 = performance.now();
    const [categoriesRes, listItemsRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("list_id", list_id)
        .order("sort_order"),
      supabase
        .from("list_items")
        .select("id, name, category_id")
        .eq("list_id", list_id),
    ]);

    const categories = categoriesRes.data ?? [];
    const listItems = listItemsRes.data ?? [];
    timing.db_fetch_ms = ms()(performance.now() - t1);

    if (!categories.length)
      return new Response(JSON.stringify({ error: "No categories", timing }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    if (!listItems.length)
      return new Response(JSON.stringify({ updated: 0, timing }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const categoryList = categories
      .map((c) => `${c.name} (id: ${c.id})`)
      .join(", ");
    const itemsList = listItems
      .map((i) => `- id: ${i.id}, name: ${i.name}`)
      .join("\n");
    const prompt = `Du är en assistent som sorterar inköpsvaror i rätt kategorier. Givet dessa kategorier och befintliga varor (med id och namn), returnera ENDAST en JSON-array utan annan text. Varje element: {"item_id": "uuid för varan", "category_id": "uuid för kategorin"}. Kategorier: ${categoryList}. Varor:\n${itemsList}. Använd bara de angivna category id:n och item id:n. Placera varje vara i den mest lämpliga kategorin.`;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey)
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set", timing }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const t2 = performance.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      timing.gemini_ms = ms()(performance.now() - t2);
      return new Response(
        JSON.stringify({ error: "Gemini error", details: err, timing }),
        {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let mapping: { item_id: string; category_id: string }[];
    try {
      mapping = JSON.parse(text.trim());
    } catch {
      timing.gemini_ms = ms()(performance.now() - t2);
      return new Response(
        JSON.stringify({ error: "Invalid JSON from Gemini", raw: text, timing }),
        {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }
    timing.gemini_ms = ms()(performance.now() - t2);

    const validCategoryIds = new Set(categories.map((c) => c.id));
    const validItemIds = new Set(listItems.map((i) => i.id));
    const safeMapping = mapping.filter(
      (m) =>
        validItemIds.has(m.item_id) &&
        validCategoryIds.has(m.category_id) &&
        listItems.find((i) => i.id === m.item_id)?.category_id !== m.category_id
    );

    const t3 = performance.now();
    const { data: updated, error: rpcError } = await supabase.rpc(
      "apply_list_item_category_mapping",
      { p_list_id: list_id, p_mapping: safeMapping }
    );
    timing.db_update_ms = ms()(performance.now() - t3);
    if (rpcError)
      return new Response(
        JSON.stringify({
          error: "DB update failed",
          details: rpcError.message,
          timing,
        }),
        {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );

    timing.total_ms = ms()(performance.now() - start);
    return new Response(JSON.stringify({ updated: updated ?? 0, timing }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    timing.total_ms = ms()(performance.now() - start);
    return new Response(JSON.stringify({ error: String(e), timing }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
