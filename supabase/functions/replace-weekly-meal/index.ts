import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "604800",
};

const WEEKDAYS = [
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
  "Söndag",
];

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

    const { list_id, preferences, known_ratio, meals, day_index } =
      (await req.json()) as {
        list_id: string;
        preferences?: string;
        known_ratio?: number;
        meals?: string[];
        day_index?: number;
      };

    if (!list_id)
      return new Response(JSON.stringify({ error: "list_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    const current = Array.isArray(meals) ? meals.map((m) => String(m).trim()) : [];
    const idx =
      typeof day_index === "number" && Number.isInteger(day_index)
        ? day_index
        : -1;
    if (idx < 0 || idx > 6 || current.length !== 7)
      return new Response(
        JSON.stringify({
          error: "meals måste vara 7 strängar och day_index 0–6",
        }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );

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

    const others = current
      .filter((_, i) => i !== idx)
      .join("\n");

    const toReplace = current[idx];
    const dayName = WEEKDAYS[idx] ?? "Okänd dag";

    const prompt = `Du hjälper till att byta ut EN middag i en veckomeny i Sverige.

Användarens extra önskemål och kontext:
${pref}

Parameter "andel från receptbank" = ${ratio} av 100 (samma betydelse som vid full veckoplanering: ${ratio}% från banken när det passar).

Recept vi har sparat med poäng 1–5:
${weightedLines || "(tomt)"}

Rätter med poäng 0 får ALDRIG föreslås: ${banned.length ? banned.join(", ") : "(inga)"}

Nyligen i sparade veckomenyer — undvik att upprepa exakt samma rätter:
${recentMeals.length ? recentMeals.join(", ") : "(inga)"}

Hela veckan ser ut så här (ändra INTE de sex andra — de listas bara så du håller samma stil och variation):
${current.map((m, i) => `${i + 1}. ${m}`).join("\n")}

Byt ENDAST ut måltid för ${dayName} (rad ${idx + 1}).
Nuvarande text för den dagen: "${toReplace}"

De sex övriga måltiderna (ska kvarstå oförändrade i meningen, du ska bara ersätta en rad):
${others}

Nya måltiden ska vara kort, på svenska, och följa samma format som den gamla (t.ex. "Måndag: ..." om originalet hade veckodagsnamn, annars bara rättnamn).

Svara ENDAST med JSON: {"meal":"..."} där meal är exakt en sträng — den nya måltiden för ${dayName}.`;

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
    let meal = "";
    try {
      const parsed = JSON.parse(text.trim()) as { meal?: unknown };
      if (typeof parsed.meal === "string") meal = parsed.meal.trim();
    } catch {
      meal = "";
    }

    if (!meal) {
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

    return new Response(JSON.stringify({ meal }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
