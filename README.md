# Omnitrix Arena — Next.js + Firebase starter

This migrates the browser prototype into a Next.js App Router project. It includes Firebase environment configuration, anonymous Firebase Authentication, a realtime Firestore lobby, room codes, 2/3/4-player room capacity, a responsive card UI, and a Firestore rules starter. The old HTML prototype is retained at `public/legacy-prototype.html`.

## Requirements
- Node.js 20.9+ (Node 22 recommended)
- A Firebase project

## Run locally
1. Copy `.env.example` to `.env.local`.
2. Fill the Firebase Web App config values from Firebase Console → Project settings → Your apps.
3. In Firebase Console, enable **Authentication → Sign-in method → Anonymous**.
4. Create a **Cloud Firestore** database.
5. Install and run:
   ```bash
   npm install
   npm run dev
   ```
6. Open http://localhost:3000.

To deploy the included rules with Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
firebase deploy --only firestore:rules
```

## Environment variables and secrets
- `.env.local` is ignored by git; never commit it.
- `NEXT_PUBLIC_FIREBASE_*` variables are intentionally browser-visible because the Firebase Web SDK runs in the browser. They are not admin credentials. Firebase security depends on Authentication, Firestore/Storage Rules, App Check, and server-side authorization—not hiding the web config.
- Never put a Firebase Admin service-account JSON/private key in a `NEXT_PUBLIC_*` variable. If server-side admin operations are added later, use server-only environment variables such as `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, or a hosting provider's service identity/secret manager.

## Image library
The `alienImages` collection is reserved for name-to-image URL records. Suggested document:
```json
{ "name": "Four Arms", "imageUrl": "https://...", "updatedAt": "server timestamp" }
```
Use Firebase Storage for image files and Firestore for metadata/URLs. If the spreadsheet contains third-party image URLs, verify you have permission to use them.

## Multiplayer status / important limitation
This starter implements realtime room creation/joining and a 2–4 player lobby. The card area is a UI prototype; it does **not** yet implement a production-safe server-authoritative multiplayer match engine. Do not publish competitive matches with client-trusted scores. For a robust release, move deck draws, card ownership, turn validation, stat comparison, score updates, timeouts, and anti-cheat validation into trusted Cloud Functions (or another server). Store each player's unrevealed card privately; only publish the chosen stat/result and reveal payload after the round resolves. Add App Check, stronger role-based admin rules for `alienImages`, rate limits, and automated rule tests before launch.

## Data model direction
- `rooms/{roomCode}`: room status, host, capacity, player IDs/names, current round.
- `rooms/{roomCode}/privateHands/{uid}`: server-only/unrevealed hand data (never readable by other players).
- `rooms/{roomCode}/moves/{round_playerUid}`: submitted stat selection, validated by server.
- `rooms/{roomCode}/publicRounds/{round}`: resolved public results and revealed cards.
- `alienImages/{slug}`: character name, image URL/storage path, stat data, updated timestamp.

**Do not use broad public write rules in production.** Review `firestore.rules` carefully; it is a starter rule set, not a complete anti-cheat policy.

## Latest update: hydration-safe UI and battle animations

- The first render now shows the same initialization panel on the server and browser. Firebase setup/game UI is selected only after the component mounts, avoiding the reported server `hero` vs client `setup` tree mismatch.
- Added an animated local battle result: fighters lunge, the losing alien recoils, the winner gets a glow/victory pose, and the result banner shows the selected stat comparison.
- The battle animation is currently a local visual demo. It does not award authoritative online multiplayer points; implement a trusted server-side round resolver before public competitive play.
- Animations respect `prefers-reduced-motion`.


## Firebase environment variables

A configured `.env.local` file is included for the Firebase project details supplied during setup. Keep it local and do not commit it to source control. If you change `.env.local`, stop and restart `npm run dev` because Next.js reads environment variables at server startup. The Firebase client reads each `process.env.NEXT_PUBLIC_*` variable directly so Next.js can inline values into the browser bundle.

## Updated character deck and VS Computer
- Bundled `data/characters.json` contains all 23 name/image URL rows from the supplied spreadsheet. The app uses this catalog immediately, so no Firestore import is required just to play VS Computer.
- Character artwork is loaded directly from the provided external URLs. If WikiHow blocks hotlinking or a URL changes, the browser cannot force that host to serve it; the UI falls back to a character marker. For reliable production images, upload permitted image files to Firebase Storage and store those download URLs in `alienImages`.
- If Firestore `alienImages` documents exist with `name` or `characterName` and `imageUrl` fields, the app listens to that collection and merges matching URLs/stats with the bundled catalog.
- The spreadsheet's skill values were blank. The starter assigns clearly provisional, deterministic demo values so the VS Computer round can be played; replace these with your chosen balancing data before launch.
- VS Computer battle is a local practice mode. Online lobby sync exists as a starter, but authoritative multiplayer battle resolution is not yet implemented.

## Multiplayer + CPU update

- Multiplayer rooms now show each player's Ready state in real time. The host's Start Game button remains disabled until at least two players are in the room and every player is ready.
- Players choose an alien before readying. The active player chooses a stat for each shared round; scores and round results are written to Firestore so connected clients see the same match state. The match runs for five rounds.
- VS Computer is a five-round local game with score tracking and a rematch button.
- Character artwork uses an Omnitrix-style scan/loading animation and reveals the image smoothly when the image loads. Failed images fall back to the alien emoji.

### Setup reminder

Enable Firebase Anonymous Authentication and deploy `firestore.rules`. The included client-side Firestore rules are suitable only as a starter; for a public competitive game, move round resolution and score updates to trusted Cloud Functions and tighten write permissions so clients cannot forge scores.


## Updated standalone card-game prototype (2026-10-26)

- `public/updated-card-game.html` and `public/legacy-prototype.html` now contain the latest standalone mode-selection/card-animation prototype.
- After `npm run dev`, open `http://localhost:3000/updated-card-game.html` to inspect that prototype.
- The Next.js app at `/` remains the main app and keeps its existing Firebase/room/game code.
- Important: this HTML prototype's multiplayer controls are a lobby-flow prototype, not a complete synchronized multiplayer battle. The Next.js app's realtime battle flow should be used for the integrated app; test it with two browser sessions and your Firebase project before deploying.


## Dedicated mode screens update
- `/` is now a dedicated mode chooser with two large cards.
- `/computer` opens the VS Computer screen only, with the card, stats, score, round, and result kept together.
- `/multiplayer` opens the multiplayer room/lobby and live-match screen only.
- Both gameplay routes include a Back to Modes link. Responsive styles reduce scrolling and prioritize fitting the battle UI to the viewport.
- This is a UI/routing update; it does not remove Firebase setup requirements or turn the client-side multiplayer starter into a server-authoritative game.
