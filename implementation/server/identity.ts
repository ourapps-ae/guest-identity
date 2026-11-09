// Guests are known by the name they type; no account, no password. A name belongs to one record.
// Claiming the name gives the caller a private token and cancels the one before, so the newest
// device holds the seat. A token older than the rotation period is swapped for a fresh one the
// next time it is used. Pure functions over a plain book: storage belongs to the caller.
export type IdentitySettings = { nameMinLength: number; nameMaxLength: number; tokenRotationSeconds: number };
export type IdentityRecord = { id: string; name: string; token: string; previousToken: string | null; issuedAt: number; lastSeenAt: number };
export type IdentityBook = { records: { [id: string]: IdentityRecord } };
export type Deps = { now: () => number; newId: () => string; newToken: () => string };
export type IdentityError = { code: "badName" | "badToken"; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: IdentityError };

export const DEFAULT_SETTINGS: IdentitySettings = { nameMinLength: 1, nameMaxLength: 20, tokenRotationSeconds: 0 };

export function validateSettings(settings: Partial<IdentitySettings> = {}): IdentitySettings {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (!Number.isSafeInteger(s.nameMinLength) || s.nameMinLength < 1) throw new RangeError("nameMinLength must be a whole number of at least 1");
  if (!Number.isSafeInteger(s.nameMaxLength) || s.nameMaxLength < s.nameMinLength) throw new RangeError("nameMaxLength must be a whole number, not below nameMinLength");
  if (!Number.isSafeInteger(s.tokenRotationSeconds) || s.tokenRotationSeconds < 0) throw new RangeError("tokenRotationSeconds must be a whole number of 0 or more");
  return s;
}

export function emptyBook(): IdentityBook {
  return { records: {} };
}

// Printable ASCII, already trimmed, within the length limits.
export function validName(name: unknown, settings: IdentitySettings = DEFAULT_SETTINGS): name is string {
  return typeof name === "string" && name.length >= settings.nameMinLength && name.length <= settings.nameMaxLength && /^[\x20-\x7E]*$/.test(name) && name.trim() === name && name.trim().length >= 1;
}

export function checkName(name: unknown, settings: IdentitySettings = DEFAULT_SETTINGS): Result<string> {
  return validName(name, settings) ? { ok: true, value: name } : { ok: false, error: { code: "badName", message: `A name is ${settings.nameMinLength} to ${settings.nameMaxLength} plain characters with no space at either end.` } };
}

export function findByName(book: IdentityBook, name: string): IdentityRecord | undefined {
  return Object.values(book.records).find((r) => r.name === name);
}

// Take the name: a new guest, or the same guest returning from any device. The previous token stops working.
export function claim(book: IdentityBook, name: unknown, deps: Deps, settings: IdentitySettings = DEFAULT_SETTINGS): Result<{ book: IdentityBook; id: string; token: string; rejoined: boolean }> {
  const checked = checkName(name, settings);
  if (!checked.ok) return checked;
  const existing = findByName(book, checked.value);
  const now = deps.now();
  const id = existing?.id ?? deps.newId();
  const token = deps.newToken();
  const record: IdentityRecord = { id, name: checked.value, token, previousToken: null, issuedAt: now, lastSeenAt: now };
  return { ok: true, value: { book: { records: { ...book.records, [id]: record } }, id, token, rejoined: existing !== undefined } };
}

export type Authenticated = { book: IdentityBook; id: string; name: string; rotatedToken: string | null };

// Who holds this token. When it is due for rotation, or is the one just replaced, `rotatedToken`
// carries the current token the device must keep from now on.
export function authenticate(book: IdentityBook, token: string, deps: Deps, settings: IdentitySettings = DEFAULT_SETTINGS): Authenticated | null {
  const now = deps.now();
  const graceMs = settings.tokenRotationSeconds * 1000;
  const record = Object.values(book.records).find((r) => r.token === token || (r.previousToken === token && graceMs > 0 && now - r.issuedAt < graceMs));
  if (!record) return null;
  let next = { ...record, lastSeenAt: now };
  let rotatedToken: string | null = null;
  if (record.previousToken === token) {
    rotatedToken = record.token;
  } else if (graceMs > 0 && now - record.issuedAt >= graceMs) {
    rotatedToken = deps.newToken();
    next = { ...next, token: rotatedToken, previousToken: token, issuedAt: now };
  }
  return { book: { records: { ...book.records, [record.id]: next } }, id: record.id, name: record.name, rotatedToken };
}

export function release(book: IdentityBook, id: string): IdentityBook {
  const { [id]: _gone, ...records } = book.records;
  return { records };
}

// Portable form: one JSON record per line, ordered by id.
export function exportAll(book: IdentityBook): string {
  return Object.values(book.records).sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => JSON.stringify(r)).join("\n") + (Object.keys(book.records).length ? "\n" : "");
}

export function importAll(text: string): Result<IdentityBook> {
  const records: IdentityBook["records"] = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let r: Partial<IdentityRecord>;
    try { r = JSON.parse(line); } catch { return { ok: false, error: { code: "badToken", message: "A record is not valid JSON." } }; }
    if (typeof r.id !== "string" || typeof r.name !== "string" || typeof r.token !== "string" || (r.previousToken !== null && typeof r.previousToken !== "string") || typeof r.issuedAt !== "number" || typeof r.lastSeenAt !== "number") {
      return { ok: false, error: { code: "badToken", message: "A record has missing or wrongly typed fields." } };
    }
    records[r.id] = r as IdentityRecord;
  }
  return { ok: true, value: { records } };
}

// SHA-256 of one record in canonical field order, for checking a move record by record.
export async function recordDigest(record: IdentityRecord): Promise<string> {
  const text = JSON.stringify([record.id, record.name, record.token, record.previousToken, record.issuedAt, record.lastSeenAt]);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- the settings bound once (what a consumer such as seating calls) ----

export type IdentityApi = {
  settings: IdentitySettings;
  // True for a name a person may sit down under (the `nameMinLength` to `nameMaxLength` rule of `validName`).
  validName(name: unknown): boolean;
  checkName(name: unknown): Result<string>;
  claim(book: IdentityBook, name: unknown, deps: Deps): ReturnType<typeof claim>;
  authenticate(book: IdentityBook, token: string, deps: Deps): Authenticated | null;
  findByName(book: IdentityBook, name: string): IdentityRecord | undefined;
  release(book: IdentityBook, id: string): IdentityBook;
};

export function createIdentityApi(settings: Partial<IdentitySettings> = {}): IdentityApi {
  const bound = validateSettings(settings);
  return {
    settings: bound,
    validName: (name) => validName(name, bound),
    checkName: (name) => checkName(name, bound),
    claim: (book, name, deps) => claim(book, name, deps, bound),
    authenticate: (book, token, deps) => authenticate(book, token, deps, bound),
    findByName,
    release,
  };
}
