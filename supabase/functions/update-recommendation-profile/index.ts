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

    const { list_id, recommendation_text, user_feedback, profile_snapshot } =
      (await req.json()) as {
        list_id: string;
        recommendation_text?: string;
        user_feedback: string;
        profile_snapshot?: string | null;
      };
    if (!list_id || user_feedback == null)
      return new Response(
        JSON.stringify({ error: "list_id and user_feedback required" }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );

    const currentProfile = profile_snapshot ?? "Ingen tidigare profil.";
    const prompt = `Uppdatera denna rekommendationsprofil baserat på användarens feedback. Returnera ENDAST den uppdaterade profilen som en kort text (1–3 meningar), ingen JSON. Nuvarande profil: ${currentProfile}. Rekommenderat förslag: ${recommendation_text ?? "okänt"}. Användarens feedback: ${user_feedback}`;

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
    const newSnapshot = (
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? currentProfile
    ).trim();

    const { error } = await supabase
      .from("recommendation_profiles")
      .upsert(
        {
          user_id: user.id,
          list_id,
          profile_snapshot: newSnapshot,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,list_id" }
      );
    if (error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    await supabase.from("recommendation_feedback").insert({
      user_id: user.id,
      list_id,
      recommendation_text: recommendation_text ?? null,
      user_feedback,
    });

    return new Response(JSON.stringify({ profile_snapshot: newSnapshot }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
