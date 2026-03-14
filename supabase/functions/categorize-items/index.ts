import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "604800",
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

    const { list_id, items } = (await req.json()) as {
      list_id: string;
      items: string[];
    };
    if (!list_id || !items?.length)
      return new Response(
        JSON.stringify({ error: "list_id and items required" }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );

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

    const categoryList = categories
      .map((c) => `${c.name} (id: ${c.id})`)
      .join(", ");
    const itemsList = items.map((i) => `- ${i}`).join("\n");
    const prompt = `Du är en assistent som kategoriserar inköpsvaror. Givet dessa kategorier och varor, returnera ENDAST en JSON-array utan annan text. Varje element: {"item": "exakt varunamn som användaren skrev", "category_id": "uuid för kategorin"}. Kategorier: ${categoryList}. Varor:\n${itemsList}. Använd bara de angivna category id:n.`;

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
    let mapping: { item: string; category_id: string }[];
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

    const validIds = new Set(categories.map((c) => c.id));
    const toInsert = mapping
      .filter((m) => validIds.has(m.category_id))
      .map((m) => ({
        list_id,
        category_id: m.category_id,
        name: m.item,
        created_by: user.id,
      }));
    if (toInsert.length) await supabase.from("list_items").insert(toInsert);

    return new Response(JSON.stringify({ added: toInsert.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
