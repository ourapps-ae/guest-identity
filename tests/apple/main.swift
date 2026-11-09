import Foundation

func check(_ condition: Bool, _ message: String) {
    if !condition { FileHandle.standardError.write(Data("FAILED: \(message)\n".utf8)); exit(1) }
}

final class MemoryStore: KeyValueStore {
    var data: [String: String] = [:]
    func string(forKey key: String) -> String? { data[key] }
    func set(_ value: String?, forKey key: String) { data[key] = value }
}

let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: "tests/fixtures/names.json"))) as! [String: Any]
var count = 0
for set in fixture["sets"] as! [[String: Any]] {
    let r = set["rules"] as! [String: Int]
    let rules = NameRules(minLength: r["min"]!, maxLength: r["max"]!)
    for row in set["cases"] as! [[Any]] {
        check(rules.isValid(row[0] as! String) == (row[1] as! Bool), "valid \(row)")
        count += 1
    }
}
let clip = fixture["clip"] as! [String: Any]
check(NameRules(minLength: 1, maxLength: clip["max"] as! Int).clip(clip["input"] as! String) == (clip["output"] as! String), "clip")
for row in fixture["save"] as! [[Any]] {
    check(NameRules().nameToSave(row[0] as! String) == (row[1] as? String), "save \(row)")
    count += 1
}

let memory = MemoryStore()
let store = IdentityStore(store: memory, rules: NameRules())
check(store.name == "", "no name yet")
check(store.setName("   ") == nil, "blank refused")
check(store.setName(" Ann ") == "Ann" && store.name == "Ann", "name saved trimmed")
check(store.session("player") == nil, "no session yet")
store.saveSession("player", IdentitySession(token: "t1", roomId: "r1"))
store.saveSession("display", IdentitySession(token: "t2", roomId: "r2"))
check(store.session("player") == IdentitySession(token: "t1", roomId: "r1"), "player session")
store.replaceToken("player", "t9")
check(store.session("player") == IdentitySession(token: "t9", roomId: "r1"), "token replaced")
store.clearSession("player")
check(store.session("player") == nil && store.session("display")?.token == "t2" && store.name == "Ann", "cleared one slot only")
check(memory.data["boardToken"] == "t2", "slot keys match the recipe's")
print("\(count + 11) identity assertions passed")
