// Date parsing for Indian administrative documents. Numeric dates are interpreted as
// DD/MM/YYYY (the prevailing convention), never MM/DD/YYYY. Invalid calendar dates return null —
// we never guess.

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH_RE =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const PATTERNS: { re: RegExp; order: "dmy" | "ymd" | "dMy" | "Mdy" }[] = [
  { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, order: "ymd" },
  { re: /\b(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})\b/, order: "dmy" },
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "i"), order: "dMy" },
  { re: new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i"), order: "Mdy" },
];

export function toIsoDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface DateMatch {
  iso: string | null;
  raw: string;
  index: number;
}

/** Find the first date-like expression in `text`. `iso` is null when it is not a valid date. */
export function findDate(text: string): DateMatch | null {
  let best: DateMatch | null = null;
  for (const { re, order } of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    let y: number, mo: number, d: number;
    if (order === "ymd") [y, mo, d] = [+m[1], +m[2], +m[3]];
    else if (order === "dmy") [d, mo, y] = [+m[1], +m[2], +m[3]];
    else if (order === "dMy") [d, mo, y] = [+m[1], MONTHS[m[2].toLowerCase()], +m[3]];
    else [mo, d, y] = [MONTHS[m[1].toLowerCase()], +m[2], +m[3]];
    const candidate = { iso: toIsoDate(y, mo, d), raw: m[0], index: m.index };
    if (!best || candidate.index < best.index) best = candidate;
  }
  return best;
}

export function parseDate(text: string | null | undefined): string | null {
  if (!text) return null;
  return findDate(text)?.iso ?? null;
}

/** Parse a PDF date string such as "D:20240615120000+05'30'" into an ISO timestamp. */
export function parsePdfDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+\-])?(\d{2})?'?(\d{2})?/.exec(value.trim());
  if (!m) return null;
  const [y, mo = "01", d = "01", h = "00", mi = "00", s = "00"] = m.slice(1, 7);
  let iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  const tz = m[7];
  if (!tz || tz === "Z" || tz === "z") iso += "Z";
  else iso += `${tz}${m[8] ?? "00"}:${m[9] ?? "00"}`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** Academic year "2027-28" → first day of the academic session (configurable month/day). */
export function academicYearStart(academicYear: string, month = 7, day = 1): string | null {
  const m = /^(\d{4})/.exec(academicYear.trim());
  if (!m) return null;
  return toIsoDate(+m[1], month, day);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
