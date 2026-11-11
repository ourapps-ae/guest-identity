import { authenticate, claim, emptyBook, type Deps, type IdentityBook, type IdentitySettings } from "../implementation/server/identity.ts";
import { createIdentityStore, clipName, type KeyValueStorage } from "../implementation/web/identity-store.ts";

// A guest joins a room on a phone and comes back after a reload with the token the phone kept; a laptop that types the
// same name without that token is refused, so the seat stays with the phone.
export function joinFromTwoDevices(settings: IdentitySettings, deps: Deps) {
  let book: IdentityBook = emptyBook();
  const memory = (): KeyValueStorage => {
    const data = new Map<string, string>();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };
  const phone = createIdentityStore(memory(), settings);
  const laptop = createIdentityStore(memory(), settings);

  const join = (device: ReturnType<typeof createIdentityStore>, typed: string) => {
    const name = device.setName(clipName(typed, settings));
    const r = claim(book, name, deps, settings, device.session("player")?.token ?? null);
    if (!r.ok) return null;
    book = r.value.book;
    device.saveSession("player", { token: r.value.token, roomId: "room-1" });
    return r.value;
  };
  const first = join(phone, "Ann");
  const back = join(phone, "Ann");
  const laptopJoin = join(laptop, "Ann");
  return {
    sameGuest: first?.id === back?.id,
    phoneStillWorks: authenticate(book, phone.session("player")!.token, deps, settings) !== null,
    laptopRefused: laptopJoin === null,
  };
}
