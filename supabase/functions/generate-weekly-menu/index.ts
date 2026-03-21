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

    const { list_id, preferences, known_ratio } = (await req.json()) as {
      list_id: string;
      preferences?: string;
      known_ratio?: number;
    };
    if (!list_id)
      return new Response(JSON.stringify({ error: "list_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const ratio = Math.max(0, Math.min(100, Math.round(known_ratio ?? 70)));

    const { data: recipes, error: recipesError } = await supabase
      .from("list_recipes")
      .select("name, score")
      .eq("list_id", list_id);
    if (recipesError)
      return new Response(JSON.stringify({ error: recipesError.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const { data: savedMenus, error: savedMenusError } = await supabase
      .from("saved_weekly_menus")
      .select("meals, week_start")
      .eq("list_id", list_id)
      .order("week_start", { ascending: false })
      .limit(6);
    if (savedMenusError) {
      console.warn("saved_weekly_menus:", savedMenusError.message);
    }

    const recentMeals: string[] = [];
    for (const row of (savedMenusError ? [] : savedMenus) ?? []) {
      const m = row.meals as unknown;
      if (!Array.isArray(m)) continue;
      for (const item of m) {
        const s = String(item).trim();
        if (s) recentMeals.push(s);
        if (recentMeals.length >= 14) break;
      }
      if (recentMeals.length >= 14) break;
    }

    const rows = recipes ?? [];
    const banned = rows.filter((r) => r.score === 0).map((r) => r.name);
    const weighted = rows
      .filter((r) => r.score > 0)
      .map((r) => ({
        name: r.name,
        score: r.score,
        weight: Math.max(1, r.score * r.score),
      }));

    const weightedLines = weighted
      .map(
        (w) =>
          `- ${w.name} (poäng ${w.score}, relativ vikt ${w.weight} — högre poäng ska väljas oftare)`
      )
      .join("\n");

    const pref =
      (preferences ?? "").trim() || "Inga extra preferenser angivna.";

    const prompt = `Du planerar middagar för en vecka (måndag till söndag) i Sverige.


${pref ? `Användarens extra önskemål och kontext: ${pref}` : ""}

Parameter "andel från receptbank" = ${ratio} av 100.
- 100 betyder: välj i möjlig mån endast rätter från receptlistan nedan, med högre poäng oftare än lägre. Du får upprepa en rätt högst en gång om listan är kort.
- 0 betyder: föreslå sju olika huvudrätter som INTE finns i receptlistan, men som känns som naturliga variationer i samma stil som familjen gillar (utifrån listan och preferenserna).
- Värden däremellan: ungefär ${ratio}% av måltiderna ska komma från receptbanken (väg högre poäng starkare), resten får vara nya förslag i liknande stil.

Recept vi har sparat med poäng 1–5 (ju högre desto mer gillar vi rätten):
${weightedLines || "(tomt — hitta själv varierade middagar utifrån preferenserna.)"}

Rätter med poäng 0 får ALDRIG föreslås: ${banned.length ? banned.join(", ") : "(inga)"}

Nyligen i sparade veckomenyer (senaste upp till 14 måltider, nyast först) — undvik att upprepa exakt samma rätter; välj variation:
${recentMeals.length ? recentMeals.join(", ") : "(inga sparade veckor än — ingen begränsning här)"}

Svara ENDAST med JSON i formatet:
{"meals":["Måndag: ...","Tisdag: ...","Onsdag: ...","Torsdag: ...","Fredag: ...","Lördag: ...","Söndag: ..."]}
Varje sträng ska vara kort (rättnamn, ev. en bisats). Svenska. Exakt 7 element.`;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey)
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });

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
      return new Response(
        JSON.stringify({ error: "Gemini error", details: err }),
        {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    let meals: string[] = [];
    try {
      const parsed = JSON.parse(text.trim()) as { meals?: unknown };
      if (Array.isArray(parsed.meals)) {
        meals = parsed.meals.map((m) => String(m).trim()).filter(Boolean);
      }
    } catch {
      meals = [];
    }

    if (meals.length !== 7) {
      return new Response(
        JSON.stringify({
          error: "Ogiltigt svar från AI",
          raw: text.slice(0, 500),
        }),
        {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ meals }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
