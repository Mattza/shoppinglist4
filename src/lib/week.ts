/** Vecka som börjar måndag (lokal tid). */

export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Föreslagen vecka: nästa veckas måndag, utom om idag är måndag — då denna vecka.
 */
export function defaultSuggestedWeekMonday(): Date {
  const now = new Date();
  const mondayThisWeek = startOfWeekMonday(now);
  if (now.getDay() === 1) return mondayThisWeek;
  return addDays(mondayThisWeek, 7);
}

export function toISODateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODateLocal(s: string): Date {
  const [y, mo, d] = s.split("-").map(Number);
  if (!y || !mo || !d) return new Date(NaN);
  return new Date(y, mo - 1, d);
}

/** Normalisera valt datum till veckans måndag (lokal tid). */
export function toMondayFromAnyDateStr(s: string): string {
  const d = parseISODateLocal(s);
  if (Number.isNaN(d.getTime())) return s;
  return toISODateString(startOfWeekMonday(d));
}

export function formatWeekRangeSv(weekStartMonday: Date): string {
  const end = addDays(weekStartMonday, 6);
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${fmt.format(weekStartMonday)}–${fmt.format(end)}`;
}
