import Foundation

// The rules for a guest's name, as the server applies them.
public struct NameRules: Equatable {
    var minLength = 1
    var maxLength = 20

    // Printable ASCII, no space at either end, within the limits.
    func isValid(_ name: String) -> Bool {
        let scalars = name.unicodeScalars
        return name.count >= minLength && name.count <= maxLength
            && scalars.allSatisfy { $0.value >= 0x20 && $0.value <= 0x7E }
            && name == name.trimmingCharacters(in: .whitespaces)
            && !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // Typing stops at the longest name allowed.
    func clip(_ input: String) -> String { String(input.prefix(maxLength)) }

    // What the save button needs: the trimmed name, or nil while it is not yet acceptable.
    func nameToSave(_ input: String) -> String? {
        let name = input.trimmingCharacters(in: .whitespaces)
        return isValid(name) ? name : nil
    }
}

protocol KeyValueStore {
    func string(forKey key: String) -> String?
    func set(_ value: String?, forKey key: String)
}

extension UserDefaults: KeyValueStore {
    func set(_ value: String?, forKey key: String) { set(value as Any?, forKey: key) }
}

struct IdentitySession: Equatable {
    let token: String
    let roomId: String
}

struct IdentityKeys {
    var name = "name"
    var slots: [String: (token: String, room: String)] = ["player": ("token", "roomId"), "display": ("boardToken", "boardRoomId")]
}

// What a device keeps of who it is: the typed name and, per slot, the private token and its room.
public struct IdentityStore {
    let store: KeyValueStore
    let rules: NameRules
    var keys = IdentityKeys()

    var name: String { store.string(forKey: keys.name) ?? "" }

    @discardableResult
    func setName(_ input: String) -> String? {
        guard let name = rules.nameToSave(input) else { return nil }
        store.set(name, forKey: keys.name)
        return name
    }

    func session(_ slot: String) -> IdentitySession? {
        guard let k = keys.slots[slot], let token = store.string(forKey: k.token), let room = store.string(forKey: k.room), !token.isEmpty, !room.isEmpty else { return nil }
        return IdentitySession(token: token, roomId: room)
    }

    func saveSession(_ slot: String, _ session: IdentitySession) {
        guard let k = keys.slots[slot] else { return }
        store.set(session.token, forKey: k.token)
        store.set(session.roomId, forKey: k.room)
    }

    // A token the server no longer knows, or leaving: forget the seat but keep the name.
    func clearSession(_ slot: String) {
        guard let k = keys.slots[slot] else { return }
        store.set(nil, forKey: k.token)
        store.set(nil, forKey: k.room)
    }

    // The server rotated the token: keep the new one.
    func replaceToken(_ slot: String, _ token: String) {
        guard let k = keys.slots[slot] else { return }
        store.set(token, forKey: k.token)
    }
}
