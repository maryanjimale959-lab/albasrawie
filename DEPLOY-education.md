# Deploying Albasrawie to education.albasrawie.com

Server: `adminuser@185.7.81.97` (Ubuntu 22.04) · App folder: `/var/www/education` · Repo: `https://github.com/maryanjimale959-lab/albasrawie.git`

## What this project is and what it needs

| Item | Detail |
|---|---|
| App type | **Next.js 14.2** full-stack app (React 18, server actions). It is a long-running **Node.js server**, not static files. |
| Runtime | **Node.js 20 LTS** (minimum 18.18) |
| Database | **MySQL 8 or MariaDB 10+**. The app **creates its own tables on first boot** — you only create an empty database and a user. |
| Native module | `better-sqlite3` (needs `build-essential` + `python3` if no prebuilt binary) |
| Files on disk | Uploads are stored in `DATA_DIR/uploads` (max 20 MB per file). Must be a persistent folder outside the git checkout. |
| First admin | Created automatically on boot from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| Process manager | **PM2** (keeps it running, restarts on reboot) |
| Web server | **Nginx** reverse proxy → `127.0.0.1:3010`, HTTPS via **Let's Encrypt (certbot)** |

### Environment variables used by the code

| Variable | Value for production |
|---|---|
| `NODE_ENV` | `production` (makes the login cookie `Secure`, so HTTPS is required) |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | your DB (or one `MYSQL_URL`) |
| `MYSQL_POOL_SIZE` | `10` |
| `DATA_DIR` | `/var/www/education-data` |
| `APP_URL` | `https://education.albasrawie.com` (used in course share links and attendance QR codes) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first administrator (password 8+ chars) |
| `REQUIRE_TEACHER_VERIFICATION` | `true` or `false` |

### Things to know before going live

1. **Upload size limit.** Uploads go through Next.js server actions, whose default body limit is **1 MB**. Files over 1 MB will fail even though the app allows 20 MB. Fix in `next.config.js` (commit and push before deploying):
   ```js
   experimental: {
     serverComponentsExternalPackages: ["mysql2", "better-sqlite3"],
     instrumentationHook: true,
     serverActions: { bodySizeLimit: "25mb" },
   },
   ```
2. **Silent SQLite fallback.** If MySQL is unreachable at startup (`ECONNREFUSED`/`ETIMEDOUT`), the app quietly switches to a local SQLite file. Production data would end up in the wrong place. After every start, check the logs for `MySQL not running` (Step 9).
3. **Port.** Other apps already run on this server. This guide uses **3010**. Step 1 checks it's free.
4. **Private repo?** If the GitHub repo is private, `git clone` asks for a username and a **Personal Access Token** (not your password), or you set up a deploy key (Step 5).

---

## Roadmap

1. DNS record → 2. Inspect the server → 3. Install Node/PM2/build tools → 4. Create the MySQL database → 5. Clone the code → 6. Write `.env.local` → 7. Install & build → 8. Run with PM2 → 9. Verify → 10. Nginx site → 11. HTTPS → 12. Final checks → 13. Updating later

---

## Step 1 — DNS (at your domain provider)

Add an **A record**: name `education`, value `185.7.81.97`, TTL default. Check it from your PC:

```bash
nslookup education.albasrawie.com
```

It must return `185.7.81.97` before Step 11 (HTTPS) will work.

## Step 2 — Inspect the server (see what's already there)

SSH in, then run these and note the output:

```bash
ssh adminuser@185.7.81.97
```

```bash
node -v; npm -v; pm2 -v
```

```bash
nginx -v; systemctl is-active nginx apache2
```

```bash
mysql --version; systemctl is-active mysql mariadb
```

```bash
sudo ss -tlnp | grep -E ':(3010|80|443|3306)\b'
```

```bash
pm2 list
```

```bash
free -h; df -h /var/www
```

- If `:3010` already shows a process, pick another free port (e.g. 3011) and use it everywhere below.
- If `apache2` is active instead of nginx, tell me — the proxy step is different.
- If free RAM is under ~1.5 GB, add swap before building (Step 7 has the commands).

## Step 3 — Install Node.js 20, PM2 and build tools

Skip what's already installed. **If `node -v` shows v18.18+ or v20+, keep it** — other apps on the server use it.

```bash
sudo apt update && sudo apt install -y git build-essential python3 curl
```

Only if Node is missing or older than 18.18:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```

```bash
sudo apt install -y nodejs
```

Only if PM2 is missing:

```bash
sudo npm install -g pm2
```

## Step 4 — Create the MySQL database and user

If MySQL/MariaDB is not installed yet:

```bash
sudo apt install -y mysql-server && sudo systemctl enable --now mysql
```

Open the MySQL shell:

```bash
sudo mysql
```

Paste this (replace `STRONG_DB_PASSWORD` with a long random password, and keep it for Step 6):

```sql
CREATE DATABASE education_albasrawie CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'education_user'@'localhost' IDENTIFIED BY 'STRONG_DB_PASSWORD';
GRANT ALL PRIVILEGES ON education_albasrawie.* TO 'education_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Test the login:

```bash
mysql -u education_user -p -h 127.0.0.1 education_albasrawie -e "SELECT 1;"
```

Tip: generate a random password with `openssl rand -base64 24`.

## Step 5 — Clone the code into /var/www/education

```bash
sudo mkdir -p /var/www/education /var/www/education-data/uploads
```

```bash
sudo chown -R adminuser:adminuser /var/www/education /var/www/education-data
```

```bash
git clone https://github.com/maryanjimale959-lab/albasrawie.git /var/www/education
```

```bash
cd /var/www/education && git log --oneline -3
```

If the repo is private and you'd rather not type a token each time, use a deploy key:

```bash
ssh-keygen -t ed25519 -C "education-deploy" -f ~/.ssh/education_deploy -N ""
```

```bash
cat ~/.ssh/education_deploy.pub
```

Add that key in GitHub → repo → Settings → Deploy keys (read-only), then:

```bash
printf "Host github-education\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/education_deploy\n" >> ~/.ssh/config
```

```bash
git clone git@github-education:maryanjimale959-lab/albasrawie.git /var/www/education
```

## Step 6 — Write the production environment file

```bash
nano /var/www/education/.env.local
```

Paste and fill in:

```ini
NODE_ENV=production
APP_URL=https://education.albasrawie.com

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=education_user
MYSQL_PASSWORD=STRONG_DB_PASSWORD
MYSQL_DATABASE=education_albasrawie
MYSQL_POOL_SIZE=10

DATA_DIR=/var/www/education-data

ADMIN_EMAIL=your-admin@albasrawie.com
ADMIN_PASSWORD=A-Strong-Admin-Password-123

REQUIRE_TEACHER_VERIFICATION=true
```

Save (`Ctrl+O`, `Enter`, `Ctrl+X`) and lock it down:

```bash
chmod 600 /var/www/education/.env.local
```

`.env.local` is in `.gitignore`, so `git pull` never overwrites it.

## Step 7 — Install dependencies and build

If RAM is low (under ~1.5 GB free), add 2 GB swap first:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Install and build:

```bash
cd /var/www/education && npm ci
```

```bash
npm run build
```

The build must end with a route table and no `Failed to compile`. If `npm ci` fails on `better-sqlite3`, check that `build-essential` and `python3` are installed (Step 3).

## Step 8 — Run it with PM2 (port 3010, local only)

Bind to `127.0.0.1` so the app is only reachable through Nginx:

```bash
cd /var/www/education && pm2 start node_modules/next/dist/bin/next --name education -- start -H 127.0.0.1 -p 3010
```

```bash
pm2 save
```

Make PM2 start on reboot (skip if `pm2 startup` was already set up for the other apps — `pm2 list` showing them after a reboot means it was). It prints one `sudo env PATH=...` command; **copy and run that line**:

```bash
pm2 startup systemd -u adminuser --hp /home/adminuser
```

## Step 9 — Verify the app and the database

```bash
pm2 logs education --lines 40 --nostream
```

You should see Next.js `Ready`. You must **not** see `[db] MySQL not running ... Using local SQLite`. If you do, fix MySQL / `.env.local`, then `pm2 restart education`.

```bash
curl -I http://127.0.0.1:3010
```

Expect `HTTP/1.1 200`. Confirm the tables and admin exist:

```bash
mysql -u education_user -p -h 127.0.0.1 education_albasrawie -e "SHOW TABLES; SELECT id,email,role FROM users WHERE role='admin';"
```

## Step 10 — Nginx site for education.albasrawie.com

Look at how the other sites are configured, so this one matches:

```bash
ls /etc/nginx/sites-enabled/
```

Create the new site:

```bash
sudo nano /etc/nginx/sites-available/education.albasrawie.com
```

Paste:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name education.albasrawie.com;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Enable it, test the config, reload (the `nginx -t` check protects the other sites — only reload if it says `syntax is ok`):

```bash
sudo ln -s /etc/nginx/sites-available/education.albasrawie.com /etc/nginx/sites-enabled/
```

```bash
sudo nginx -t
```

```bash
sudo systemctl reload nginx
```

## Step 11 — HTTPS with Let's Encrypt

Required: with `NODE_ENV=production` the login cookie is `Secure`, so **login does not work over plain http**.

```bash
sudo apt install -y certbot python3-certbot-nginx
```

```bash
sudo certbot --nginx -d education.albasrawie.com --redirect
```

Check auto-renewal:

```bash
sudo certbot renew --dry-run
```

If a firewall is active, make sure web traffic is allowed (port 3010 should **not** be opened):

```bash
sudo ufw status
```

```bash
sudo ufw allow 'Nginx Full'
```

## Step 12 — Final checks in the browser

1. Open `https://education.albasrawie.com` — landing page loads with the padlock.
2. Go to `https://education.albasrawie.com/admin` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. **Change the password in Settings**, then remove `ADMIN_PASSWORD` from `.env.local` and `pm2 restart education`.
3. Register a test teacher at `/register/teacher` and approve them in `/admin`.
4. Create a course, upload a material file **larger than 1 MB**, and download it again (this tests the upload limit fix and `DATA_DIR`).
5. Start an attendance session and check the QR/link starts with `https://education.albasrawie.com`.

Optional demo data (teacher + 6 students) — only on a test install, not for real users:

```bash
cd /var/www/education && node --env-file=.env.local scripts/demo-seed.mjs
```

## Step 13 — Updating later (deploy new code)

Create the script once:

```bash
nano /var/www/education/deploy.sh
```

```bash
#!/usr/bin/env bash
set -e
cd /var/www/education
git pull --ff-only
npm ci
npm run build
pm2 restart education
pm2 logs education --lines 20 --nostream
```

```bash
chmod +x /var/www/education/deploy.sh
```

Then every update is:

```bash
/var/www/education/deploy.sh
```

## Backups (do this before real students use it)

Daily database dump at 02:30, kept 14 days:

```bash
mkdir -p /home/adminuser/backups && printf "[client]\nuser=education_user\npassword=STRONG_DB_PASSWORD\n" > /home/adminuser/.my-education.cnf && chmod 600 /home/adminuser/.my-education.cnf
```

```bash
(crontab -l 2>/dev/null; echo '30 2 * * * mysqldump --defaults-extra-file=/home/adminuser/.my-education.cnf --single-transaction education_albasrawie | gzip > /home/adminuser/backups/education-$(date +\%F).sql.gz && tar czf /home/adminuser/backups/education-uploads-$(date +\%F).tgz -C /var/www education-data && find /home/adminuser/backups -name "education-*" -mtime +14 -delete') | crontab -
```

## Troubleshooting

| Symptom | Check |
|---|---|
| 502 Bad Gateway | `pm2 list` (is `education` online?), `pm2 logs education` |
| Login redirects back to login | Site is on http, not https (Step 11) |
| Uploads over 1 MB fail | `bodySizeLimit` missing from `next.config.js`, or `client_max_body_size` in Nginx |
| Data disappears / admin missing | Logs show the SQLite fallback — MySQL wasn't reachable at boot |
| Share/QR links show `127.0.0.1` | `APP_URL` not set in `.env.local`, then `pm2 restart education` |
| `npm run build` killed | Out of memory — add swap (Step 7) |
