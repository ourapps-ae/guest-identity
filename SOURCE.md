# Source mapping

Reference revision: `19905b75dbea89fbfd424d67fe26c81aaed0e018`. Paths are under `OurPoker/recipe/` unless they start with `components/`.

## Files

- `implementation/server/identity.ts` <-
  - `validName`, `checkName`: `server/src/engine.ts` lines 179-181 (`/^[\x20-\x7E]{1,20}$/` on the trimmed name, and trimmed equals given). The fixed 1 and 20 become `nameMinLength` and `nameMaxLength`.
  - `claim`: `components/realtime-rooms/implementation/server/index.ts` lines 87-107 (rejoin by exact name finds the same id; `dropTokens` cancels the old tokens; `crypto.randomUUID()` issues the new one) and line 86 (`dropTokens`). Identity and token handling are separated from the room and game: the id and token come from injected `newId` and `newToken`.
  - `authenticate`: same file lines 75-80 (token to id). Time-based rotation (`tokenRotationSeconds`, `previousToken`, `rotatedToken`), `release`, `exportAll`, `importAll`, `recordDigest` and the record schema are new (`generated-platform`): the recipe replaces a token only when the name is claimed again and keeps tokens in the room record, not in a separate book.
  - Left behind: the room record (`tokens`, `spectators`, `displays` in `index.ts` line 12), display (table viewer) tokens, spectator ids, and the HTTP routes. Tokens are stored as issued, as in the recipe.
- `implementation/web/identity-store.ts` <- `web/src/store.ts` lines 47-58 (reading name, token and room id per mode from local storage), 147-151 (`setName`), 162-163 and 199-200 (saving token and room), 268-269 (forgetting them on sign-out), and `web/src/screens.ts` lines 21-22 (`maxlength` 20 and trimmed non-empty save). Generalised: storage is injected, the two modes become slots with key names, limits come from settings, `replaceToken` is new for rotation.
- `implementation/apple/Sources/GuestIdentity.swift` <- `ios/OurPoker/Sources/NameScreen.swift` lines 20 and 24-26 (limit and non-blank save), `TableModel.swift` lines 12-18, 204, 221-223 and 271-273 (name, token and room id in `UserDefaults`). The REST join in `TableClient.swift` lines 34-40 stays in the application's client. Generalised: `UserDefaults` sits behind `KeyValueStore`; the limits are `NameRules` fields.
- `implementation/android/src/main/java/ae/identity/GuestIdentity.kt` <- `android/app/src/main/java/app/ourapps/ourpoker/ui/NameScreen.kt` lines 51 and 57, `TableViewModel.kt` lines 85, 281, 291, 394 and 419 (name, token and room id in `SharedPreferences`). The REST join in `net/TableClient.kt` lines 49-53 stays in the application. Not compiled on the authoring machine (no kotlinc).

## Left behind in the recipe

- The name screen layout and text, the REST clients, the room and game state, the display (table viewer) join, video grants issued at join.
- The recipe's name rule is exact-match and ASCII only; this component keeps both on purpose.
- `createIdentityApi`, `validateSettings` (`generated-adapter`, in `implementation/server/identity.ts`): written to `components/seating/interfaces/required/guest-identity.json` (`validName(name)`). The recipe checked names with the constants `NAME_MIN` and `NAME_MAX`; the bound form carries the installed limits instead.
- The room-facing calls (`claim` with a caller-supplied `newId`, `authenticate` with `rotatedToken`, `release`) are `createIdentityApi` operations; they match the room's token handling in the frozen `server/src/room.ts` lines 120-135 (token per join, replaced on rejoin, dropped on leave), with rotation. `tests/web.test.ts` has a test of exactly these calls.
