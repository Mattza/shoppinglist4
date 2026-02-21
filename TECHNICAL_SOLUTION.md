# Handlarlista-app – Teknisk lösning

Detta dokument beskriver den tekniska lösningen för handlarlista-appen: arkitektur, vald stack, datamodell och integrationer. Det bygger på [FEATURES.md](./FEATURES.md).

---

## 1. Arkitekturöversikt

Backend är **en gemensam tjänst** (Supabase) som alla klienter använder. Första klienten är en React SPA med Vite; arkitekturen är utformad så att fler klienter (t.ex. mobilappar) enkelt kan läggas till utan att ändra backend.

```
                    ┌──────────────────┐     ┌─────────────┐
                    │   Supabase       │────▶│   Gemini    │
                    │   (Backend)      │◀────│   API       │
                    │                  │     └─────────────┘
                    │  Auth · DB ·     │
                    │  Realtime ·      │
                    │  Edge Functions  │
                    └────────┬─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Klient 1       │  │  Klient 2        │  │  Framtida        │
│  React SPA      │  │  (t.ex. mobil)   │  │  klienter        │
│  (Vite)         │  │  (valfritt)      │  │                  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

- **Supabase**: Autentisering, Postgres-databas, Realtime och Edge Functions (för Gemini). Samma API och samma datamodell för alla klienter.
- **Klienter**: Varje klient (webb, mobil, etc.) använder Supabase-klienten för sin plattform (JS/TS för webb, samma eller SDK för mobil). Realtid, auth och dataflöde fungerar likadant oavsett klient.
- **Gemini**: Anropas endast från Supabase Edge Functions (API-nyckel server-side). Används för (1) kategorisering av varor, (2) rekommendationer från arkiv + profil, (3) uppdatering av rekommendationsprofil från fritext.

---

## 2. Vald stack

### 2.1 Backend: Supabase

- **Postgres** – listor, medlemmar, kategorier, varor, arkiv, rekommendationsprofiler.
- **Supabase Auth** – inloggning; session/token används för alla anrop.
- **Supabase Realtime** – prenumeration på tabelländringar så att alla användare på samma lista ser uppdateringar direkt.
- **Edge Functions** – anropar Gemini API (kategorisering, rekommendationer, profiluppdatering); API-nyckel lagras i Supabase, aldrig i klienten.

### 2.2 Första klient: React SPA med Vite

- **Build:** Vite + React + TypeScript  
- **Data:** React Query (TanStack Query) för server-state; Supabase JS-klient för data, auth och Realtime-prenumerationer  
- **Routing:** React Router  
- **UI:** Val fritt (t.ex. Tailwind + shadcn/ui eller MUI)  
- **Auth:** Supabase Auth (session, skyddade routes)

Detta är den klient som byggs först. All logik som är specifik för webb (routing, layout, formulär) ligger i detta projekt; all delad affärslogik och dataåtkomst går via Supabase och är därmed återanvändbar för andra klienter.

---

## 3. Flera klienter (webb + mobil etc.)

Arkitekturen är **klientagnostisk**: Supabase är den enda backend, och alla klienter pratar samma API (REST/Realtime och Auth).

- **Samma datamodell** – listor, list_members, categories, list_items, archived_items, recommendation_profiles gäller för alla klienter.
- **Samma auth** – inloggning via Supabase Auth; mobilklienter använder samma användare och sessioner (t.ex. via Supabase JS/Flutter SDK eller REST).
- **Samma realtid** – prenumeration på `list_items` och `categories` filtrerat på `list_id` fungerar från vilken klient som helst; alla som är på samma lista ser samma ändringar.
- **Samma Edge Functions** – AI-kategorisering, rekommendationer och profiluppdatering anropas från valfri klient (autentiserad request till Edge Function-URL).

För att lägga till en andra klient (t.ex. React Native/Expo eller Flutter):

- Skapa ett nytt klientprojekt.
- Använd Supabase-klienten för den plattformen (eller REST + Realtime WebSocket om det behövs).
- Återanvänd samma RLS, samma tabeller och samma Edge Functions; bygg endast ny UI och plattformsspecifik navigation.

Inga ändringar i datamodell eller backend behövs för att stödja fler klienter.

---

## 4. Datamodell (Supabase/Postgres)

### 4.1 Tabeller

**users** (Supabase Auth hanterar identitet; eventuell profiltabell vid behov)
- `id` (UUID, från auth)
- `email`
- eventuellt `display_name`, `created_at`

**lists**
- `id` (UUID, PK)
- `owner_id` (FK → users)
- `name` (t.ex. "Veckoinhandlingen")
- `created_at`, `updated_at`

**list_members**
- `list_id` (FK → lists)
- `user_id` (FK → users)
- `role` (t.ex. "owner" | "member")
- Unik (`list_id`, `user_id`)

**categories** (per lista)
- `id` (UUID, PK)
- `list_id` (FK → lists)
- `name` (t.ex. "Frukt och grönt", "Bröd")
- `sort_order` (för visningsordning)
- Default-kategorier skapas när listan skapas.

**list_items** (varor på listan)
- `id` (UUID, PK)
- `list_id` (FK → lists)
- `category_id` (FK → categories)
- `name` (text, t.ex. "Mjölk")
- `created_at`, `updated_at`, eventuellt `created_by` (user_id)

**archived_items** (spegeltabell för borttagna varor)
- `id` (UUID, PK)
- `list_id` (FK → lists)
- `user_id` (FK → users)
- `name` (varans namn vid borttagning)
- `category_id` eller `category_name` (vid borttagning)
- `archived_at` (timestamp)

**recommendation_profiles**
- `id` (UUID, PK)
- `user_id` (FK → users)
- `list_id` (FK → lists, nullable om global profil)
- `profile_snapshot` (JSON/text) – AI-genererad profil
- `updated_at`

**recommendation_feedback** (valfritt, för historik)
- `id`, `user_id`, `list_id`, `recommendation_text`, `user_feedback` (fritext), `created_at`

### 4.2 Relationer (kort)

- En **list** har en owner och många list_members.
- En **list** har många **categories** och många **list_items**.
- Varje **list_item** tillhör en **category** och en **list**.
- **archived_items** tillhör en **list** och (valfritt) en **user**.
- **recommendation_profiles** tillhör en **user** och eventuellt en **list**.

---

## 5. Realtid (Supabase)

- Prenumeration på **Supabase Realtime** för tabellerna `list_items` och `categories` (eventuellt `lists`).
- Klienten filtrerar på den aktuella **list_id** (via Realtime-filter eller i appen) så att bara ändringar för den valda listan hanteras.
- Vid INSERT/UPDATE/DELETE uppdaterar klienten lokal state (t.ex. React Query cache eller state) så att UI ritar om direkt.
- Fungerar likadant från webb-SPA och från eventuella mobilklienter som använder Supabase.

---

## 6. Integrationsflöden (Edge Functions + Gemini)

### 6.1 AI-kategorisering

- **Indata:** Lista med varor att kategorisera + listans kategorier (från `categories`).
- **Anrop:** Edge Function anropar Gemini med prompt: varorna X, kategorierna Y → returnera mappning vara → kategori.
- **Utdata:** Klienten eller Edge Function skapar `list_items` med rätt `category_id`. Realtime sprider ändringen till alla klienter på listan.

### 6.2 Rekommendationer

- **Indata:** Arkiv (`archived_items` för listan/användaren) + `recommendation_profiles`.
- **Anrop:** Edge Function skickar arkiv + profil till Gemini → N förslag.
- **Utdata:** Förslag returneras till klienten och visas i rekommendationsvyn; användaren kan lägga till i listan och/eller ge fritext-feedback.

### 6.3 Uppdatering av rekommendationsprofil

- **Indata:** Nuvarande profil-snapshot + användarens fritext om förslaget.
- **Anrop:** Edge Function: Gemini uppdaterar profilen utifrån feedback.
- **Utdata:** Ny profil-snapshot sparas i `recommendation_profiles` (upsert på user_id + eventuellt list_id).

---

## 7. Säkerhet och åtkomst (Supabase RLS)

- **Auth:** Alla anrop sker som inloggad användare (Supabase session/token); gäller alla klienter.
- **Listor:** Skapa lista kräver inloggning; användaren sätts som owner och läggs i `list_members`. Läsa/redigera lista endast om användaren finns i `list_members`. Inbjudan = ny rad i `list_members` med role "member".
- **RLS:** Row Level Security på `lists`, `list_items`, `categories`, `archived_items`, `recommendation_profiles` så att endast medlemmar i respektive lista kan läsa/skriva. Samma regler gäller oavsett vilken klient som anropar.

---

## 8. Default-kategorier

Vid skapande av ny lista skapas följande rader i `categories` (samma `list_id`, olika `sort_order`):

- Frukt och grönt  
- Bröd  
- Kött  
- Mejeri  
- Frysvaror  
- Hem och hushåll  
- Övrigt  

Användaren kan per lista lägga till och ta bort kategorier; AI-kategorisering använder alltid den listans aktuella kategorier.

---

## 9. Arkiv (spegeltabell) vid borttagning

- Vid "ta bort vara": skapa rad i `archived_items` (list_id, user_id, name, category_id/category_name, archived_at), ta sedan bort raden från `list_items`.
- Realtime på `list_items` gör att andra klienter/användare ser att varan försvunnit; arkiv används för rekommendationer och profil, inte i listvyn.

---

## 10. Sammanfattning

| Del | Val |
|-----|-----|
| **Backend** | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| **Första klient** | React SPA med Vite + TypeScript |
| **AI** | Gemini via Supabase Edge Functions |
| **Flera klienter** | Samma Supabase-backend; nya klienter (t.ex. mobil) använder samma API, RLS och datamodell |

Arkitekturen är avsiktligt enkel och klientagnostisk så att du kan lägga till fler klienter senare utan att ändra backend eller datamodell.

---

*Detta dokument ska användas tillsammans med [FEATURES.md](./FEATURES.md) för att implementera appen.*
