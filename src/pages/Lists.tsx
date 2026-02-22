import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ListWithMembership } from "@/types/database";
import { useAuth } from "@/hooks/useAuth";

async function fetchLists(): Promise<ListWithMembership[]> {
  const { data: memberships } = await supabase
    .from("list_members")
    .select("list_id, role");
  if (!memberships?.length) return [];
  const ids = memberships.map((m) => m.list_id);
  const { data: lists, error } = await supabase
    .from("lists")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  const withRole = (lists ?? []).map((l) => ({
    ...l,
    role: memberships.find((m) => m.list_id === l.id)!.role as
      | "owner"
      | "member",
  }));
  return withRole.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

export default function Lists() {
  const [newName, setNewName] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["lists"],
    queryFn: fetchLists,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user?.id) throw new Error("Du måste vara inloggad");
      const { data, error } = await supabase
        .from("lists")
        .insert({ name, owner_id: user.id });
      if (error) throw error;
      return data;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      navigate(`/list/${id}`);
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate(newName.trim());
    setNewName("");
  }

  if (isLoading) return <div className="loading">Laddar listor...</div>;

  return (
    <div className="lists-page">
      <h1>Mina listor</h1>
      <form onSubmit={handleCreate} className="create-list-form">
        <input
          placeholder="Namn på ny lista"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={createMutation.isPending || !user}>
          Skapa lista
        </button>
      </form>
      <ul className="list-list">
        {lists.map((list) => (
          <li key={list.id}>
            <button
              type="button"
              className="list-card"
              onClick={() => navigate(`/list/${list.id}`)}
            >
              <span className="list-name">{list.name}</span>
              <span className="list-role">
                {list.role === "owner" ? "Ägare" : "Medlem"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {lists.length === 0 && (
        <p className="empty">Du har inga listor än. Skapa en ovan.</p>
      )}
    </div>
  );
}
