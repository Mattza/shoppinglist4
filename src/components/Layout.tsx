import { useState, useRef, useEffect } from "react";
import { Outlet, Link, useParams, useLocation, useNavigate } from "react-router-dom";

const LAST_PATH_KEY = "shoppinglist4_last_path";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useLists } from "@/hooks/useLists";
import { useCurrentList } from "@/hooks/useCurrentList";

function getInitials(
  user:
    | { user_metadata?: { full_name?: string; name?: string }; email?: string }
    | null
    | undefined
): string {
  if (!user) return "?";
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  if (user.email) return user.email[0].toUpperCase();
  return "?";
}

export default function Layout() {
  const { listSlug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listsRef = useRef<HTMLDivElement>(null);
  const { data: lists = [] } = useLists();
  const { data: currentList } = useCurrentList(listSlug ?? undefined);

  // Restore last path when landing on index
  useEffect(() => {
    if (location.pathname !== "/" || location.search) return;
    try {
      const saved = localStorage.getItem(LAST_PATH_KEY);
      if (saved && saved !== "/" && saved !== "/login" && !saved.startsWith("/login")) {
        navigate(saved, { replace: true });
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist path on navigation (skip index and login)
  useEffect(() => {
    if (location.pathname === "/" || location.pathname === "/login") return;
    try {
      const full = location.pathname + location.search;
      localStorage.setItem(LAST_PATH_KEY, full);
    } catch {
      // ignore
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (listsRef.current && !listsRef.current.contains(e.target as Node)) {
        setListsOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      <header className="relative z-50 border-b border-gray-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-4">
            <div className="relative" ref={listsRef}>
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium text-[#2563eb] hover:underline"
                onClick={() => setListsOpen((o) => !o)}
                aria-expanded={listsOpen}
                aria-haspopup="true"
              >
                Mina listor
                <svg
                  className="h-4 w-4"
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
              {listsOpen && (
                <div
                  className="absolute left-0 top-full mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                  role="menu"
                >
                  <Link
                    to="/"
                    className="block px-4 py-2 text-sm text-[#374151] hover:bg-gray-50"
                    role="menuitem"
                    onClick={() => setListsOpen(false)}
                  >
                    Alla listor
                  </Link>
                  {lists.map((list) => (
                    <Link
                      key={list.id}
                      to={`/list/${list.slug}`}
                      className="block px-4 py-2 text-sm text-[#374151] hover:bg-gray-50"
                      role="menuitem"
                      onClick={() => setListsOpen(false)}
                    >
                      {list.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {/* {listSlug && (
              <Link
                to={`/list/${listSlug}`}
                className="text-sm font-medium text-[#2563eb] hover:underline"
              >
                Handla
              </Link>
            )} */}
          </div>

          {listSlug && currentList && (
            <h1 className="absolute left-1/2 -translate-x-1/2 text-2xl font-bold text-[#1f2937]">
              {currentList.name}
            </h1>
          )}

          <div className="flex items-center justify-end">
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gray-400 bg-gray-100 text-sm font-semibold text-gray-600 shadow-sm hover:border-gray-500 hover:bg-gray-200"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label="Öppna meny"
              >
                {user?.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getInitials(user)
                )}
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-2 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                  role="menu"
                >
                  {listSlug && (
                    <>
                      <Link
                        to={`/list/${listSlug}`}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-[#374151] hover:bg-gray-50"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                      >
                        Lista
                      </Link>
                      <Link
                        to={`/list/${listSlug}/recommendations`}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-[#374151] hover:bg-gray-50"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                      >
                        Rekommendationer
                      </Link>
                    </>
                  )}
                  <button
                    type="button"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      supabase.auth.signOut();
                    }}
                  >
                    Logga ut
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
