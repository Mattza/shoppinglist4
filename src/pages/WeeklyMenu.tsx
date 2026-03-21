import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentList } from "@/hooks/useCurrentList";
import {
  fetchListRecipes,
  generateWeeklyMenu,
  adjustListRecipeScore,
  fetchSavedWeeklyMenus,
  upsertSavedWeeklyMenu,
  replaceWeeklyMeal,
  fetchListWeeklyMenuSettings,
  upsertListWeeklyMenuSettings,
} from "@/hooks/useListRecipes";
import { Button } from "@/components/Button";
import type { ListRecipe, SavedWeeklyMenu } from "@/types/database";
import {
  defaultSuggestedWeekMonday,
  toISODateString,
  parseISODateLocal,
  formatWeekRangeSv,
  toMondayFromAnyDateStr,
} from "@/lib/week";

const LEGACY_PREFS_KEY = (listId: string) => `weekly_menu_prefs_${listId}`;
const LEGACY_RATIO_KEY = (listId: string) => `weekly_menu_ratio_${listId}`;

const WEEKDAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"] as const;

function scoreForMealLine(recipeBank: ListRecipe[], line: string): number | null {
  const norm = line.trim().toLowerCase();
  const hit = recipeBank.find((r) => r.name.trim().toLowerCase() === norm);
  return hit ? hit.score : null;
}

function padMealsToSeven(meals: string[]): string[] {
  const x = [...meals];
  while (x.length < 7) x.push("");
  return x.slice(0, 7);
}

type SaveSavedVars = { weekStart: string; meals: string[] };
type ReplaceSavedVars = {
  weekId: string;
  weekStart: string;
  mealsSnapshot: string[];
  dayIndex: number;
};
type VoteVars = {
  mealLine: string;
  delta: -2 | -1 | 1 | 2;
  setZero: boolean;
};
type VoteResult = { recipe_name: string; recipe_score: number };

type SavedWeekBlockProps = {
  w: SavedWeeklyMenu;
  listId: string;
  weekStartStr: string;
  upcomingWeekMondayStr: string;
  recipeBank: ListRecipe[];
  saveSavedWeekMutation: UseMutationResult<void, Error, SaveSavedVars>;
  replaceSavedMealMutation: UseMutationResult<void, Error, ReplaceSavedVars>;
  voteMutation: UseMutationResult<VoteResult, Error, VoteVars>;
  busyGlobal: boolean;
};

function SavedWeekBlock({
  w,
  listId,
  weekStartStr,
  upcomingWeekMondayStr,
  recipeBank,
  saveSavedWeekMutation,
  replaceSavedMealMutation,
  voteMutation,
  busyGlobal,
}: SavedWeekBlockProps) {
  const [mealsLocal, setMealsLocal] = useState(() => padMealsToSeven(w.meals));
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setMealsLocal(padMealsToSeven(w.meals));
    setSaveHint(null);
    setEditing(false);
  }, [w.id, w.updated_at]);

  const dirty = useMemo(() => {
    if (mealsLocal.length !== w.meals.length) return true;
    return mealsLocal.some((m, i) => m.trim() !== (w.meals[i] ?? "").trim());
  }, [mealsLocal, w.meals]);

  const rangeLabel = useMemo(() => {
    const start = parseISODateLocal(weekStartStr);
    return Number.isNaN(start.getTime()) ? w.week_start : formatWeekRangeSv(start);
  }, [weekStartStr, w.week_start]);

  const isUpcomingWeek = weekStartStr === upcomingWeekMondayStr;

  function handleSave() {
    setSaveHint(null);
    saveSavedWeekMutation.reset();
    const trimmed = mealsLocal.map((m) => m.trim());
    if (trimmed.length !== 7) {
      setSaveHint("Veckomenyn måste ha exakt 7 rader.");
      return;
    }
    if (trimmed.some((m) => !m)) {
      setSaveHint("Fyll i alla dagar innan du sparar.");
      return;
    }
    saveSavedWeekMutation.mutate(
      { weekStart: weekStartStr, meals: trimmed },
      { onSuccess: () => setEditing(false) }
    );
  }

  function handleCancelEdit() {
    setMealsLocal(padMealsToSeven(w.meals));
    setSaveHint(null);
    saveSavedWeekMutation.reset();
    setEditing(false);
  }

  const busyAny = busyGlobal;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-sm font-medium text-text">{rangeLabel}</p>
          {isUpcomingWeek && (
            <span className="rounded-full bg-[#e0f2fe] px-2 py-0.5 text-xs font-medium text-[#0369a1]">
              Kommande vecka
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              className="px-2 py-1 text-xs text-text-muted"
              disabled={busyAny || saveSavedWeekMutation.isPending}
              onClick={handleCancelEdit}
            >
              Avbryt
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={busyAny}
              onClick={() => setEditing(true)}
            >
              Redigera
            </Button>
          )}
        </div>
      </div>

      <ul className="mt-3 space-y-4">
        {mealsLocal.map((line, index) => {
          const replacing =
            replaceSavedMealMutation.isPending &&
            replaceSavedMealMutation.variables?.weekId === w.id &&
            replaceSavedMealMutation.variables?.dayIndex === index;
          const pendingVote =
            voteMutation.isPending && voteMutation.variables?.mealLine === line;
          const shownScore = scoreForMealLine(recipeBank, line);
          const busyRow = pendingVote || replacing || busyAny;
          const dayLabel = WEEKDAY_SHORT[index] ?? `Dag ${index + 1}`;
          return (
            <li
              key={index}
              className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0"
            >
              <div className="flex items-start gap-3">
                <span className="w-9 shrink-0 self-start text-xs font-medium text-text-muted sm:w-10">
                  {dayLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-row items-start gap-2">
                    {editing ? (
                      <input
                        type="text"
                        value={line}
                        onChange={(e) => {
                          const next = [...mealsLocal];
                          next[index] = e.target.value;
                          setMealsLocal(next);
                        }}
                        className="min-h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                        aria-label={`${dayLabel}: rätt`}
                        disabled={busyAny}
                      />
                    ) : (
                      <p className="min-h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-3 py-2 text-sm font-medium text-text">
                        {line.trim() || "—"}
                      </p>
                    )}
                    <div className="flex max-w-[100vw] flex-wrap content-start items-start justify-end gap-1.5 sm:max-w-none sm:shrink-0">
                      {mealsLocal.length === 7 && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          disabled={busyAny || !listId}
                          onClick={() =>
                            replaceSavedMealMutation.mutate({
                              weekId: w.id,
                              weekStart: weekStartStr,
                              mealsSnapshot: [...mealsLocal],
                              dayIndex: index,
                            })
                          }
                          title="Ett nytt AI-förslag för den här dagen"
                        >
                          {replacing ? "…" : "Byt ut"}
                        </Button>
                      )}
                      {editing && (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            disabled={busyRow || !listId}
                            onClick={() =>
                              voteMutation.mutate({
                                mealLine: line,
                                delta: 1,
                                setZero: false,
                              })
                            }
                            title="Plus ett"
                          >
                            +1
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            disabled={busyRow || !listId}
                            onClick={() =>
                              voteMutation.mutate({
                                mealLine: line,
                                delta: 2,
                                setZero: false,
                              })
                            }
                            title="Plus två"
                          >
                            +2
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            disabled={busyRow || !listId}
                            onClick={() =>
                              voteMutation.mutate({
                                mealLine: line,
                                delta: -1,
                                setZero: false,
                              })
                            }
                            title="Minus ett"
                          >
                            −1
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            disabled={busyRow || !listId}
                            onClick={() =>
                              voteMutation.mutate({
                                mealLine: line,
                                delta: -2,
                                setZero: false,
                              })
                            }
                            title="Minus två"
                          >
                            −2
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            disabled={busyRow || !listId}
                            onClick={() =>
                              voteMutation.mutate({
                                mealLine: line,
                                delta: 1,
                                setZero: true,
                              })
                            }
                            title="Sätt till 0 — vill inte äta igen"
                          >
                            Noll
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {shownScore != null && (
                    <p className="mt-1.5 pl-0 text-xs text-text-muted sm:pl-0">
                      Sparad poäng i banken: {shownScore}/5
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {editing && (
      <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty || saveSavedWeekMutation.isPending || busyAny || !listId}
          onClick={handleSave}
        >
          {saveSavedWeekMutation.isPending ? "Sparar…" : "Spara ändringar"}
        </Button>
        {saveHint && (
          <p className="text-sm text-amber-700" role="status">
            {saveHint}
          </p>
        )}
        {saveSavedWeekMutation.isError && (
          <p className="text-sm text-red-600" role="alert">
            {saveSavedWeekMutation.error instanceof Error
              ? saveSavedWeekMutation.error.message
              : "Kunde inte spara."}
          </p>
        )}
        {replaceSavedMealMutation.isError &&
          replaceSavedMealMutation.variables?.weekId === w.id && (
            <p className="text-sm text-red-600" role="alert">
              {replaceSavedMealMutation.error instanceof Error
                ? replaceSavedMealMutation.error.message
                : "Kunde inte byta ut rätten."}
            </p>
          )}
      </div>
      )}
    </li>
  );
}

export default function WeeklyMenu() {
  const { listSlug } = useParams<{ listSlug: string }>();
  const queryClient = useQueryClient();
  const { data: list } = useCurrentList(listSlug ?? undefined);
  const listId = list?.id;

  const [preferences, setPreferences] = useState("");
  const [knownRatio, setKnownRatio] = useState(70);
  const [meals, setMeals] = useState<string[]>([]);
  const [scoreByMeal, setScoreByMeal] = useState<Record<string, number | null>>({});
  const [weekStartStr, setWeekStartStr] = useState(() =>
    toISODateString(defaultSuggestedWeekMonday())
  );
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  const { data: savedWeeks = [] } = useQuery({
    queryKey: ["saved_weekly_menus", listId],
    queryFn: () => fetchSavedWeeklyMenus(listId!),
    enabled: !!listId,
  });

  const { data: recipeBank = [] } = useQuery({
    queryKey: ["list_recipes", listId],
    queryFn: () => fetchListRecipes(listId!),
    enabled: !!listId,
  });

  const { sortedSavedWeeks, upcomingWeekMondayStr } = useMemo(() => {
    const upcoming = toISODateString(defaultSuggestedWeekMonday());
    const sorted = [...savedWeeks].sort((a, b) => {
      const aStr = String(a.week_start).slice(0, 10);
      const bStr = String(b.week_start).slice(0, 10);
      const aUp = aStr === upcoming;
      const bUp = bStr === upcoming;
      if (aUp !== bUp) return aUp ? -1 : 1;
      return bStr.localeCompare(aStr);
    });
    return { sortedSavedWeeks: sorted, upcomingWeekMondayStr: upcoming };
  }, [savedWeeks]);

  const {
    data: weeklySettings,
    isSuccess: weeklySettingsReady,
  } = useQuery({
    queryKey: ["list_weekly_menu_settings", listId],
    queryFn: () => fetchListWeeklyMenuSettings(listId!),
    enabled: !!listId,
  });

  const hydratedForListRef = useRef<string | null>(null);

  useEffect(() => {
    hydratedForListRef.current = null;
    setSettingsHydrated(false);
  }, [listId]);

  useEffect(() => {
    if (!listId || !weeklySettingsReady) return;
    if (hydratedForListRef.current === listId) return;
    hydratedForListRef.current = listId;

    let prefs = weeklySettings?.preferences ?? "";
    let ratio = weeklySettings?.known_ratio ?? 70;
    try {
      const legacyP = localStorage.getItem(LEGACY_PREFS_KEY(listId));
      const legacyR = localStorage.getItem(LEGACY_RATIO_KEY(listId));
      if (legacyP != null && legacyP !== "" && prefs === "") prefs = legacyP;
      if (legacyR != null) {
        const n = parseInt(legacyR, 10);
        if (!Number.isNaN(n)) {
          const r2 = Math.max(0, Math.min(100, n));
          if (r2 !== ratio) ratio = r2;
        }
      }
      if (legacyP != null) localStorage.removeItem(LEGACY_PREFS_KEY(listId));
      if (legacyR != null) localStorage.removeItem(LEGACY_RATIO_KEY(listId));
    } catch {
      // ignore
    }
    setPreferences(prefs);
    setKnownRatio(ratio);
    setSettingsHydrated(true);
  }, [listId, weeklySettingsReady, weeklySettings]);

  const persistSettingsMutation = useMutation({
    mutationFn: () =>
      upsertListWeeklyMenuSettings(listId!, preferences, knownRatio),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["list_weekly_menu_settings", listId],
      });
    },
  });

  useEffect(() => {
    if (!listId || !settingsHydrated) return;
    const t = window.setTimeout(() => {
      persistSettingsMutation.mutate();
    }, 550);
    return () => window.clearTimeout(t);
  }, [listId, preferences, knownRatio, settingsHydrated]);

  function mergeScoresFromRecipes(mealLines: string[], bank: ListRecipe[]) {
    const next: Record<string, number | null> = {};
    for (const line of mealLines) {
      const norm = line.trim().toLowerCase();
      const hit = bank.find((r) => r.name.trim().toLowerCase() === norm);
      next[line] = hit ? hit.score : null;
    }
    setScoreByMeal(next);
  }

  const saveWeekMutation = useMutation({
    mutationFn: () => upsertSavedWeeklyMenu(listId!, weekStartStr, meals),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved_weekly_menus", listId] });
    },
  });

  useEffect(() => {
    saveWeekMutation.reset();
  }, [weekStartStr]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || !listId)
        throw new Error("Inte inloggad eller saknar lista");
      return generateWeeklyMenu(
        listId,
        session.access_token,
        preferences,
        knownRatio
      );
    },
    onSuccess: async (data) => {
      saveWeekMutation.reset();
      setMeals(data);
      setWeekStartStr(toISODateString(defaultSuggestedWeekMonday()));
      queryClient.invalidateQueries({ queryKey: ["list_recipes", listId] });
      const fresh = await fetchListRecipes(listId!);
      mergeScoresFromRecipes(data, fresh);
    },
  });

  const voteMutation = useMutation({
    mutationFn: async ({
      mealLine,
      delta,
      setZero,
    }: {
      mealLine: string;
      delta: -2 | -1 | 1 | 2;
      setZero: boolean;
    }) => {
      if (!listId) throw new Error("Saknar lista");
      return adjustListRecipeScore(listId, mealLine, delta, setZero);
    },
    onSuccess: (row, vars) => {
      queryClient.invalidateQueries({ queryKey: ["list_recipes", listId] });
      setScoreByMeal((prev) => ({
        ...prev,
        [vars.mealLine]: row.recipe_score,
      }));
    },
  });

  const replaceMutation = useMutation({
    mutationFn: async (vars: { dayIndex: number; mealsSnapshot: string[] }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || !listId)
        throw new Error("Inte inloggad eller saknar lista");
      if (vars.mealsSnapshot.length !== 7)
        throw new Error("Veckomeny måste ha 7 rader");
      return replaceWeeklyMeal(
        listId,
        session.access_token,
        preferences,
        knownRatio,
        vars.mealsSnapshot,
        vars.dayIndex
      );
    },
    onSuccess: async (newMeal, vars) => {
      const updated = [...vars.mealsSnapshot];
      updated[vars.dayIndex] = newMeal;
      setMeals(updated);
      queryClient.invalidateQueries({ queryKey: ["list_recipes", listId] });
      const fresh = await fetchListRecipes(listId!);
      mergeScoresFromRecipes(updated, fresh);
    },
  });

  const saveSavedWeekMutation = useMutation({
    mutationFn: (vars: { weekStart: string; meals: string[] }) =>
      upsertSavedWeeklyMenu(listId!, vars.weekStart, vars.meals),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved_weekly_menus", listId] });
    },
  });

  const replaceSavedMealMutation = useMutation({
    mutationFn: async (vars: {
      weekId: string;
      weekStart: string;
      mealsSnapshot: string[];
      dayIndex: number;
    }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || !listId)
        throw new Error("Inte inloggad eller saknar lista");
      if (vars.mealsSnapshot.length !== 7)
        throw new Error("Veckomeny måste ha 7 rader");
      const newMeal = await replaceWeeklyMeal(
        listId,
        session.access_token,
        preferences,
        knownRatio,
        vars.mealsSnapshot,
        vars.dayIndex
      );
      const updated = [...vars.mealsSnapshot];
      updated[vars.dayIndex] = newMeal;
      await upsertSavedWeeklyMenu(listId, vars.weekStart, updated);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved_weekly_menus", listId] });
      queryClient.invalidateQueries({ queryKey: ["list_recipes", listId] });
    },
  });

  const busySavedOrDraftExtras =
    saveSavedWeekMutation.isPending ||
    replaceSavedMealMutation.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <header className="space-y-2">
        <p className="text-sm text-text-muted">
          Skapa en veckomeny utifrån sparade recept med poäng (0–5). Ju högre
          poäng, desto oftare föreslås rätten när du lutar åt &quot;mina
          recept&quot;. När du sparar en vecka används de senaste måltiderna
          som vägledning så likadana rätter föreslås mer sällan nästa gång.
        </p>
      </header>

      {sortedSavedWeeks.length > 0 && listId && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">Sparade veckomenyer</h2>
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {sortedSavedWeeks.slice(0, 12).map((w) => {
              const ws = String(w.week_start).slice(0, 10);
              return (
                <SavedWeekBlock
                  key={w.id}
                  w={w}
                  listId={listId}
                  weekStartStr={ws}
                  upcomingWeekMondayStr={upcomingWeekMondayStr}
                  recipeBank={recipeBank}
                  saveSavedWeekMutation={saveSavedWeekMutation}
                  replaceSavedMealMutation={replaceSavedMealMutation}
                  voteMutation={voteMutation}
                  busyGlobal={
                    generateMutation.isPending ||
                    replaceMutation.isPending ||
                    voteMutation.isPending ||
                    busySavedOrDraftExtras
                  }
                />
              );
            })}
          </ul>
        </section>
      )}

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="block">
          <span className="text-sm font-semibold text-text">
            Preferenser och kontext
          </span>
          <p className="mt-0.5 text-xs text-text-muted">
            T.ex. allergier, snabba vardagar, en kväll vegetariskt, eller att du
            redan har ingredienser hemma.
          </p>
          <textarea
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            rows={5}
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            placeholder="Skriv fritt vad AI ska ta hänsyn till…"
            aria-label="Preferenser för veckomeny"
          />
        </label>

        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-text">
              Balans: receptbank ↔ nya idéer
            </span>
            <span className="text-sm tabular-nums text-text-muted">
              {knownRatio}% från banken
            </span>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            100% = välj mest från dina sparade recept (vägt med poäng). 0% =
            friare förslag i samma stil, inspirerat av vad du gillar.
          </p>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={knownRatio}
            onChange={(e) => setKnownRatio(Number(e.target.value))}
            className="mt-3 w-full accent-[#2563eb]"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={knownRatio}
            aria-label="Andel måltider från receptbanken"
          />
        </div>

        <Button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={!listId || generateMutation.isPending}
        >
          {generateMutation.isPending ? "Genererar…" : "Generera veckomeny"}
        </Button>
        {generateMutation.isError && (
          <p className="text-sm text-red-600" role="alert">
            {generateMutation.error instanceof Error
              ? generateMutation.error.message
              : "Något gick fel."}
          </p>
        )}
      </div>

      {meals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-text">Förslag denna vecka</h2>
          {replaceMutation.isError && (
            <p className="text-sm text-red-600" role="alert">
              {replaceMutation.error instanceof Error
                ? replaceMutation.error.message
                : "Kunde inte byta ut rätten."}
            </p>
          )}
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {meals.map((line, index) => {
              const pending =
                voteMutation.isPending &&
                voteMutation.variables?.mealLine === line;
              const replacing =
                replaceMutation.isPending &&
                replaceMutation.variables?.dayIndex === index;
              const shownScore = scoreByMeal[line];
              const busyAny =
                generateMutation.isPending ||
                replaceMutation.isPending ||
                voteMutation.isPending ||
                busySavedOrDraftExtras;
              const busyRow = pending || replacing || busyAny;
              return (
                <li
                  key={index}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">{line}</p>
                    {shownScore != null && (
                      <p className="mt-1 text-xs text-text-muted">
                        Sparad poäng i banken: {shownScore}/5
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
                    {meals.length === 7 && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        disabled={busyAny || !listId}
                        onClick={() =>
                          replaceMutation.mutate({
                            dayIndex: index,
                            mealsSnapshot: [...meals],
                          })
                        }
                        title="Ett nytt förslag för den här dagen"
                      >
                        {replacing ? "…" : "Byt ut"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      disabled={busyRow || !listId}
                      onClick={() =>
                        voteMutation.mutate({
                          mealLine: line,
                          delta: 1,
                          setZero: false,
                        })
                      }
                      title="Plus ett"
                    >
                      +1
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      disabled={busyRow || !listId}
                      onClick={() =>
                        voteMutation.mutate({
                          mealLine: line,
                          delta: 2,
                          setZero: false,
                        })
                      }
                      title="Plus två"
                    >
                      +2
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      disabled={busyRow || !listId}
                      onClick={() =>
                        voteMutation.mutate({
                          mealLine: line,
                          delta: -1,
                          setZero: false,
                        })
                      }
                      title="Minus ett"
                    >
                      −1
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      disabled={busyRow || !listId}
                      onClick={() =>
                        voteMutation.mutate({
                          mealLine: line,
                          delta: -2,
                          setZero: false,
                        })
                      }
                      title="Minus två"
                    >
                      −2
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-2 py-1 text-xs text-red-700"
                      disabled={busyRow || !listId}
                      onClick={() =>
                        voteMutation.mutate({
                          mealLine: line,
                          delta: 1,
                          setZero: true,
                        })
                      }
                      title="Sätt till 0 — vill inte äta igen"
                    >
                      Noll
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {meals.length === 7 && (
            <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-[#f8fafc] p-4">
              <h3 className="text-sm font-semibold text-text">
                Spara veckomeny
              </h3>
              <p className="text-xs text-text-muted">
                Välj vilken vecka menyn gäller (veckan räknas från måndag).
                Förslag: nästa vecka — utom på måndagar då denna vecka
                föreslås (du kan ändra datum).
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
                <label className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-text-muted">
                    Vecka startar (måndag)
                  </span>
                  <input
                    type="date"
                    value={weekStartStr}
                    onChange={(e) =>
                      setWeekStartStr(toMondayFromAnyDateStr(e.target.value))
                    }
                    className="mt-1 block w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-text focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                    aria-label="Vecka som börjar måndag"
                  />
                </label>
                <div className="text-sm text-text">
                  {(() => {
                    const d = parseISODateLocal(weekStartStr);
                    if (Number.isNaN(d.getTime())) return null;
                    return (
                      <p className="font-medium">
                        {formatWeekRangeSv(d)}
                      </p>
                    );
                  })()}
                </div>
              </div>
              <Button
                type="button"
                onClick={() => saveWeekMutation.mutate()}
                disabled={saveWeekMutation.isPending || !listId}
                variant="secondary"
              >
                {saveWeekMutation.isPending ? "Sparar…" : "Spara veckomeny"}
              </Button>
              {saveWeekMutation.isError && (
                <p className="text-sm text-red-600" role="alert">
                  {saveWeekMutation.error instanceof Error
                    ? saveWeekMutation.error.message
                    : "Kunde inte spara."}
                </p>
              )}
              {saveWeekMutation.isSuccess && (
                <p className="text-sm text-green-700" role="status">
                  Sparat.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
