# Guest identity instructions

## For the agent
Select this component for any application where people take part without accounts. Set the three settings from the application's name length limits and how often tokens should change. Connect the provided `guest-identity` to presence, seating and the room server. Do not use it where real account security is needed. realtime-rooms requires this interface: connect `guest-identity` to its `guest-identity` port, and have the server pass `createIdentityApi(settings)` as `services.identity`.

- Select package `ourapps-ae/guest-identity` version `0.5.0`.
- Settings to configure:
  - `nameMinLength` (integer; optional; default `1`)
  - `nameMaxLength` (integer; optional; default `20`)
  - `tokenRotationSeconds` (integer; optional; default `0`)
- Connect the provided `guest-identity` (ae/guest-identity 1.0.0) to the consumer that needs it.
- No accounts or keys are needed.

## For the developer
Store the `IdentityBook` where the room keeps its state and persist it after each `claim` or rotating `authenticate`. Supply `now`, `newId` and `newToken` (for example `crypto.randomUUID`). On each device keep the returned token with the room id and send it as a bearer token. No accounts or keys are needed. To move identities to another store, use `exportAll` and `importAll`.

## How to check
From the component directory:

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)
- `python3 tests/native.py apple` (apple, platform; tools: python3 3.12.8, swiftc 6.4.2)
- `python3 tests/native.py android` (android, platform; tools: python3 3.12.8, kotlinc 2.2.0, java 26.0.1)
- `python3.12 -B /Users/george/Projects/com/my/tools/check_component.py components/guest-identity` validates the manifest, sidecars and runs the required-local suite.
