import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { authenticate, checkName, claim, createIdentityApi, validateSettings, emptyBook, exportAll, findByName, importAll, recordDigest, release, validName, type Deps, type IdentitySettings } from "../implementation/server/identity.ts";
import { clipName, createIdentityStore, nameToSave, type KeyValueStorage } from "../implementation/web/identity-store.ts";
import { joinFromTwoDevices } from "../examples/consumer.ts";

const names = JSON.parse(readFileSync(new URL("fixtures/names.json", import.meta.url), "utf8"));
const settings = (over: Partial<IdentitySettings> = {}): IdentitySettings => ({ nameMinLength: 1, nameMaxLength: 20, tokenRotationSeconds: 0, ...over });

function deps(start = 1_000): Deps & { time: number } {
  let ids = 0, tokens = 0;
  const d = { time: start, now: () => d.time, newId: () => `id${++ids}`, newToken: () => `tok${++tokens}` };
  return d;
}
function memory(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

test("name rules from the fixture, for both rule sets", () => {
  for (const set of names.sets) {
    const s = settings({ nameMinLength: set.rules.min, nameMaxLength: set.rules.max });
    for (const [name, valid] of set.cases) assert.equal(validName(name, s), valid, JSON.stringify(name));
  }
  assert.equal(validName(42), false);
  assert.equal(validName(undefined), false);
  const bad = checkName("", settings());
  assert.equal(!bad.ok && bad.error.code, "badName");
});

test("client clipping and saving follow the same rules", () => {
  assert.equal(clipName(names.clip.input, settings({ nameMaxLength: names.clip.max })), names.clip.output);
  for (const [input, saved] of names.save) assert.equal(nameToSave(input, settings()), saved, JSON.stringify(input));
});

test("claiming a name: new guest, then the same guest from another device with the old token cancelled", () => {
  const d = deps();
  const first = claim(emptyBook(), "Ann", d, settings());
  assert.ok(first.ok);
  assert.equal(first.value.rejoined, false);
  d.time += 5;
  const second = claim(first.value.book, "Ann", d, settings());
  assert.ok(second.ok);
  assert.equal(second.value.rejoined, true);
  assert.equal(second.value.id, first.value.id);
  assert.notEqual(second.value.token, first.value.token);
  assert.equal(authenticate(second.value.book, first.value.token, d, settings()), null);
  assert.equal(authenticate(second.value.book, second.value.token, d, settings())?.id, first.value.id);
  const other = claim(second.value.book, "Bob", d, settings());
  assert.ok(other.ok && other.value.id !== first.value.id);
  assert.equal(claim(emptyBook(), " Ann", d, settings()).ok, false);
});

test("the claim does not change the book it was given", () => {
  const d = deps();
  const book = emptyBook();
  claim(book, "Ann", d, settings());
  assert.deepEqual(book, emptyBook());
});

test("tokens rotate after the period; the replaced token works once more within one period, then not", () => {
  const d = deps(0);
  const s = settings({ tokenRotationSeconds: 60 });
  const c = claim(emptyBook(), "Ann", d, s);
  assert.ok(c.ok);
  let book = c.value.book;
  d.time = 59_000;
  const early = authenticate(book, c.value.token, d, s)!;
  assert.equal(early.rotatedToken, null);
  book = early.book;
  d.time = 60_000;
  const due = authenticate(book, c.value.token, d, s)!;
  assert.equal(due.rotatedToken, "tok2");
  book = due.book;
  d.time = 90_000;
  const lagging = authenticate(book, c.value.token, d, s)!;
  assert.equal(lagging.id, c.value.id);
  assert.equal(lagging.rotatedToken, "tok2", "a device that missed the rotation is told the current token");
  d.time = 120_000;
  assert.equal(authenticate(book, c.value.token, d, s), null);
  assert.equal(authenticate(book, "tok2", d, s)?.rotatedToken, "tok3");
  assert.equal(authenticate(book, "unknown", d, s), null);
});

test("with rotation off a token stays valid until the name is claimed again", () => {
  const d = deps(0);
  const c = claim(emptyBook(), "Ann", d, settings());
  assert.ok(c.ok);
  d.time = 10 ** 9;
  assert.equal(authenticate(c.value.book, c.value.token, d, settings())?.rotatedToken, null);
});

test("release forgets the guest; export and import keep every record, checked by digest", async () => {
  const d = deps();
  let book = emptyBook();
  for (const n of ["Cy", "Ann", "Bob"]) { const r = claim(book, n, d, settings()); assert.ok(r.ok); book = r.value.book; }
  const text = exportAll(book);
  assert.equal(text.trim().split("\n").length, 3);
  const back = importAll(text);
  assert.ok(back.ok);
  assert.deepEqual(back.value, book);
  for (const id of Object.keys(book.records)) assert.equal(await recordDigest(back.value.records[id]), await recordDigest(book.records[id]));
  assert.equal((await recordDigest(book.records.id1)).length, 64);
  assert.equal(findByName(release(book, "id2"), "Ann"), undefined);
  assert.equal(importAll("{not json}").ok, false);
  assert.equal(importAll('{"id":"x"}\n').ok, false);
  assert.equal(exportAll(emptyBook()), "");
});

test("device store keeps the name and a session per slot", () => {
  const store = createIdentityStore(memory(), settings());
  assert.equal(store.name(), "");
  assert.equal(store.setName("   "), null);
  assert.equal(store.setName(" Ann "), "Ann");
  assert.equal(store.name(), "Ann");
  assert.equal(store.session("player"), null);
  store.saveSession("player", { token: "t1", roomId: "r1" });
  store.saveSession("display", { token: "t2", roomId: "r2" });
  assert.deepEqual(store.session("player"), { token: "t1", roomId: "r1" });
  store.replaceToken("player", "t9");
  assert.deepEqual(store.session("player"), { token: "t9", roomId: "r1" });
  store.clearSession("player");
  assert.equal(store.session("player"), null);
  assert.deepEqual(store.session("display"), { token: "t2", roomId: "r2" });
  assert.equal(store.name(), "Ann");
});

test("example: the same name on two devices is one guest and only the newest device holds the seat", () => {
  const result = joinFromTwoDevices(settings(), deps());
  assert.deepEqual(result, { sameGuest: true, phoneStillWorks: false, laptopWorks: true });
});

test("the shipped ndjson fixture round-trips through import and export", () => {
  const text = readFileSync(new URL("fixtures/records.ndjson", import.meta.url), "utf8");
  const book = importAll(text);
  assert.ok(book.ok);
  assert.equal(Object.keys(book.value.records).length, 2);
  assert.equal(exportAll(book.value), text);
  const schema = JSON.parse(readFileSync(new URL("../interfaces/identity-record.schema.json", import.meta.url), "utf8"));
  for (const r of Object.values(book.value.records)) for (const key of schema.required) assert.ok(key in r, key);
});

// ---- the settings bound once: what seating calls ----

test("validName(name) with the installed limits, the same answers as validName(name, settings) for every fixture case", () => {
  for (const set of names.sets) {
    const api = createIdentityApi({ nameMinLength: set.rules.min, nameMaxLength: set.rules.max });
    for (const [name, valid] of set.cases) assert.equal(api.validName(name), valid, JSON.stringify(name));
  }
  const defaults = createIdentityApi();
  assert.deepEqual(defaults.settings, { nameMinLength: 1, nameMaxLength: 20, tokenRotationSeconds: 0 });
  for (const bad of [undefined, null, 5, {}, [], "", " a", "a ", "x".repeat(21), "tab\there", "caf\u00e9"]) assert.equal(defaults.validName(bad), false, JSON.stringify(bad));
  for (const good of ["Ann", "a", "x".repeat(20), "Mary Jane"]) assert.equal(defaults.validName(good), true, good);
  assert.equal(createIdentityApi({ nameMinLength: 3 }).validName("ab"), false);
  assert.equal(createIdentityApi({ nameMaxLength: 5 }).validName("abcdef"), false);
});

test("the bound claim, authenticate and checkName use the same limits and rotation", () => {
  const api = createIdentityApi({ nameMaxLength: 5, tokenRotationSeconds: 60 });
  const d = deps(0);
  assert.equal(api.claim(emptyBook(), "toolong", d).ok, false);
  assert.deepEqual(api.checkName("toolong"), checkName("toolong", api.settings));
  const first = api.claim(emptyBook(), "Ann", d);
  assert.ok(first.ok);
  if (!first.ok) return;
  d.time = 61_000;
  const auth = api.authenticate(first.value.book, first.value.token, d);
  assert.ok(auth && auth.rotatedToken !== null, "rotation period applied");
  assert.equal(api.findByName(auth!.book, "Ann")?.id, first.value.id);
  assert.deepEqual(api.release(auth!.book, first.value.id), { records: {} });
});

test("settings are checked", () => {
  assert.deepEqual(validateSettings({ nameMaxLength: 12 }), { nameMinLength: 1, nameMaxLength: 12, tokenRotationSeconds: 0 });
  for (const bad of [{ nameMinLength: 0 }, { nameMinLength: 5, nameMaxLength: 4 }, { nameMaxLength: 1.5 }, { tokenRotationSeconds: -1 }]) assert.throws(() => validateSettings(bad), RangeError, JSON.stringify(bad));
  assert.throws(() => createIdentityApi({ nameMinLength: 0 }), RangeError);
});

test("validName(name) fits the one-argument operation seating declares: it can be passed on as a bare function", () => {
  const { validName: check } = createIdentityApi();
  assert.deepEqual(["Ann", "", " x"].map(check), [true, false, false]);
});

test("room use (realtime-rooms services.identity): claim keeps a known id, release frees the name, a rotated token is handed back and the book given is not changed", () => {
  const api = createIdentityApi({ tokenRotationSeconds: 60 });
  assert.deepEqual(Object.keys(api).filter((k) => ["claim", "authenticate", "release"].includes(k)).sort(), ["authenticate", "claim", "release"]);
  const d = deps(0);
  // The room offers the id the game already knows for the name; guest-identity uses it only for a name it has not seen.
  const known = { ...d, newId: () => "seat-7" };
  const first = api.claim(emptyBook(), "Ann", known);
  assert.ok(first.ok);
  if (!first.ok) return;
  assert.equal(first.value.id, "seat-7");
  const again = api.claim(first.value.book, "Ann", { ...d, newId: () => "other" });
  assert.ok(again.ok && again.value.id === "seat-7" && again.value.rejoined && again.value.token !== first.value.token);
  if (!again.ok) return;
  assert.equal(api.authenticate(again.value.book, first.value.token, d), null, "the replaced token stops working at once after a claim");
  d.time = 61_000;
  const frozen = JSON.stringify(again.value.book);
  const due = api.authenticate(again.value.book, again.value.token, d);
  assert.ok(due && due.rotatedToken !== null && due.id === "seat-7" && due.name === "Ann");
  assert.equal(JSON.stringify(again.value.book), frozen);
  const freed = api.release(due!.book, "seat-7");
  assert.equal(api.authenticate(freed, due!.rotatedToken!, d), null);
  const fresh = api.claim(freed, "Ann", { ...d, newId: () => "seat-8" });
  assert.ok(fresh.ok && fresh.value.id === "seat-8" && !fresh.value.rejoined);
  const refused = api.claim(freed, "", d);
  assert.ok(!refused.ok && refused.error.code === "badName");
});

// ---- the interface document (OpenRPC 1.3.2) ----

test("every method in interfaces/guest-identity.json exists in the implementation for the languages it is tagged with", async () => {
  const doc = JSON.parse(readFileSync(new URL("../interfaces/guest-identity.json", import.meta.url), "utf8"));
  assert.equal(doc.openrpc, "1.3.2");
  assert.equal(doc.info.title, "ae/guest-identity");
  const server = await import("../implementation/server/identity.ts");
  const web = await import("../implementation/web/identity-store.ts");
  const api = server.createIdentityApi() as Record<string, unknown>;
  const store = web.createIdentityStore(memory(), settings()) as Record<string, unknown>;
  const swift = readFileSync(new URL("../implementation/apple/Sources/GuestIdentity.swift", import.meta.url), "utf8");
  const kotlin = readFileSync(new URL("../implementation/android/src/main/java/ae/identity/GuestIdentity.kt", import.meta.url), "utf8");
  const exported = { ...server, ...web } as Record<string, unknown>;
  for (const method of doc.methods) {
    const tags = method.tags.map((t: { name: string }) => t.name);
    const [owner, member] = method.name.includes(".") ? method.name.split(".") : [null, method.name];
    if (tags.includes("typescript")) {
      const target = owner === "IdentityApi" ? api[member] : owner === "IdentityStore" ? store[member] : exported[member];
      assert.equal(typeof target, "function", method.name);
    }
    for (const [language, source] of [["swift", swift], ["kotlin", kotlin]] as const) {
      if (!tags.includes(language)) continue;
      assert.match(source, new RegExp(member === "init" ? `(struct|class) ${owner}\\b` : `(func|fun|var|val) ${member}\\b`), `${language} ${method.name}`);
    }
  }
});
