North Lead Connect
PocketBase + React app for tracking general-contractor outreach: add leads, log calls, keep next actions visible, and view recent activity.
Setup

Install deps and set env:
npm install
cp .env.example .env.local

Edit .env.local with your PocketBase URL, e.g. http://127.0.0.1:8090.
Run PocketBase (separate process):

Download the PocketBase binary (https://pocketbase.io/), run ./pocketbase serve (or ./pocketbase serve --http="0.0.0.0:8090").
In the admin UI (http://127.0.0.1:8090/_/):
Ensure the users auth collection exists (default). Create a user for yourself (email/password).
Create a leads collection with fields: owner (relation to users), company (text, required), contact_name (text), trade (text), phone (text), email (email), status (text), next_action (date), last_outcome (text), notes (text). Rules:
List/View/Update: owner = @request.auth.id
Create: @request.data.owner = @request.auth.id
Create a call_logs collection with fields: owner (relation to users), lead (relation to leads), outcome (text, required), notes (text), next_action (date). Rules:
List/View: owner = @request.auth.id
Create: @request.data.owner = @request.auth.id
Keep the PocketBase server running.

Start the app:
npm run dev

Open http://localhost:8080, sign in with your PocketBase email/password (or create an account via the UI), then add leads and log calls.
Scripts

npm run dev
npm run build
What it does

Lead intake: capture company/contact/trade, status, next action, and notes.
Call logging: attach outcome/notes/next action to a lead; updates pipeline view and recent calls.
Auth + per-user data: PocketBase email/password; rows scoped to the logged-in user via collection rules.
Pipeline view: status pills, next-action dates, and recent call activity. Powered by PocketBase + React Query for persistence and caching.
Notes

.env.local is ignored by git.
If you change the PocketBase URL, update .env.local and restart the dev server.
