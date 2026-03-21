import { supabase, getSupabaseFunctionsUrl } from "@/lib/supabase";
import type {
  ListRecipe,
  ListWeeklyMenuSettings,
  SavedWeeklyMenu,
} from "@/types/database";

export async function fetchListWeeklyMenuSettings(
  listId: string
): Promise<ListWeeklyMenuSettings | null> {
  const { data, error } = await supabase
    .from("list_weekly_menu_settings")
    .select("*")
    .eq("list_id", listId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as ListWeeklyMenuSettings;
}

export async function upsertListWeeklyMenuSettings(
  listId: string,
  preferences: string,
  knownRatio: number
): Promise<void> {
  const ratio = Math.max(0, Math.min(100, Math.round(knownRatio)));
  const { error } = await supabase.from("list_weekly_menu_settings").upsert(
    {
      list_id: listId,
      preferences,
      known_ratio: ratio,
    },
    { onConflict: "list_id" }
  );
  if (error) throw error;
}

export async function fetchListRecipes(listId: string): Promise<ListRecipe[]> {
  const { data, error } = await supabase
    .from("list_recipes")
    .select("*")
    .eq("list_id", listId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ListRecipe[];
}

export async function insertListRecipe(
  listId: string,
  name: string,
  score: number
): Promise<ListRecipe> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Namn saknas");
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  const { data, error } = await supabase
    .from("list_recipes")
    .insert({
      list_id: listId,
      name: trimmed,
      score: clamped,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ListRecipe;
}

export async function updateListRecipeScore(
  listId: string,
  recipeId: string,
  score: number
): Promise<void> {
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  const { error } = await supabase
    .from("list_recipes")
    .update({ score: clamped })
    .eq("id", recipeId)
    .eq("list_id", listId);
  if (error) throw error;
}

export async function deleteListRecipe(
  listId: string,
  recipeId: string
): Promise<void> {
  const { error } = await supabase
    .from("list_recipes")
    .delete()
    .eq("id", recipeId)
    .eq("list_id", listId);
  if (error) throw error;
}

export async function reorderListRecipes(
  listId: string,
  orderedIds: string[]
): Promise<void> {
  const { error } = await supabase.rpc("reorder_list_recipes", {
    p_list_id: listId,
    p_ordered_ids: orderedIds,
  });
  if (error) throw error;
}

export async function fetchSavedWeeklyMenus(
  listId: string
): Promise<SavedWeeklyMenu[]> {
  const { data, error } = await supabase
    .from("saved_weekly_menus")
    .select("*")
    .eq("list_id", listId)
    .order("week_start", { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    meals: Array.isArray(row.meals)
      ? (row.meals as string[]).map(String)
      : [],
  })) as SavedWeeklyMenu[];
}

export async function upsertSavedWeeklyMenu(
  listId: string,
  weekStart: string,
  meals: string[]
): Promise<void> {
  if (meals.length !== 7) throw new Error("Veckomen måste ha exakt 7 måltider");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: existing } = await supabase
    .from("saved_weekly_menus")
    .select("id")
    .eq("list_id", listId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase
      .from("saved_weekly_menus")
      .update({ meals })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("saved_weekly_menus").insert({
    list_id: listId,
    week_start: weekStart,
    meals,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function generateWeeklyMenu(
  listId: string,
  accessToken: string,
  preferences: string,
  knownRatio: number
): Promise<string[]> {
  const url = `${getSupabaseFunctionsUrl()}/generate-weekly-menu`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      list_id: listId,
      preferences: preferences.trim() || undefined,
      known_ratio: knownRatio,
    }),
  });
  const json = (await res.json()) as { meals?: string[]; error?: string; raw?: string };
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.meals ?? [];
}

export async function replaceWeeklyMeal(
  listId: string,
  accessToken: string,
  preferences: string,
  knownRatio: number,
  meals: string[],
  dayIndex: number
): Promise<string> {
  const url = `${getSupabaseFunctionsUrl()}/replace-weekly-meal`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      list_id: listId,
      preferences: preferences.trim() || undefined,
      known_ratio: knownRatio,
      meals,
      day_index: dayIndex,
    }),
  });
  const json = (await res.json()) as { meal?: string; error?: string; raw?: string };
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  const meal = json.meal?.trim();
  if (!meal) throw new Error("Tomt svar från servern");
  return meal;
}

export async function adjustListRecipeScore(
  listId: string,
  name: string,
  delta: -2 | -1 | 1 | 2,
  setZero: boolean
): Promise<{ recipe_name: string; recipe_score: number }> {
  const { data, error } = await supabase.rpc("adjust_list_recipe_score", {
    p_list_id: listId,
    p_name: name,
    p_delta: setZero ? 0 : delta,
    p_set_zero: setZero,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : data != null ? [data] : [];
  const row = rows[0] as
    | { recipe_name: string; recipe_score: number }
    | undefined;
  if (!row) throw new Error("Ingen rad returnerad");
  return row;
}
