# Deploying the Kaotic Gaming site with Docker

The site is live at **https://kaotic.strictgaming.com**, the Kaotic section of
[Strict Gaming](https://strictgaming.com) (a Minecraft and game-server community). Strict Gaming's
server runs it with Docker (Portainer), built straight from this GitHub repo: every push to `main`
redeploys it automatically.

It's a single container: a small Node.js server (no npm packages) with a built-in SQLite database.
Everything the site stores (accounts, saves, stats, error reports, purchases, and the downloaded
games) is in one Docker volume mounted at `/data`. The games come from their own GitHub repos
(`games.json` → `source`) and are checked for new commits every few minutes.

## Quick start

```bash
git clone https://github.com/EliteScouter/kaotic-gaming.git
cd kaotic-gaming
cp .env.example .env          # then edit .env (see below)
docker compose up -d --build
```

The site listens on port **8088** (change with `SITE_PORT` in `.env`).
Check it: `curl http://localhost:8088/healthz` → `{"ok":true}`.

## Settings (`.env`)

| Variable | Default | What it does |
|---|---|---|
| `SITE_PORT` | `8088` | Port on the server the site is published on. |
| `TRUST_PROXY` | `1` | `1` when a reverse proxy or Cloudflare Tunnel is in front: the site then reads the visitor's real IP (`CF-Connecting-IP` / `X-Forwarded-For`) for rate limits, and `X-Forwarded-Proto` to mark login cookies Secure. Set `0` if the container is exposed directly. |
| `KG_ADMIN_USER` / `KG_ADMIN_PASSWORD` | empty | Creates the first admin account on a start where no admin exists. Password: 8+ characters. Remove the password from `.env` afterwards. |
| `GITHUB_TOKEN` | empty | Lets the site download games from **private** GitHub repos: a classic token with the `repo` scope, or a fine-grained token with read access to those repos. Public game repos don't need it. |
| `GAME_SYNC_MINUTES` | `5` | How often the site checks the games' repos for new commits. |
| `TUNNEL_TOKEN` | empty | Only for the optional Cloudflare Tunnel container. |
| `PAYPAL_ENV` | `sandbox` | `sandbox` (test money) or `live` (real money) for the 99¢ Supporter Pack. See [Taking payments](#taking-payments-the-99-supporter-pack). |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | empty | The PayPal app's keys for that mode. Empty = the shop is off. |
| `PAYPAL_WEBHOOK_ID` | empty | The ID of the webhook on that PayPal app. Required for live. |
| `PAYPAL_TESTERS` | empty | Usernames (comma separated) who may buy while in sandbox, besides admins. Only list accounts that already exist (anyone could register an unused name); the log warns about unknown ones. |

## The first admin account

Either set `KG_ADMIN_USER` / `KG_ADMIN_PASSWORD` before the first start, or run:

```bash
docker compose exec site node server.js create-admin <username>
```

It asks for the password (or reads `KG_ADMIN_PASSWORD`). The same command makes an existing
account an admin. The admin dashboard is at `/admin`.

(The `/setup` page only works for a browser on the same machine as the server, so in Docker use one of the two ways above.)

## Putting it on the web address

The address is **kaotic.strictgaming.com**, a subdomain of Strict Gaming's `strictgaming.com`, so it's set up
by whoever manages strictgaming.com's DNS and proxy. Point that hostname at the container's port 8088 in
one of these ways:

**Option A: Cloudflare Tunnel (no open ports).** strictgaming.com is on Cloudflare.

1. In the Cloudflare account that owns **strictgaming.com**: Zero Trust → Networks → Tunnels → Create a tunnel (Cloudflared).
   The tunnel must be in the **same account as the domain**, or the domain won't appear in the route settings.
2. Copy the token from the install command into `TUNNEL_TOKEN` in `.env`.
3. Add a **published application route** (not a "hostname route"): `kaotic.strictgaming.com` → `http://site:8088`.
4. `docker compose --profile tunnel up -d --build`

**Option B: a reverse proxy** (nginx, Traefik, Caddy) with HTTPS for `kaotic.strictgaming.com`, forwarding to
`localhost:8088`. Pass the usual headers; for nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8088;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Taking payments (the 99¢ Supporter Pack)

Players can buy the **Supporter Pack** for 99¢: an exclusive outfit in Last Stand plus a ♥ supporter
badge on the high scores. It's paid through **PayPal** (PayPal account, Venmo, or a debit/credit card),
the money lands in your PayPal Business balance, and you move it to your bank. The site never sees card
details. The server sets the price, collects the payment itself and only unlocks the pack once PayPal
confirms it; refunds and chargebacks take it back.

### 1. A PayPal Business account

Real money needs a **Business** account. If you have a personal one, upgrade it for free: paypal.com >
Settings > Account Options > *Upgrade to a Business Account* (no monthly fee; a sole proprietor can use
their own name). Heads-up: upgrading closes the personal balance's account and routing numbers. Make sure
the account is verified and its main currency is **USD**, or payments can sit as "pending".

### 2. Ask PayPal for micropayments pricing (do this)

| PayPal pricing (US) | Fee on a 99¢ sale | You keep |
|---|---|---|
| Standard: 3.49% + $0.49 | about $0.52 | **about $0.47** |
| Micropayments: 4.99% + $0.09 | about $0.14 | **about $0.85** |

Micropayments pricing is not on by default: contact PayPal support and ask for **"dynamic micropayments"**
pricing on your Business account (it can take up to 2 business days). The admin page's **Purchases** tab shows
the real fee PayPal took on each sale, so you'll see when it's active.

### 3. Keys and webhook (start in sandbox: test money)

1. Sign in at **developer.paypal.com** with the business account. Go to **Apps & Credentials**, keep the toggle
   on **Sandbox**, and open the *Default Application* (or *Create App*, type **Merchant**). Copy the
   **Client ID** and **Secret**.
2. In that app, under **Sandbox Webhooks**, choose *Add Webhook*: URL `https://kaotic.strictgaming.com/api/paypal/webhook`,
   events *Payment capture completed, pending, denied, declined, refunded, reversed* (or *All events*). Save,
   then copy the **Webhook ID** shown for it.
3. Put them in `.env` (or the Portainer stack's environment) and redeploy:
   ```
   PAYPAL_ENV=sandbox
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   PAYPAL_WEBHOOK_ID=...
   ```
   The log then says `Shop is on: PayPal sandbox (test money; only admins can buy)`. Keep the secret out of git
   and out of chat; it only ever goes in the server's environment.

### 4. Test it with fake money

In sandbox mode only **admins** (and anyone listed in `PAYPAL_TESTERS`) see the 99¢ buttons; regular players
don't see the shop at all. Sign in to the site as admin, open **kaotic.strictgaming.com/shop**, and pay with PayPal's
test **buyer**: developer.paypal.com > Testing Tools > **Sandbox Accounts** > the *Personal* account >
View/Edit Account shows its email and password. Then check:

- the thank-you screen, the outfit in Last Stand's Store under Clothes, and the ♥ by your name on the high
  scores (in test mode only the buyer sees their own ♥; the public never sees test-money badges);
- the sale in the admin page's **Purchases** tab;
- a refund: sign in at **www.sandbox.paypal.com** as the sandbox *Business* account, open the payment, refund it.
  Within about a minute the pack and badge go away (or click *Re-check with PayPal now* on the Purchases tab).

### 5. Go live (real money)

On developer.paypal.com switch the toggle to **Live**, open (or create) the app there, copy the **live** Client
ID and Secret, and add a **live** webhook (same URL and events) to get its live Webhook ID. Set all four values
with `PAYPAL_ENV=live` and redeploy. The log must say `Shop is on: PayPal live (REAL money)`. Live mode refuses
to start the shop without the webhook ID (that's what takes the pack back on refunds), and test-money purchases
never carry over: the live shop starts clean.

### 6. Getting the money to your bank

On paypal.com: **Wallet** > *Link a bank* (instantly with your bank login, or by hand with two small test
deposits). Then **Transfer Money** > *Transfer to your bank*: Standard is free (1–3 business days), Instant
costs 1.5%. Or set it and forget it: Finance > Money > More Actions > **Set Up Auto Transfers** (daily or
weekly). PayPal may hold a new seller's payments for up to 21 days before they can be moved.

### 7. Refunds, chargebacks and records

- Refund from your PayPal account as usual. The webhook takes the pack back within moments, and the site also
  re-checks recent sales (up to 180 days) with PayPal in the background, so nothing is missed. PayPal keeps its
  fee on refunded sales. The admin page's *Re-check with PayPal now* button checks every recent sale at once.
- If PayPal is slow or down while someone pays, the order shows as *pending* and settles by itself once PayPal
  answers; the buyer is told not to pay again. Nobody is charged twice.
- To stop people using the 99¢ checkout to test stolen cards, the shop limits checkouts per player, per address
  and site-wide, and stops after a few declined cards. Keep the site reachable only through the tunnel or proxy
  (don't publish port 8088 straight to the internet), so those limits see real visitor addresses.
- PayPal's Seller Protection barely covers digital items; for an "unauthorized payment" claim you need proof
  the item was delivered. The site keeps every order (player, time, PayPal order and payment IDs) for good:
  never delete the database, and keep the backups.
- A dispute on a 99¢ sale normally costs no dispute fee (under $30).
- PayPal's rules need pre-approval to sell spendable in-game currency. The Supporter Pack is a cosmetic plus a
  small bonus, which is fine; ask PayPal before ever selling game cash for real money.

## Day-to-day

| Task | Command |
|---|---|
| Logs | `docker compose logs -f site` |
| Update to the latest code | `git pull && docker compose up -d --build` |
| Restart | `docker compose restart site` |
| Stop | `docker compose down` (data stays in the `kg-data` volume) |

Updates don't touch player data; it lives in the volume, not the image.

## Backups

The database is safe to copy while the site runs with the built-in backup command:

```bash
docker compose exec site node server.js backup /data/backup-$(date +%F).db
docker compose cp site:/data/backup-$(date +%F).db ./
```

Restore: stop the site, replace `kaotic.db` in the volume with the backup (and delete any
`kaotic.db-wal` / `kaotic.db-shm` next to it), start the site.

## Adding more games

Each game lives in its own GitHub repo and is listed in `games.json` with a `source`
(see [`README.md`](README.md) → "Adding another game"). Push the `games.json` change; the site
downloads the game and checks it for new commits every `GAME_SYNC_MINUTES`. If a download fails
(a bad token, GitHub down) the site logs it once and keeps serving the copy it already has.
To download right away: `docker compose exec site node server.js sync-games`.
Games use `public/sdk.js` to save to the player's account and report progress to the admin page.

## What's in the container

- Image: `node:24-alpine`, runs as the unprivileged `node` user.
- App: `/app/server.js`.
- Data: `/data/kaotic.db`, and the downloaded games in `/data/games/` (volume `kg-data`).
- Health check: `GET /healthz` every 30 s.
