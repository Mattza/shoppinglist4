import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentList } from "@/hooks/useCurrentList";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Card } from "@/components/Card";
import type { Category, ListItem } from "@/types/database";

// Stable color per category (hash id → palette index)
const CATEGORY_COLORS = [
  "#0891b2", // teal (primary)
  "#d97706", // amber
  "#dc2626", // red
  "#7c3aed", // violet
  "#059669", // emerald
  "#0284c7", // sky
  "#ea580c", // orange
  "#4f46e5", // indigo
  "#ca8a04", // yellow
  "#be185d", // pink
];

function getCategoryColor(categoryId: string): { border: string; bg: string } {
  let n = 0;
  for (let i = 0; i < categoryId.length; i++) n = (n * 31 + categoryId.charCodeAt(i)) >>> 0;
  const hex = CATEGORY_COLORS[n % CATEGORY_COLORS.length];
  return { border: hex, bg: `${hex}18` }; // 18 = ~10% opacity in hex
}

function getEffectiveCategoryColor(cat: Category): { border: string; bg: string } {
  const hex = cat.color ?? getCategoryColor(cat.id).border;
  return { border: hex, bg: `${hex}18` };
}

async function fetchCategories(listId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("list_id", listId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Category[];
}

async function fetchItems(listId: string) {
  const { data, error } = await supabase
    .from("list_items")
    .select("*, category:categories(name)")
    .eq("list_id", listId);
  if (error) throw error;
  return (data ?? []) as (ListItem & { category: { name: string } | null })[];
}

export default function ListView() {
  const { listSlug } = useParams<{ listSlug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newItemName, setNewItemName] = useState("");
  const [aiRecategorizeLoading, setAiRecategorizeLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [editMode, setEditMode] = useState(false);

  const { data: list } = useCurrentList(listSlug ?? undefined);
  const listId = list?.id;
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", listId],
    queryFn: () => fetchCategories(listId!),
    enabled: !!listId,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["list_items", listId],
    queryFn: () => fetchItems(listId!),
    enabled: !!listId,
  });

  const defaultCategoryId =
    categories.find((c) => c.name === "Övrigt")?.id ?? categories[0]?.id ?? "";

  useEffect(() => {
    if (!listId) return;
    const channel = supabase
      .channel(`list:${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list_items",
          filter: `list_id=eq.${listId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "categories",
          filter: `list_id=eq.${listId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["categories", listId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [listId, queryClient]);

  const addItemMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!listId || !defaultCategoryId)
        throw new Error("Ingen standardkategori tillgänglig");
      const { error } = await supabase.from("list_items").insert({
        list_id: listId,
        category_id: defaultCategoryId,
        name,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
      setNewItemName("");
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (
      item: ListItem & { category?: { name: string } | null }
    ) => {
      await supabase.from("archived_items").insert({
        list_id: listId!,
        user_id: user!.id,
        name: item.name,
        category_name: item.category?.name ?? null,
      });
      const { error } = await supabase
        .from("list_items")
        .delete()
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] }),
  });

  const updateItemCategoryMutation = useMutation({
    mutationFn: async ({
      itemId,
      categoryId,
    }: {
      itemId: string;
      categoryId: string;
    }) => {
      const { error } = await supabase
        .from("list_items")
        .update({ category_id: categoryId })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] }),
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const maxOrder = Math.max(0, ...categories.map((c) => c.sort_order));
      const { error } = await supabase
        .from("categories")
        .insert({ list_id: listId!, name, sort_order: maxOrder + 1 });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["categories", listId] }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      if (categories.length <= 1) {
        throw new Error("Du kan inte ta bort sista kategorin.");
      }
      const fallbackCategory = categories.find((c) => c.id !== categoryId);
      if (!fallbackCategory)
        throw new Error("Ingen annan kategori att flytta varor till.");
      const count = items.filter((i) => i.category_id === categoryId).length;
      if (count > 0) {
        const { error: updateError } = await supabase
          .from("list_items")
          .update({ category_id: fallbackCategory.id })
          .eq("list_id", listId!)
          .eq("category_id", categoryId);
        if (updateError) throw updateError;
      }
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", listId] });
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
    },
  });

  const updateCategoryColorMutation = useMutation({
    mutationFn: async ({ categoryId, color }: { categoryId: string; color: string | null }) => {
      const { error } = await supabase
        .from("categories")
        .update({ color })
        .eq("id", categoryId);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["categories", listId] }),
  });

  async function handleRecategorizeList() {
    if (!listId) return;
    setAiRecategorizeLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reorder-list-by-ai`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ list_id: listId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "AI-kategorisering misslyckades");
    } finally {
      setAiRecategorizeLoading(false);
    }
  }

  const itemsByCategory = categories.map((cat) => ({
    category: cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email || !listId) return;
    setInviteMessage(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-by-email`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ list_id: listId, email }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteMessage({
          type: "error",
          text: json?.error ?? "Kunde inte bjuda in",
        });
        return;
      }
      setInviteMessage({
        type: "success",
        text: "Inbjudan skickad! De kan nu se listan under Mina listor.",
      });
      setInviteEmail("");
    } catch {
      setInviteMessage({ type: "error", text: "Något gick fel. Försök igen." });
    }
  }

  return (
    <div className="relative mx-auto max-w-3xl space-y-8 pb-28">
      {list && (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setEditMode((e) => !e)}
            aria-label={editMode ? "Avsluta redigering" : "Redigera lista"}
          >
            {editMode ? "Klar" : "Redigera lista"}
          </Button>
          {list.role === "owner" && (
            <Button
              variant="secondary"
              onClick={() => {
                setInviteOpen(true);
                setInviteMessage(null);
                setInviteEmail("");
              }}
              aria-label="Bjud in till listan"
            >
              Bjud in
            </Button>
          )}
        </div>
      )}

      {inviteOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
          >
            <Card className="w-full max-w-md space-y-4">
              <div>
                <h2
                  id="invite-title"
                  className="text-xl font-display font-semibold text-text"
                >
                  Bjud in till listan
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Ange e-postadressen till någon som redan har ett konto. De får
                  tillgång till listan under Mina listor.
                </p>
              </div>
              <form onSubmit={handleInviteSubmit} className="space-y-3">
                <Input
                  type="email"
                  placeholder="t.ex. namn@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  aria-label="E-postadress"
                  required
                />
                {inviteMessage && (
                  <p
                    className={
                      inviteMessage.type === "error"
                        ? "text-sm text-red-600"
                        : "text-sm text-cta"
                    }
                  >
                    {inviteMessage.text}
                  </p>
                )}
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setInviteOpen(false);
                      setInviteMessage(null);
                    }}
                  >
                    Avbryt
                  </Button>
                  <Button type="submit">Bjud in</Button>
                </div>
              </form>
            </Card>
          </div>,
          document.body
        )}

      {/* Categories with items – main focus */}
      <section className="space-y-4" aria-label="Kategorier och varor">
        <div>
          <h2 className="text-xl font-display font-bold text-[#1f2937]">
            Varor i kategorier
          </h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Håll din lista organiserad genom att gruppera varor per kategori.
          </p>
        </div>
        <div className="space-y-4">
          {itemsByCategory.map(({ category: cat, items: catItems }) => {
            const { border, bg } = getEffectiveCategoryColor(cat);
            const currentHex = cat.color ?? getCategoryColor(cat.id).border;
            return (
            <div
              key={cat.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm border-l-4"
              style={{ borderLeftColor: border }}
            >
              <div
                className="flex items-center justify-between gap-2 mb-3 -mx-4 -mt-4 px-4 py-3 rounded-t-xl flex-wrap"
                style={{ backgroundColor: bg }}
              >
                <h3 className="font-display text-base font-semibold text-[#1f2937]">
                  {cat.name}
                </h3>
                <div className="flex items-center gap-2">
                  {editMode && (
                    <div className="flex items-center gap-1" role="group" aria-label={`Färg för ${cat.name}`}>
                      <button
                        type="button"
                        className="w-6 h-6 rounded-full border-2 border-gray-300 bg-gray-100 text-[10px] font-medium text-gray-500 hover:bg-gray-200 disabled:opacity-50 shrink-0"
                        style={{
                          borderColor: !cat.color ? "#1f2937" : "transparent",
                          boxShadow: !cat.color ? "0 0 0 2px #9ca3af" : undefined,
                        }}
                        onClick={() => updateCategoryColorMutation.mutate({ categoryId: cat.id, color: null })}
                        disabled={updateCategoryColorMutation.isPending}
                        title="Automatisk färg"
                        aria-label="Automatisk färg"
                        aria-pressed={!cat.color}
                      >
                        A
                      </button>
                      {CATEGORY_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          className="w-6 h-6 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform disabled:opacity-50 shrink-0"
                          style={{
                            backgroundColor: hex,
                            borderColor: currentHex === hex ? "#1f2937" : "transparent",
                            boxShadow: currentHex === hex ? `0 0 0 2px ${hex}` : undefined,
                          }}
                          onClick={() => updateCategoryColorMutation.mutate({ categoryId: cat.id, color: hex })}
                          disabled={updateCategoryColorMutation.isPending}
                          title={hex}
                          aria-label={`Välj färg ${hex}`}
                          aria-pressed={currentHex === hex}
                        />
                      ))}
                      <label className="cursor-pointer shrink-0 flex items-center gap-1">
                        <span className="sr-only">Välj egen färg (hex)</span>
                        <input
                          type="color"
                          className="w-6 h-6 rounded-full border-2 border-white shadow-sm cursor-pointer disabled:opacity-50 p-0 overflow-hidden"
                          value={currentHex}
                          onChange={(e) =>
                            updateCategoryColorMutation.mutate({
                              categoryId: cat.id,
                              color: e.target.value.toLowerCase(),
                            })
                          }
                          disabled={updateCategoryColorMutation.isPending}
                          title="Välj egen färg"
                          aria-label="Välj egen färg"
                        />
                      </label>
                    </div>
                  )}
                  {editMode && categories.length > 1 && (
                    <button
                      type="button"
                      className="text-sm text-[#6b7280] hover:text-red-700 hover:bg-red-50 rounded-md px-2 py-1 disabled:opacity-50"
                      onClick={() => deleteCategoryMutation.mutate(cat.id)}
                      disabled={deleteCategoryMutation.isPending}
                      title="Ta bort kategori (varor flyttas till annan kategori)"
                      aria-label={`Ta bort kategorin ${cat.name}`}
                    >
                      Ta bort kategori
                    </button>
                  )}
                </div>
              </div>
              <ul
                aria-label={`Varor i ${cat.name}`}
                className="divide-y divide-gray-100"
              >
                {catItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="font-medium text-[#374151]">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-[#374151]"
                        value={item.category_id}
                        onChange={(e) => {
                          const categoryId = e.target.value;
                          if (categoryId && categoryId !== item.category_id) {
                            updateItemCategoryMutation.mutate({
                              itemId: item.id,
                              categoryId,
                            });
                          }
                        }}
                        aria-label={`Kategori för ${item.name}`}
                        disabled={updateItemCategoryMutation.isPending}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeItemMutation.mutate(item)}
                        title="Ta bort (sparas i arkiv)"
                        aria-label={`Ta bort ${item.name}`}
                      >
                        Ta bort
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            );
          })}
        </div>
        {categories.length === 0 && (
          <p className="text-sm text-[#6b7280]">
            {editMode
              ? "Inga kategorier än. Lägg till en nedan."
              : "Inga kategorier än. Klicka på Redigera lista för att lägga till."}
          </p>
        )}
      </section>

      {/* Lägg till kategori – visas endast i redigeringsläge */}
      {editMode && (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            const name = (
              e.currentTarget.elements.namedItem(
                "newCategory"
              ) as HTMLInputElement
            )?.value?.trim();
            if (name) {
              addCategoryMutation.mutate(name);
              (
                e.currentTarget.elements.namedItem(
                  "newCategory"
                ) as HTMLInputElement
              ).value = "";
            }
          }}
        >
          <Input
            name="newCategory"
            placeholder="Ny kategori"
            aria-label="Namn på ny kategori"
            className="w-full sm:w-60 border-gray-200"
          />
          <button
            type="submit"
            disabled={addCategoryMutation.isPending}
            className="text-sm font-medium text-[#2563eb] hover:underline disabled:opacity-50"
          >
            Lägg till kategori
          </button>
        </form>
      )}

      <p className="mt-8 text-sm text-[#6b7280]">
        <Link
          className="font-semibold text-[#2563eb] hover:underline"
          to={`/list/${list?.slug}/recommendations`}
        >
          Rekommendationer
        </Link>{" "}
        baserat på arkivet
      </p>

      {/* Sticky add bar at bottom */}
      {createPortal(
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <div className="mx-auto max-w-3xl flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <form
              className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (newItemName.trim() && defaultCategoryId) {
                  addItemMutation.mutate(newItemName.trim());
                }
              }}
            >
              <label className="flex-1 text-sm text-[#374151]">
                <span className="mb-1 block font-medium">Lägg till vara</span>
                <Input
                  placeholder="t.ex. mjölk, bröd, äpplen… (läggs i Övrigt)"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  aria-label="Namn på vara"
                  className="h-10 border-gray-200"
                />
              </label>
              <button
                type="submit"
                disabled={
                  !newItemName.trim() ||
                  !defaultCategoryId ||
                  addItemMutation.isPending
                }
                className="inline-flex h-10 w-full sm:w-auto shrink-0 items-center justify-center rounded-lg bg-[#22c55e] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addItemMutation.isPending
                  ? "Lägger till…"
                  : "Lägg till i Övrigt"}
              </button>
            </form>
            <Button
              type="button"
              variant="secondary"
              disabled={aiRecategorizeLoading || items.length === 0}
              onClick={handleRecategorizeList}
              className="h-10 shrink-0"
            >
              {aiRecategorizeLoading
                ? "Kategoriserar…"
                : "Kategorisera listan med AI"}
            </Button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
