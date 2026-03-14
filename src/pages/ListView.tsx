import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentList } from "@/hooks/useCurrentList";
import { fetchCategories } from "@/hooks/useCategories";
import {
  fetchListItems,
  addListItem,
  removeListItem,
  updateListItemName,
  updateListItemCategory,
  moveListItemsToCategory,
  type ListItemWithCategory,
} from "@/hooks/useListItems";
import {
  addCategory,
  updateCategoryColor,
  updateCategorySortOrder,
  deleteCategory,
} from "@/hooks/useCategories";
import { insertArchivedItem } from "@/hooks/useArchivedItems";
import { deleteList } from "@/hooks/useLists";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Card } from "@/components/Card";
import type { Category } from "@/types/database";

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
  for (let i = 0; i < categoryId.length; i++)
    n = (n * 31 + categoryId.charCodeAt(i)) >>> 0;
  const hex = CATEGORY_COLORS[n % CATEGORY_COLORS.length];
  return { border: hex, bg: `${hex}18` }; // 18 = ~10% opacity in hex
}

function getEffectiveCategoryColor(cat: Category): {
  border: string;
  bg: string;
} {
  const hex = cat.color ?? getCategoryColor(cat.id).border;
  return { border: hex, bg: `${hex}18` };
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [addBarCategoryId, setAddBarCategoryId] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState("");
  const [recentlyDeleted, setRecentlyDeleted] = useState<{
    listId: string;
    items: { name: string; categoryId: string }[];
  } | null>(null);

  const navigate = useNavigate();
  const {
    data: list,
    isPending: listPending,
    isFetched: listFetched,
  } = useCurrentList(listSlug ?? undefined);
  const listId = list?.id;
  const {
    data: categories = [],
    isPending: categoriesPending,
  } = useQuery({
    queryKey: ["categories", listId],
    queryFn: () => fetchCategories(listId!),
    enabled: !!listId,
  });
  const {
    data: items = [],
    isPending: itemsPending,
  } = useQuery({
    queryKey: ["list_items", listId],
    queryFn: () => fetchListItems(listId!),
    enabled: !!listId,
  });

  const isChangingList =
    !!listSlug &&
    (listPending || (!!listId && (categoriesPending || itemsPending)));
  const listNotFound = !!listSlug && listFetched && !listPending && !list;

  const defaultCategoryId =
    categories.find((c) => c.name === "Övrigt")?.id ?? categories[0]?.id ?? "";

  const selectedAddCategoryId = addBarCategoryId || defaultCategoryId;

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
    mutationFn: async ({
      name,
      categoryId,
    }: {
      name: string;
      categoryId: string;
    }) => {
      if (!listId || !categoryId) throw new Error("Ingen kategori vald");
      return addListItem(listId, categoryId, name, user?.id);
    },
    onSuccess: (newItem) => {
      if (!listId) return;
      queryClient.setQueryData<ListItemWithCategory[]>(
        ["list_items", listId],
        (old) => [...(old ?? []), newItem]
      );
      setNewItemName("");
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (item: ListItemWithCategory) => {
      await removeListItem(item.id);
      insertArchivedItem({
        list_id: listId!,
        user_id: user!.id,
        name: item.name,
        category_name: item.category?.name ?? null,
      }).catch(() => {});
    },
    onSuccess: (_, item) => {
      if (!listId) return;
      queryClient.setQueryData<ListItemWithCategory[]>(
        ["list_items", listId],
        (old) => (old ?? []).filter((i) => i.id !== item.id)
      );
      setRecentlyDeleted((prev) => {
        const next = { listId, items: [...(prev?.listId === listId ? prev.items : []), { name: item.name, categoryId: item.category_id }] };
        return next;
      });
    },
  });

  const restoreRecentlyDeletedMutation = useMutation({
    mutationFn: async (item: {
      name: string;
      categoryId: string;
    }): Promise<ListItemWithCategory> => {
      if (!listId || !user?.id) throw new Error("Ingen lista eller användare");
      return addListItem(listId, item.categoryId, item.name, user.id);
    },
    onSuccess: (newItem) => {
      if (!listId) return;
      queryClient.setQueryData<ListItemWithCategory[]>(
        ["list_items", listId],
        (old) => [...(old ?? []), newItem]
      );
      setRecentlyDeleted((prev) => {
        if (!prev || prev.listId !== listId || prev.items.length <= 1)
          return null;
        return { listId: prev.listId, items: prev.items.slice(0, -1) };
      });
    },
  });

  const updateItemNameMutation = useMutation({
    mutationFn: async ({
      itemId,
      name,
    }: {
      itemId: string;
      name: string;
    }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Namnet får inte vara tomt");
      await updateListItemName(itemId, trimmed);
    },
    onSuccess: (_, { itemId, name }) => {
      if (!listId) return;
      const trimmed = name.trim();
      queryClient.setQueryData<ListItemWithCategory[]>(
        ["list_items", listId],
        (old) =>
          (old ?? []).map((i) =>
            i.id === itemId ? { ...i, name: trimmed } : i
          )
      );
      setEditingItemId(null);
      setEditingItemName("");
    },
  });

  const updateItemCategoryMutation = useMutation({
    mutationFn: async ({
      itemId,
      categoryId,
    }: {
      itemId: string;
      categoryId: string;
    }) => {
      await updateListItemCategory(itemId, categoryId);
    },
    onSuccess: (_, { itemId, categoryId }) => {
      if (!listId) return;
      const categoryName =
        categories.find((c) => c.id === categoryId)?.name ?? null;
      queryClient.setQueryData<ListItemWithCategory[]>(
        ["list_items", listId],
        (old) =>
          (old ?? []).map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  category_id: categoryId,
                  category: categoryName ? { name: categoryName } : null,
                }
              : i
          )
      );
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const maxOrder = Math.max(0, ...categories.map((c) => c.sort_order));
      return addCategory(listId!, name, maxOrder + 1);
    },
    onSuccess: (newCategory) => {
      if (!listId) return;
      queryClient.setQueryData<Category[]>(["categories", listId], (old) => [
        ...(old ?? []),
        newCategory,
      ]);
    },
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
        await moveListItemsToCategory(
          listId!,
          categoryId,
          fallbackCategory.id
        );
      }
      await deleteCategory(categoryId);
    },
    onSuccess: (_, categoryId) => {
      if (!listId) return;
      const fallbackCategory = categories.find((c) => c.id !== categoryId)!;
      queryClient.setQueryData<Category[]>(["categories", listId], (old) =>
        (old ?? []).filter((c) => c.id !== categoryId)
      );
      queryClient.setQueryData<ListItemWithCategory[]>(
        ["list_items", listId],
        (old) =>
          (old ?? []).map((i) =>
            i.category_id === categoryId
              ? {
                  ...i,
                  category_id: fallbackCategory.id,
                  category: { name: fallbackCategory.name },
                }
              : i
          )
      );
    },
  });

  const updateCategoryColorMutation = useMutation({
    mutationFn: async ({
      categoryId,
      color,
    }: {
      categoryId: string;
      color: string | null;
    }) => {
      await updateCategoryColor(categoryId, color);
    },
    onSuccess: (_, { categoryId, color }) => {
      if (!listId) return;
      queryClient.setQueryData<Category[]>(["categories", listId], (old) =>
        (old ?? []).map((c) => (c.id === categoryId ? { ...c, color } : c))
      );
    },
  });

  const reorderCategoryMutation = useMutation({
    mutationFn: async ({
      categoryId,
      direction,
    }: {
      categoryId: string;
      direction: "up" | "down";
    }) => {
      if (!listId) throw new Error("Ingen lista");
      const current =
        queryClient.getQueryData<Category[]>(["categories", listId]) ?? [];
      const idx = current.findIndex((c) => c.id === categoryId);
      if (idx === -1) throw new Error("Kategorin hittades inte");
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= current.length)
        throw new Error("Kan inte flytta längre");
      const cat = current[idx];
      const other = current[swapIdx];
      await updateCategorySortOrder(cat.id, other.sort_order);
      await updateCategorySortOrder(other.id, cat.sort_order);
    },
    onMutate: async ({ categoryId, direction }) => {
      if (!listId) return;
      await queryClient.cancelQueries({ queryKey: ["categories", listId] });
      const previous = queryClient.getQueryData<Category[]>([
        "categories",
        listId,
      ]);
      const current = previous ?? [];
      const idx = current.findIndex((c) => c.id === categoryId);
      if (idx === -1 || idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= current.length) return;
      const next = [...current];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      queryClient.setQueryData<Category[]>(["categories", listId], next);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous != null && listId)
        queryClient.setQueryData(["categories", listId], context.previous);
    },
    onSettled: () => {
      if (listId)
        queryClient.invalidateQueries({ queryKey: ["categories", listId] });
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async () => {
      if (!listId) throw new Error("Ingen lista");
      await deleteList(listId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setDeleteConfirmOpen(false);
      navigate("/", { replace: true });
    },
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

  const itemsByCategory = [...categories]
    .map((cat) => ({
      category: cat,
      items: items.filter((i) => i.category_id === cat.id),
    }))
    .sort((a, b) => {
      const aEmpty = a.items.length === 0;
      const bEmpty = b.items.length === 0;
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      return a.category.sort_order - b.category.sort_order;
    });

  if (listNotFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-[#374151]">
          Listan hittades inte
        </p>
        <p className="mt-1 text-sm text-[#6b7280]">
          Den kan ha tagits bort eller så har du inte åtkomst.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#0891b2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e7490]"
        >
          Till Mina listor
        </Link>
      </div>
    );
  }

  if (isChangingList) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-[#0891b2] border-t-transparent"
          aria-hidden
        />
        <p className="mt-4 text-sm font-medium text-[#374151]">
          Laddar lista…
        </p>
        <p className="mt-1 text-xs text-[#6b7280]">
          Varor och kategorier hämtas
        </p>
      </div>
    );
  }

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
        <div className="flex justify-end gap-2 flex-wrap">
          <Button
            disabled={aiRecategorizeLoading || items.length === 0}
            onClick={handleRecategorizeList}
            aria-label="Kategorisera listan"
          >
            {aiRecategorizeLoading ? "Kategoriserar…" : "Kategorisera listan"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setEditMode((e) => !e)}
            aria-label={editMode ? "Avsluta redigering" : "Redigera lista"}
          >
            {editMode ? "Klar" : "Redigera lista"}
          </Button>
          {list.role === "owner" && (
            <>
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
              {editMode && (
                <Button
                  variant="secondary"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                  aria-label="Ta bort listan"
                >
                  Ta bort lista
                </Button>
              )}
            </>
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

      {deleteConfirmOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-list-title"
          >
            <Card className="w-full max-w-md space-y-4">
              <div>
                <h2
                  id="delete-list-title"
                  className="text-xl font-display font-semibold text-text"
                >
                  Ta bort listan?
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Listan tas bort permanent för dig och alla medlemmar. Detta
                  kan inte ångras.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleteListMutation.isPending}
                >
                  Avbryt
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => deleteListMutation.mutate()}
                  disabled={deleteListMutation.isPending}
                  className="border-red-200 text-red-800"
                  // className="bg-red-600 text-white hover:bg-red-700 border-0"
                >
                  {deleteListMutation.isPending ? "Tar bort…" : "Ta bort lista"}
                </Button>
              </div>
            </Card>
          </div>,
          document.body
        )}

      {/* Restore recently deleted (one item per click, latest shown) */}
      {recentlyDeleted &&
        recentlyDeleted.listId === listId &&
        recentlyDeleted.items.length > 0 && (() => {
          const latest = recentlyDeleted.items[recentlyDeleted.items.length - 1];
          return (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <span className="text-sm text-amber-900">
                Senast borttagen: <strong>{latest.name}</strong>
                {recentlyDeleted.items.length > 1 &&
                  ` (+${recentlyDeleted.items.length - 1} till)`}
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  restoreRecentlyDeletedMutation.mutate(latest)
                }
                disabled={restoreRecentlyDeletedMutation.isPending}
                className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                aria-label={`Återställ ${latest.name}`}
              >
                {restoreRecentlyDeletedMutation.isPending
                  ? "Återställer…"
                  : "Återställ"}
              </Button>
            </div>
          );
        })()}

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
          {itemsByCategory.map(({ category: cat, items: catItems }, catIndex) => {
            const { border, bg } = getEffectiveCategoryColor(cat);
            const currentHex = cat.color ?? getCategoryColor(cat.id).border;
            const isEmpty = catItems.length === 0;
            const canMoveUp = editMode && catIndex > 0;
            const canMoveDown =
              editMode && catIndex < itemsByCategory.length - 1;
            return (
              <div
                key={cat.id}
                className={`flex rounded-xl border border-gray-200 border-l-0 bg-white shadow-sm overflow-hidden ${isEmpty ? "shadow-none" : ""}`}
              >
                <div
                  className="w-1 shrink-0 rounded-l-xl"
                  style={{ backgroundColor: border }}
                  aria-hidden
                />
                <div
                  className={`flex-1 min-w-0 ${isEmpty ? "p-2" : "p-4"}`}
                >
                  <div
                    className={`${isEmpty ? "-mx-2 -mt-2 px-2 py-1.5 mb-1.5 rounded-t-lg" : "mb-3 -mx-4 -mt-4 px-4 py-3"} space-y-2`}
                    style={{ backgroundColor: bg }}
                  >
                    <div className="flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-1 min-w-0">
                        {editMode && (
                          <div
                            className="flex flex-col shrink-0"
                            role="group"
                            aria-label={`Ändra ordning för ${cat.name}`}
                          >
                            <button
                              type="button"
                              className="p-0.5 text-[#6b7280] hover:text-[#374151] hover:bg-gray-200/80 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#6b7280]"
                              onClick={() =>
                                reorderCategoryMutation.mutate({
                                  categoryId: cat.id,
                                  direction: "up",
                                })
                              }
                              disabled={
                                !canMoveUp ||
                                reorderCategoryMutation.isPending
                              }
                              title="Flytta upp"
                              aria-label={`Flytta ${cat.name} upp`}
                            >
                              <svg
                                className="w-4 h-4"
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
                            <button
                              type="button"
                              className="p-0.5 text-[#6b7280] hover:text-[#374151] hover:bg-gray-200/80 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#6b7280]"
                              onClick={() =>
                                reorderCategoryMutation.mutate({
                                  categoryId: cat.id,
                                  direction: "down",
                                })
                              }
                              disabled={
                                !canMoveDown ||
                                reorderCategoryMutation.isPending
                              }
                              title="Flytta ner"
                              aria-label={`Flytta ${cat.name} ner`}
                            >
                              <svg
                                className="w-4 h-4"
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
                          </div>
                        )}
                        <h3
                          className={`font-display font-semibold text-[#1f2937] ${isEmpty ? "text-sm" : "text-base"}`}
                        >
                          {cat.name}
                        </h3>
                      </div>
                      {editMode && categories.length > 1 && (
                        <button
                          type="button"
                          className="text-sm text-[#6b7280] hover:text-red-700 hover:bg-red-50 rounded-md px-2 py-1 disabled:opacity-50 shrink-0"
                          onClick={() => deleteCategoryMutation.mutate(cat.id)}
                          disabled={deleteCategoryMutation.isPending}
                          title="Ta bort kategori (varor flyttas till annan kategori)"
                          aria-label={`Ta bort kategorin ${cat.name}`}
                        >
                          Ta bort kategori
                        </button>
                      )}
                    </div>
                    {editMode && (
                      <div
                        className="flex items-center gap-1 flex-wrap"
                        role="group"
                        aria-label={`Färg för ${cat.name}`}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 rounded-full border-2 border-gray-300 bg-gray-100 text-[10px] font-medium text-gray-500 hover:bg-gray-200 disabled:opacity-50 shrink-0"
                          style={{
                            borderColor: !cat.color
                              ? "#1f2937"
                              : "transparent",
                            boxShadow: !cat.color
                              ? "0 0 0 2px #9ca3af"
                              : undefined,
                          }}
                          onClick={() =>
                            updateCategoryColorMutation.mutate({
                              categoryId: cat.id,
                              color: null,
                            })
                          }
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
                              borderColor:
                                currentHex === hex
                                  ? "#1f2937"
                                  : "transparent",
                              boxShadow:
                                currentHex === hex
                                  ? `0 0 0 2px ${hex}`
                                  : undefined,
                            }}
                            onClick={() =>
                              updateCategoryColorMutation.mutate({
                                categoryId: cat.id,
                                color: hex,
                              })
                            }
                            disabled={updateCategoryColorMutation.isPending}
                            title={hex}
                            aria-label={`Välj färg ${hex}`}
                            aria-pressed={currentHex === hex}
                          />
                        ))}
                        <label className="cursor-pointer shrink-0 flex items-center gap-1">
                          <span className="sr-only">
                            Välj egen färg (hex)
                          </span>
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
                        {editingItemId === item.id ? (
                          <input
                            type="text"
                            value={editingItemName}
                            onChange={(e) =>
                              setEditingItemName(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const trimmed = editingItemName.trim();
                                if (trimmed && trimmed !== item.name) {
                                  updateItemNameMutation.mutate({
                                    itemId: item.id,
                                    name: trimmed,
                                  });
                                } else {
                                  setEditingItemId(null);
                                  setEditingItemName("");
                                }
                              }
                              if (e.key === "Escape") {
                                setEditingItemId(null);
                                setEditingItemName("");
                              }
                            }}
                            onBlur={() => {
                              const trimmed = editingItemName.trim();
                              if (trimmed && trimmed !== item.name) {
                                updateItemNameMutation.mutate({
                                  itemId: item.id,
                                  name: trimmed,
                                });
                              } else {
                                setEditingItemId(null);
                                setEditingItemName("");
                              }
                            }}
                            className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-[#374151] font-medium focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                            aria-label="Redigera namn"
                            autoFocus
                            disabled={updateItemNameMutation.isPending}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItemId(item.id);
                              setEditingItemName(item.name);
                            }}
                            className="min-w-0 flex-1 text-left font-medium text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-1 rounded px-1 -mx-1 line-clamp-2"
                            aria-label={`Redigera ${item.name}`}
                          >
                            {item.name}
                          </button>
                        )}
                        <div className="flex items-center gap-2">
                          <select
                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-[#374151] disabled:opacity-60"
                            value={item.category_id}
                            onChange={(e) => {
                              const categoryId = e.target.value;
                              if (
                                categoryId &&
                                categoryId !== item.category_id
                              ) {
                                updateItemCategoryMutation.mutate({
                                  itemId: item.id,
                                  categoryId,
                                });
                              }
                            }}
                            aria-label={`Kategori för ${item.name}`}
                            disabled={
                              updateItemCategoryMutation.isPending &&
                              updateItemCategoryMutation.variables?.itemId ===
                                item.id
                            }
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          {updateItemCategoryMutation.isPending &&
                            updateItemCategoryMutation.variables?.itemId ===
                              item.id && (
                              <span className="text-xs text-[#6b7280]">
                                Uppdaterar…
                              </span>
                            )}
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => removeItemMutation.mutate(item)}
                            disabled={
                              removeItemMutation.isPending &&
                              removeItemMutation.variables?.id === item.id
                            }
                            title="Ta bort (sparas i arkiv)"
                            aria-label={`Ta bort ${item.name}`}
                          >
                            {removeItemMutation.isPending &&
                            removeItemMutation.variables?.id === item.id
                              ? "Tar bort…"
                              : "Ta bort"}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
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
                if (newItemName.trim() && selectedAddCategoryId) {
                  addItemMutation.mutate({
                    name: newItemName.trim(),
                    categoryId: selectedAddCategoryId,
                  });
                }
              }}
            >
              <div className="flex flex-1 min-w-0 gap-2 sm:contents">
                <label className="flex-1 min-w-0 text-sm text-[#374151]">
                  <span className="mb-1 block font-medium">Lägg till vara</span>
                  <Input
                    placeholder="t.ex. mjölk, bröd, äpplen…"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).form?.requestSubmit();
                      }
                    }}
                    aria-label="Namn på vara"
                    className="h-10 border-gray-200"
                  />
                </label>
                <label className="shrink-0 text-sm text-[#374151] sm:flex sm:flex-col sm:justify-end">
                  <span className="mb-1 block font-medium sm:mb-0 sm:sr-only">
                    Kategori
                  </span>
                  <select
                    value={selectedAddCategoryId}
                    onChange={(e) => setAddBarCategoryId(e.target.value)}
                    className="h-10 w-auto min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#374151] focus:border-[#22c55e] focus:outline-none focus:ring-1 focus:ring-[#22c55e]"
                    aria-label="Välj kategori"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="submit"
                disabled={
                  !newItemName.trim() ||
                  !selectedAddCategoryId ||
                  addItemMutation.isPending
                }
                className="h-10 w-full sm:flex-1 min-w-0 inline-flex items-center justify-center rounded-lg bg-[#22c55e] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addItemMutation.isPending ? "Lägger till…" : "Lägg till"}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
