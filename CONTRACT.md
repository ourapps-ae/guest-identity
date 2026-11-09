# Guest identity component

## Purpose and facilities
`guest-identity` lets people take part with only a typed name. A name belongs to one identity record. Claiming a name returns a private bearer token and cancels the previous one, so a guest can return from any device by typing the same name and the newest device holds the seat. Tokens can rotate after a set time. The component also keeps, on each device, the typed name and the token and room of each slot (a player's seat, a table viewer) so the application can reconnect after a restart.

Facilities: `guest-identity` (Guest names, private tokens, rotation and device-side storage of who you are).

## User inputs
Three settings. `nameMinLength` (default 1) and `nameMaxLength` (default 20) bound a name, which must be printable ASCII with no space at either end. `tokenRotationSeconds` (default 0) is how long a token lives before the next authenticated request swaps it; 0 turns rotation off so a token lasts until the name is claimed again. The replaced token keeps working for one further rotation period so a device that missed the reply can catch up.

- `nameMinLength` (integer; optional; default `1`)
- `nameMaxLength` (integer; optional; default `20`)
- `tokenRotationSeconds` (integer; optional; default `0`)

## Artefacts and dependencies
`component.json` maps every `implementation/` source into `components/guest-identity/`:

- `implementation/android/src/main/java/ae/identity/GuestIdentity.kt` -> `components/guest-identity/android/src/main/java/ae/identity/GuestIdentity.kt`
- `implementation/apple/Sources/GuestIdentity.swift` -> `components/guest-identity/apple/Sources/GuestIdentity.swift`
- `implementation/server/identity.ts` -> `components/guest-identity/server/identity.ts`
- `implementation/web/identity-store.ts` -> `components/guest-identity/web/identity-store.ts`

Dependencies: none.
`tools.lock.json` pins verification tools: node 26.5.0, python3 3.12.8, swiftc 6.4.2, kotlinc 2.2.0, java 26.0.1. Licence wording remains deferred.

## Provided interfaces
- `interfaces/guest-identity.json` defines `guest-identity` (ae/guest-identity) version 1.0.0.

## Required interfaces
None.

## Integration
Server: `createIdentityApi(settings)` binds the three settings once and gives `validName(name)`, `checkName`, `claim(book, name, deps)`, `authenticate(book, token, deps)`, `findByName` and `release`; seating calls its `validName` with one argument. Keep an `IdentityBook` in the room's storage; on a join request call `claim(book, name, deps, settings)` and return the token; on every later request call `authenticate` and send back `rotatedToken` when it is not null. Web: `createIdentityStore(localStorage, settings)` keeps the name and sessions; `clipName` and `nameToSave` serve the name field. Apple and Android: `NameRules` and `IdentityStore` over `UserDefaults` or `SharedPreferences` (behind the small `KeyValueStore` interface). `examples/consumer.ts` shows two devices claiming one name. realtime-rooms takes `createIdentityApi(settings)` as its required `guest-identity` port (`services.identity`): each room keeps one `IdentityBook` in its own storage and calls `claim` on a join (offering the id the game already holds for that name as `newId`), `authenticate` on every request and live message (sending `rotatedToken` to the device as the `x-rotated-token` header or a `{type:"token"}` message), and `release` when a guest leaves. The presence component uses the identity ids this component issues.

## Visual definition and connected examples
`visual/definition.json` maps its ports to the provided and required interfaces. `visual/examples/connected.json` connects the component to an illustrative application consumer. Both image formats and a text description are in `visual/output/`.

## Infrastructure
No service. The identity book is plain data held by the caller (the room's own storage in the recipe). Tokens are stored as issued, as in the recipe, so the storage must be private to the server.

## Verification
Required-local: `node --test tests/web.test.ts` checks the name rules against `tests/fixtures/names.json`, claim and return from another device, token cancellation, rotation and the one-period catch-up, release, ndjson export and import with a record digest, the bound `validName` against the same fixture, the bound claim and authenticate, the calls a room makes (a known id offered by the room is kept for a new name, a rejoin returns the same id and ends the old token, release frees the name, a rotated token is returned without changing the book given), settings checks, the device store and the example. Platform: `python3 tests/native.py apple` compiles and runs the Swift checks of the same fixture; `python3 tests/native.py android` compiles the Kotlin checks (needs kotlinc, not installed on the authoring machine, so not run there).

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)
- `python3 tests/native.py apple` (apple, platform; tools: python3 3.12.8, swiftc 6.4.2)
- `python3 tests/native.py android` (android, platform; tools: python3 3.12.8, kotlinc 2.2.0, java 26.0.1)

## Scenarios and presentation
Ann joins on a phone and closes the app; the app reopens and reconnects with the saved token. Ann types the same name on a laptop: it is the same guest, and the phone's token stops working. With rotation set to 60 seconds, a phone that was asleep during a rotation presents the old token within a minute and is handed the new one. Typing a name with a leading space or an accented letter is refused.

## Updates and removal
Patch updates replace files. Identity records are data: `migration.json` describes export to ndjson, import, verification by record digest and the record schema `ae/identity-record` 1.0.0. A name is not a secret, so anyone who types a name takes that identity; applications that need more must add their own check. realtime-rooms requires this interface as `guest-identity` and calls `claim`, `authenticate` and `release` of `createIdentityApi`; `tests/web.test.ts` has a test of exactly those calls.
