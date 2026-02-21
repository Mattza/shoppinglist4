# Handlarlista-app – Funktionsbeskrivning

Detta dokument beskriver funktionerna i handlarlista-appen från användarens och produktens perspektiv.

---

## 1. Översikt

Appen är en delad handlarlista där användare kan skapa och hantera inköpslistor, kategorisera varor, få AI-hjälp att sortera inköp och få personliga rekommendationer baserat på tidigare inköp.

---

## 2. Autentisering och användare

### 2.1 Inloggning
- Användare måste vara inloggade för att använda appen.
- Syfte: kunna koppla listor till användare och hantera delning samt byta mellan listor.

### 2.2 Listor och åtkomst
- Varje användare kan ha flera listor.
- En lista är antingen:
  - **Skapad av dig** (du är ägare), eller
  - **Du är inbjuden** av ägaren (bara ägaren kan bjuda in).
- Användaren ska kunna byta mellan sina listor (välja aktiv lista).

---

## 3. Listvy och kategorier

### 3.1 Lägga till saker
- Användaren kan lägga till saker (rader/varor) i den aktiva listan.
- Varje sak ska tilldelas en **kategori**.

### 3.2 Gruppering i samma vy
- I samma vy visas alla tillagda saker **grupperade per kategori**.
- Alla kategorier och deras varor ska vara synliga i en och samma skärm/flik.

### 3.3 Standardkategorier
Följande kategorier ska finnas som standard (default) för nya listor:
- Frukt och grönt
- Bröd
- Kött
- Mejeri
- Frysvaror
- Hem och hushåll
- Övrigt

### 3.4 Kategorihantering per lista
- **Per lista** ska det gå att:
  - Lägga till egna kategorier.
  - Ta bort kategorier (med rimlig hantering av varor som redan tillhör kategorin).
- AI-kategorisering (se nedan) ska alltid använda **just den listans kategorier**, inte en global lista.

---

## 4. AI-kategorisering (Gemini)

### 4.1 Funktion
- En knapp/aktion som använder **Gemini** för att automatiskt gruppera de saker användaren vill handla i listans kategorier.
- Användaren anger eller har redan en mängd saker (t.ex. fritext eller en lista utan kategori); AI:t placerar varje sak i rätt kategori enligt listans definierade kategorier.

### 4.2 Beteende
- Indata: texter/varor som ska kategoriseras + listans aktuella kategorier.
- Utdata: samma varor med tilldelade kategorier (som sedan visas grupperade i listvyn).

---

## 5. Realtidssynk (flera användare)

### 5.1 Krav
- Om **två (eller fler) personer** är inne på **samma lista** ska de i **realtid** se när någon ändrar listan.
- Ändringar som ska synkas i realtid inkluderar t.ex.:
  - Nya varor tillagda
  - Varor borttagna
  - Kategoriändringar
  - Ändringar i listans kategorier (lägg till/ta bort)
  - Eventuella redigeringar av varor (namn, kategori)

### 5.2 Användarupplevelse
- Ingen manuell uppdatering (t.ex. "refresh") ska behövas för att se andras ändringar.

---

## 6. Borttagna varor (arkiv/spegeltabell)

### 6.1 När något tas bort från listan
- När användaren **tar bort** en vara från listan ska den **inte bara raderas**.
- Istället ska information om den borttagna varan sparas i en **spegeltabell/arkivtabell** för borttagna saker.
- Syfte: kunna använda historiken för rekommendationer (se nedan).

### 6.2 Vad som sparas (minimi)
- **Varje borttagning = en egen rad** i arkivtabellen (ingen gruppering på produktnamn). Detta ger tydlig historik och datum per händelse.
- Per rad sparas: identifiering av varan (namn, eventuellt kategori vid borttagning), **datum** (när den togs bort), samt koppling till användare och lista så att rekommendationer kan ges per användare/listkontext.

---

## 7. Rekommendationer (AI-förslag)

### 7.1 Grundidé
- Användaren ska kunna få **rekommendationer** på vad hen borde vilja lägga till i listan.
- Rekommendationerna ska baseras på **arkivtabellens data** (tidigare borttagna/inköpta varor) och skickas till **Gemini** för att generera förslag.

### 7.2 Rekommendationsvy
- Dedikerad vy/flik/sida för rekommendationer.
- Där visas AI-genererade förslag baserade på arkivdata (och eventuellt rekommendationsprofil, se nedan).

### 7.3 Fritext om förslaget
- I rekommendationsvyn ska användaren kunna skriva **fritext** om vad hen tycker om förslaget (t.ex. "gillar inte", "redan köpt", "perfekt").
- Denna feedback ska kunna sparas och användas för att förbättra framtida rekommendationer.

### 7.4 Rekommendationsprofil
- När användaren fyller i **ny fritext** om ett förslag ska:
  - Denna fritext **samt** användarens **rekommendationsprofil** skickas till AI.
  - AI ska använda detta för att **skapa eller uppdatera** rekommendationsprofilen.
- Rekommendationsprofilen används sedan vid nästa rekommendationsanrop för att ge mer personliga förslag.

---

## 8. Sammanfattning av användarflöden

| Flöde | Beskrivning |
|-------|-------------|
| Logga in | Krävs för att använda appen och se sina listor. |
| Byta lista | Välj mellan egna listor och listor där du är inbjuden. |
| Lägga till varor | Lägg till saker och tilldela kategori; se allt grupperat per kategori. |
| Hantera kategorier | Per lista: lägg till/ta bort kategorier. |
| AI-kategorisering | Knapp: skicka "vill handla"-listan till Gemini → gruppera i listans kategorier. |
| Realtid | Två personer på samma lista ser varandras ändringar direkt. |
| Ta bort vara | Vara tas bort från listan men sparas i arkivtabell. |
| Rekommendationer | Vy med AI-förslag baserat på arkiv; fritext-feedback uppdaterar rekommendationsprofil via AI. |

---

*Dokumentet kan användas som underlag för krav, användartester och för att generera eller validera den tekniska lösningen.*
