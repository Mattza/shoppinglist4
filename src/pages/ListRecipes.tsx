import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentList } from "@/hooks/useCurrentList";
import {
  fetchListRecipes,
  insertListRecipe,
  updateListRecipeScore,
  deleteListRecipe,
  reorderListRecipes,
} from "@/hooks/useListRecipes";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export default function ListRecipes() {
  const { listSlug } = useParams<{ listSlug: string }>();
  const queryClient = useQueryClient();
  const { data: list } = useCurrentList(listSlug ?? undefined);
  const listId = list?.id;

  const [newName, setNewName] = useState("");
  const [newScore, setNewScore] = useState(3);

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ["list_recipes", listId],
    queryFn: () => fetchListRecipes(listId!),
    enabled: !!listId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["list_recipes", listId] });
  };

  const addMutation = useMutation({
    mutationFn: () => insertListRecipe(listId!, newName, newScore),
    onSuccess: () => {
      setNewName("");
      setNewScore(3);
      invalidate();
    },
  });

  const scoreMutation = useMutation({
    mutationFn: ({
      recipeId,
      score,
    }: {
      recipeId: string;
      score: number;
    }) => updateListRecipeScore(listId!, recipeId, score),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (recipeId: string) => deleteListRecipe(listId!, recipeId),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderListRecipes(listId!, orderedIds),
    onSuccess: invalidate,
  });

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= recipes.length) return;
    const ids = recipes.map((r) => r.id);
    const t = ids[index];
    ids[index] = ids[next];
    ids[next] = t;
    reorderMutation.mutate(ids);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <header className="space-y-1">
        <p className="text-sm text-text-muted">
          Hantera receptbanken för veckomenyn: lägg till, ta bort, sätt
          poäng (0–5) och dra om ordningen. Högre poäng gör att rätten
          föreslås oftare när du lutar åt &quot;mina recept&quot;.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-text">Nytt recept</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="text-xs font-medium text-text-muted">Namn</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="t.ex. Köttbullar och potatismos"
              className="mt-1 border-gray-200"
              aria-label="Receptnamn"
            />
          </label>
          <label className="sm:w-28">
            <span className="text-xs font-medium text-text-muted">Poäng</span>
            <select
              value={newScore}
              onChange={(e) => setNewScore(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-text shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
              aria-label="Startpoäng"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            onClick={() => addMutation.mutate()}
            disabled={
              !listId || !newName.trim() || addMutation.isPending
            }
          >
            {addMutation.isPending ? "Lägger till…" : "Lägg till"}
          </Button>
        </div>
        {addMutation.isError && (
          <p className="text-sm text-red-600" role="alert">
            {addMutation.error instanceof Error
              ? addMutation.error.message
              : "Kunde inte spara."}
          </p>
        )}
      </section>

      {isLoading ? (
        <p className="text-sm text-text-muted">Laddar recept…</p>
      ) : recipes.length === 0 ? (
        <p className="text-sm text-text-muted">
          Inga recept än. Lägg till ovan eller generera en veckomeny och
          betygsätt rätter där.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {recipes.map((r, index) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{r.name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <label className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Poäng</span>
                  <select
                    value={r.score}
                    onChange={(e) =>
                      scoreMutation.mutate({
                        recipeId: r.id,
                        score: Number(e.target.value),
                      })
                    }
                    disabled={scoreMutation.isPending}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                    aria-label={`Poäng för ${r.name}`}
                  >
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div
                  className="flex items-center gap-0.5"
                  role="group"
                  aria-label="Ordna"
                >
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={
                      index === 0 ||
                      reorderMutation.isPending ||
                      deleteMutation.isPending
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    title="Upp"
                    aria-label={`Flytta ${r.name} uppåt`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={
                      index >= recipes.length - 1 ||
                      reorderMutation.isPending ||
                      deleteMutation.isPending
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    title="Ner"
                    aria-label={`Flytta ${r.name} nedåt`}
                  >
                    ↓
                  </button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-700 hover:bg-red-50"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      window.confirm(`Ta bort "${r.name}"?`)
                    ) {
                      deleteMutation.mutate(r.id);
                    }
                  }}
                >
                  Ta bort
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
