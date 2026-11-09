import ae.identity.IdentitySession
import ae.identity.IdentityStore
import ae.identity.KeyValueStore
import ae.identity.NameRules

class MemoryStore : KeyValueStore {
    val data = mutableMapOf<String, String>()
    override fun get(key: String): String? = data[key]
    override fun put(key: String, value: String) { data[key] = value }
    override fun remove(key: String) { data.remove(key) }
}

// The cases of tests/fixtures/names.json, written out so no JSON library is needed.
fun main() {
    val standard = NameRules(1, 20)
    for (name in listOf("Ann", "A", "Mary-Jane O'Neil", "12345678901234567890")) check(standard.isValid(name)) { name }
    for (name in listOf("123456789012345678901", "", " ", " Ann", "Ann ", "Zo\u00eb", "tab\there", "Ann\n", "\ud83d\ude00")) check(!standard.isValid(name)) { name }
    val short = NameRules(3, 8)
    for (name in listOf("Alf", "Alfred12", "A b")) check(short.isValid(name)) { name }
    for (name in listOf("Al", "Alfred123")) check(!short.isValid(name)) { name }
    check(NameRules(1, 5).clip("Abcdefgh") == "Abcde")
    check(standard.nameToSave("  Ann  ") == "Ann")
    for (input in listOf("   ", "Zo\u00eb", "")) check(standard.nameToSave(input) == null) { input }

    val memory = MemoryStore()
    val store = IdentityStore(memory, standard)
    check(store.name == "")
    check(store.setName("   ") == null)
    check(store.setName(" Ann ") == "Ann" && store.name == "Ann")
    check(store.session("player") == null)
    store.saveSession("player", IdentitySession("t1", "r1"))
    store.saveSession("display", IdentitySession("t2", "r2"))
    check(store.session("player") == IdentitySession("t1", "r1"))
    store.replaceToken("player", "t9")
    check(store.session("player") == IdentitySession("t9", "r1"))
    store.clearSession("player")
    check(store.session("player") == null && store.session("display")?.token == "t2" && store.name == "Ann")
    check(memory.data["boardToken"] == "t2")
    println("identity assertions passed")
}
