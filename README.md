# Handlarlista

Delad handlarlista-app med kategorier, AI-kategorisering (Gemini), realtid och rekommendationer. Byggd enligt [FEATURES.md](./FEATURES.md) och [TECHNICAL_SOLUTION.md](./TECHNICAL_SOLUTION.md).

## Krav

- Node.js 18+
- Ett Supabase-projekt
- Gemini API-nyckel (för AI-funktioner)

## Setup

### 1. Supabase-projekt

1. Skapa ett projekt på [supabase.com](https://supabase.com).
2. Kör SQL-migrationerna i **SQL Editor** i ordning:
   - `supabase/migrations/20250221000001_schema.sql`
   - `supabase/migrations/20250221000002_rls.sql`
   - `supabase/migrations/20250221000003_default_categories.sql`
3. Under **Project Settings → API** kopierar du **Project URL** och **Publishable (anon) key**.

### 2. Edge Functions (Gemini)

1. Installera [Supabase CLI](https://supabase.com/docs/guides/cli) och logga in.
2. Länka projektet: `supabase link --project-ref ditt-project-ref`
3. Sätt hemlighet: `supabase secrets set GEMINI_API_KEY=din-gemini-api-nyckel`
4. Deploya funktionerna:
   ```bash
   supabase functions deploy categorize-items
   supabase functions deploy get-recommendations
   supabase functions deploy update-recommendation-profile
   ```

### 3. Frontend

1. Kopiera `.env.example` till `.env` och fyll i:
   - `VITE_SUPABASE_URL` = Project URL från Supabase
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = Publishable key från Supabase (samma som "anon" i API-inställningarna). Vid 403 på t.ex. skapa lista: prova den **långa anon-nyckeln** (JWT-format) i stället för `sb_publishable_...` om din dashboard visar båda.
2. Installera och starta:
   ```bash
   npm install
   npm run dev
   ```
3. Öppna http://localhost:5173 och skapa konto / logga in.

## Funktioner

- **Inloggning** – e-post/lösenord (Supabase Auth)
- **Listor** – skapa listor, byt mellan egna och listor du är inbjuden till
- **Listvy** – varor grupperade per kategori; lägg till, ta bort (sparas i arkiv)
- **Kategorier** – standardkategorier per lista; lägg till/ta bort per lista
- **AI-kategorisering** – klistra in varor, klicka för att automatiskt lägga till i listans kategorier (Gemini)
- **Realtid** – alla som har listan öppen ser ändringar direkt
- **Rekommendationer** – förslag baserat på arkiv + rekommendationsprofil; fritext-feedback uppdaterar profilen via AI

Inbjudan till lista (som ägare) stöds i datamodellen (`list_members`); en egen "Bjud in"-vy kan läggas till senare (t.ex. via e-post med Edge Function).

## Projektstruktur

- `src/` – React SPA (Vite)
- `supabase/migrations/` – SQL-schema och RLS
- `supabase/functions/` – Edge Functions (categorize-items, get-recommendations, update-recommendation-profile)
