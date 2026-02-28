import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

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
    const {
      data: { user },
    } = await supabase.auth.getUser(
      req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
    );
    if (!user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const { list_id } = (await req.json()) as { list_id?: string };
    if (!list_id)
      return new Response(JSON.stringify({ error: "list_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("list_id", list_id)
      .order("sort_order");
    if (!categories?.length)
      return new Response(JSON.stringify({ error: "No categories" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const { data: listItems } = await supabase
      .from("list_items")
      .select("id, name, category_id")
      .eq("list_id", list_id);
    if (!listItems?.length)
      return new Response(JSON.stringify({ updated: 0 }), {
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
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
      return new Response(
        JSON.stringify({ error: "Gemini error", details: err }),
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
      return new Response(
        JSON.stringify({ error: "Invalid JSON from Gemini", raw: text }),
        {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    const validCategoryIds = new Set(categories.map((c) => c.id));
    const validItemIds = new Set(listItems.map((i) => i.id));
    let updated = 0;
    for (const m of mapping) {
      if (!validItemIds.has(m.item_id) || !validCategoryIds.has(m.category_id))
        continue;
      const current = listItems.find((i) => i.id === m.item_id);
      if (!current || current.category_id === m.category_id) continue;
      const { error } = await supabase
        .from("list_items")
        .update({ category_id: m.category_id })
        .eq("id", m.item_id)
        .eq("list_id", list_id);
      if (!error) updated++;
    }

    return new Response(JSON.stringify({ updated }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
