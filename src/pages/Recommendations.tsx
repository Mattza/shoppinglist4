import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getSupabaseFunctionsUrl } from "@/lib/supabase";
import { useCurrentList } from "@/hooks/useCurrentList";
import { useAuth } from "@/hooks/useAuth";
import { fetchCategories } from "@/hooks/useCategories";
import {
  getRecommendationProfile,
  upsertRecommendationProfile,
} from "@/hooks/useRecommendationProfiles";
import { addListItem } from "@/hooks/useListItems";
import { Button } from "@/components/Button";

async function fetchRecommendations(
  listId: string,
  accessToken: string
): Promise<string[]> {
  const url = `${getSupabaseFunctionsUrl()}/get-recommendations`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ list_id: listId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.suggestions ?? [];
}

export default function Recommendations() {
  const { listSlug } = useParams<{ listSlug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [profileDraft, setProfileDraft] = useState("");
  const [profileBarExpanded, setProfileBarExpanded] = useState(false);

  const { data: list } = useCurrentList(listSlug ?? undefined);
  const listId = list?.id;
  const { data: profile } = useQuery({
    queryKey: ["recommendation_profile", listId, user?.id],
    queryFn: () => getRecommendationProfile(user!.id, listId!),
    enabled: !!listId && !!user?.id,
  });

  useEffect(() => {
    if (profile !== undefined) setProfileDraft(profile ?? "");
  }, [profile]);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!listId || !user?.id) return;
      await upsertRecommendationProfile(user.id, listId, profileDraft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["recommendation_profile", listId, user?.id],
      });
    },
  });

  const {
    data: suggestions = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["recommendations", listId],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || !listId) return [];
      return fetchRecommendations(listId, session.access_token);
    },
    enabled: !!listId && !!user,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", listId],
    queryFn: () => fetchCategories(listId!),
    enabled: !!listId,
  });

  const defaultCategoryId =
    categories.find((c) => c.name === "Övrigt")?.id ?? categories[0]?.id ?? "";

  const addToListMutation = useMutation({
    mutationFn: async ({
      name,
      categoryId,
    }: {
      name: string;
      categoryId: string;
    }) => {
      await addListItem(listId!, categoryId, name, user?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-64">
      <header className="space-y-1">
        <p className="text-sm text-text-muted">
          Förslag baserat på vad du tidigare tagit bort från listan. Lägg till
          det du vill i listan. Beskriv dina preferenser nedan så blir
          rekommendationerna bättre anpassade.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-text-muted">Laddar rekommendationer...</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-text-muted">
          Inga rekommendationer än. Ta bort några varor från listan så bygger vi
          upp ett arkiv.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {suggestions.map((s) => (
            <li
              key={s}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 text-sm font-medium text-text">
                {s}
              </span>
              <Button
                type="button"
                onClick={() =>
                  defaultCategoryId &&
                  addToListMutation.mutate({
                    name: s,
                    categoryId: defaultCategoryId,
                  })
                }
                disabled={
                  !defaultCategoryId ||
                  addToListMutation.isPending ||
                  addToListMutation.variables?.name === s
                }
                className="shrink-0"
                aria-label={`Lägg till ${s}`}
              >
                {addToListMutation.isPending &&
                addToListMutation.variables?.name === s
                  ? "Lägger till…"
                  : "Lägg till"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="secondary"
        onClick={() => refetch()}
        disabled={isLoading}
      >
        Hämta nya rekommendationer
      </Button>

      {listId &&
        user?.id &&
        createPortal(
          <div
            className={`fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-[padding] ${
              profileBarExpanded ? "px-4 py-3" : "px-4 py-2"
            }`}
          >
            <div className="mx-auto max-w-3xl">
              {profileBarExpanded ? (
                <div className="relative space-y-3">
                  <button
                    type="button"
                    onClick={() => setProfileBarExpanded(false)}
                    className="absolute right-0 top-0 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    aria-label="Visa mindre"
                    title="Visa mindre"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  <label className="block pr-10">
                    <span className="text-sm font-semibold text-text">
                      Rekommendationsprofil
                    </span>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Beskriv vad du brukar handla, allergier eller preferenser
                      så blir förslagen bättre anpassade.
                    </p>
                    <textarea
                      value={profileDraft}
                      onChange={(e) => setProfileDraft(e.target.value)}
                      placeholder="t.ex. Vegetarisk hushåll, undviker nötter."
                      rows={8}
                      className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                      aria-label="Rekommendationsprofil"
                    />
                  </label>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => saveProfileMutation.mutate()}
                      disabled={
                        saveProfileMutation.isPending ||
                        profileDraft === (profile ?? "")
                      }
                    >
                      {saveProfileMutation.isPending
                        ? "Sparar…"
                        : "Spara profil"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-text-muted">
                      Rekommendationsprofil
                    </span>
                    <p className="truncate text-sm text-text">
                      {profileDraft.trim()
                        ? profileDraft.trim().slice(0, 60) +
                          (profileDraft.trim().length > 60 ? "…" : "")
                        : "Klicka för att redigera"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      onClick={() => saveProfileMutation.mutate()}
                      disabled={
                        saveProfileMutation.isPending ||
                        profileDraft === (profile ?? "")
                      }
                      className="shrink-0"
                    >
                      {saveProfileMutation.isPending ? "Sparar…" : "Spara"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setProfileBarExpanded(true)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      aria-label="Visa mer"
                      title="Visa mer"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
