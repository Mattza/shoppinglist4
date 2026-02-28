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

    const { list_id } = (await req.json()) as { list_id: string };
    if (!list_id)
      return new Response(JSON.stringify({ error: "list_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const [{ data: archived }, { data: profile }] = await Promise.all([
      supabase
        .from("archived_items")
        .select("name")
        .eq("list_id", list_id)
        .order("archived_at", { ascending: false })
        .limit(100),
      supabase
        .from("recommendation_profiles")
        .select("profile_snapshot")
        .eq("user_id", user.id)
        .eq("list_id", list_id)
        .maybeSingle(),
    ]);
    const archiveNames = (archived ?? []).map((a) => a.name);
    const profileText = profile?.profile_snapshot ?? "Ingen tidigare profil.";

    const prompt = `Du är en inköpsassistent. Baserat på användarens tidigare borttagna/inköpta varor (arkivet) och deras rekommendationsprofil, ge 5–8 korta förslag på vad de kanske vill lägga till på sin handlarlista. Svara ENDAST med en JSON-array av strängar, inget annat. Exempel: ["Mjölk","Bröd"]. Arkiv (senaste): ${archiveNames.join(", ") || "tomt"}. Rekommendationsprofil: ${profileText}`;

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
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    let suggestions: string[];
    try {
      suggestions = JSON.parse(text.trim());
      if (!Array.isArray(suggestions)) suggestions = [];
    } catch {
      suggestions = [];
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
