package ae.identity

// The rules for a guest's name, as the server applies them.
data class NameRules(val minLength: Int = 1, val maxLength: Int = 20) {
    // Printable ASCII, no space at either end, within the limits.
    fun isValid(name: String): Boolean =
        name.length in minLength..maxLength && name.all { it.code in 0x20..0x7E } && name == name.trim() && name.trim().isNotEmpty()

    // Typing stops at the longest name allowed.
    fun clip(input: String): String = input.take(maxLength)

    // What the save button needs: the trimmed name, or null while it is not yet acceptable.
    fun nameToSave(input: String): String? = input.trim().takeIf { isValid(it) }
}

// SharedPreferences in the application: getString(key, null), putString/remove through edit().
interface KeyValueStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
    fun remove(key: String)
}

data class IdentitySession(val token: String, val roomId: String)

data class SlotKeys(val token: String, val room: String)

val defaultSlots: Map<String, SlotKeys> = mapOf("player" to SlotKeys("token", "roomId"), "display" to SlotKeys("boardToken", "boardRoomId"))

// What a device keeps of who it is: the typed name and, per slot, the private token and its room.
class IdentityStore(
    private val store: KeyValueStore,
    private val rules: NameRules,
    private val nameKey: String = "name",
    private val slots: Map<String, SlotKeys> = defaultSlots,
) {
    val name: String get() = store.get(nameKey) ?: ""

    fun setName(input: String): String? = rules.nameToSave(input)?.also { store.put(nameKey, it) }

    fun session(slot: String): IdentitySession? {
        val keys = slots[slot] ?: return null
        val token = store.get(keys.token)
        val room = store.get(keys.room)
        return if (!token.isNullOrEmpty() && !room.isNullOrEmpty()) IdentitySession(token, room) else null
    }

    fun saveSession(slot: String, session: IdentitySession) {
        val keys = slots[slot] ?: return
        store.put(keys.token, session.token)
        store.put(keys.room, session.roomId)
    }

    // A token the server no longer knows, or leaving: forget the seat but keep the name.
    fun clearSession(slot: String) {
        val keys = slots[slot] ?: return
        store.remove(keys.token)
        store.remove(keys.room)
    }

    // The server rotated the token: keep the new one.
    fun replaceToken(slot: String, token: String) {
        slots[slot]?.let { store.put(it.token, token) }
    }
}
