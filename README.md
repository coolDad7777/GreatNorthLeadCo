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

## Deploying to AWS

The frontend is a static site; PocketBase is a separate service. Deploy the backend first so you have its HTTPS URL before building the frontend.

### 1. Run PocketBase on Lightsail

1. Create an Ubuntu Lightsail instance and attach a static IP. Add firewall rules for HTTP (80) and HTTPS (443); restrict SSH (22) to your own IP. Point a DNS name such as `api.example.com` at the static IP.
2. Install PocketBase and Caddy on the instance. Keep the PocketBase binary and this repository's `pb_migrations/` directory together (for example, in `/opt/pocketbase/`). Store its data in a persistent directory such as `/var/lib/pocketbase/`.
3. Run PocketBase as a dedicated, unprivileged system user, bound to localhost, and configure it as a `systemd` service so it starts on boot. For example, the service command can be:

   ```sh
   /opt/pocketbase/pocketbase serve --http=127.0.0.1:8090 --dir=/var/lib/pocketbase
   ```

   Set the service working directory to `/opt/pocketbase`; PocketBase applies migrations from `pb_migrations/` there on startup.
4. Configure Caddy to provide HTTPS and proxy the API to PocketBase. This example also blocks the public admin UI; administer PocketBase through an SSH tunnel to port 8090 instead.

   ```caddy
   api.example.com {
       @admin path /_/*
       respond @admin "Not Found" 404
       reverse_proxy 127.0.0.1:8090
   }
   ```

   To access the admin UI, run `ssh -L 8090:127.0.0.1:8090 ubuntu@api.example.com` from your computer and open `http://127.0.0.1:8090/_/`.
5. Create the first superuser using PocketBase's CLI, then verify the collections and per-user access rules from `pb_migrations/`. Configure SMTP for account emails/password resets. Enable Lightsail snapshots and arrange regular off-instance backups of PocketBase's data directory; test restoring a backup before relying on it.

### 2. Host the frontend on Amplify

1. Connect this GitHub repository in AWS Amplify Hosting and select the `main` branch after the deployment-readiness PR is merged. Amplify reads `amplify.yml` for `npm ci`, `npm run build`, and the `dist` output directory.
2. In the Amplify app's environment variables, set `VITE_POCKETBASE_URL` to the PocketBase HTTPS URL (for example, `https://api.example.com`). Vite embeds this value at build time, so redeploy after changing it. It is a public URL, not a secret.
3. In Amplify's redirects/rewrites settings, add an SPA rewrite from `/<*>` to `/index.html` with status `200`.
4. After deployment, test sign-up/sign-in, creating a lead and logging a call. Also test with a second user to confirm they cannot read or modify the first user's records. Use HTTPS for the app and API.
