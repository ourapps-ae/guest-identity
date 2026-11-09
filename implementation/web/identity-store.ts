// What a device keeps of who it is: the name the guest typed and, per slot, the private token and
// the room it belongs to. A slot is one way of taking part (a player's seat, a table viewer).
import { validName, type IdentitySettings } from "../server/identity.ts";

export type KeyValueStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
export type SlotKeys = { token: string; room: string };
export type Session = { token: string; roomId: string };
export type IdentityKeys = { name: string; slots: { [slot: string]: SlotKeys } };

export const DEFAULT_KEYS: IdentityKeys = { name: "name", slots: { player: { token: "token", room: "roomId" }, display: { token: "boardToken", room: "boardRoomId" } } };

// Typing stops at the longest name allowed.
export function clipName(input: string, settings: IdentitySettings): string {
  return input.slice(0, settings.nameMaxLength);
}

// What the save button needs: the trimmed name, or null while it is not yet acceptable.
export function nameToSave(input: string, settings: IdentitySettings): string | null {
  const name = input.trim();
  return validName(name, settings) ? name : null;
}

export function createIdentityStore(storage: KeyValueStorage, settings: IdentitySettings, keys: IdentityKeys = DEFAULT_KEYS) {
  return {
    name(): string {
      return storage.getItem(keys.name) ?? "";
    },
    // Returns the saved name, or null when it was not acceptable (nothing is stored then).
    setName(input: string): string | null {
      const name = nameToSave(input, settings);
      if (name !== null) storage.setItem(keys.name, name);
      return name;
    },
    session(slot: string): Session | null {
      const k = keys.slots[slot];
      const token = storage.getItem(k.token);
      const roomId = storage.getItem(k.room);
      return token && roomId ? { token, roomId } : null;
    },
    saveSession(slot: string, session: Session) {
      const k = keys.slots[slot];
      storage.setItem(k.token, session.token);
      storage.setItem(k.room, session.roomId);
    },
    // A token the server no longer knows, or leaving: forget the seat but keep the name.
    clearSession(slot: string) {
      const k = keys.slots[slot];
      storage.removeItem(k.token);
      storage.removeItem(k.room);
    },
    // The server rotated the token: keep the new one for the same room.
    replaceToken(slot: string, token: string) {
      storage.setItem(keys.slots[slot].token, token);
    },
  };
}
