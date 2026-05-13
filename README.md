# Tracker

Kleine private Habit-Tracking-App fuer genau einen Nutzer und einen Zeitraum von 365 Tagen.

## Stack

- Next.js mit einer einzigen Seite
- API-Routes fuer Eintraege, Strang-Verwaltung und Reset
- SQLite als lokaler Dateispeicher auf dem VPS
- Passwortschutz ueber Nginx Basic Auth vor der App

## Lokal starten

```bash
npm install
npm run dev
```

Die App laeuft danach auf `http://localhost:3000`.

## Daten

Standardpfad fuer die Datenbank:

```bash
data/tracker.db
```

Optional kannst du auf dem Server einen festen Pfad setzen:

```bash
TRACKER_DB_PATH=/var/www/tracker/data/tracker.db
```

## Produktive Empfehlung

### 1. App auf dem VPS deployen

Beispielstruktur:

```bash
/var/www/tracker
  package.json
  .next
  data/tracker.db
```

Starten z. B. mit PM2:

```bash
npm install
npm run build
pm2 start npm --name tracker -- start
```

### 2. Subdomain absichern

Beispiel fuer Nginx mit vorgeschaltetem Passwortschutz:

```nginx
server {
    server_name netz.ichwillsicherheit.de;

    auth_basic "Private Tracker";
    auth_basic_user_file /etc/nginx/.htpasswd-tracker;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`.htpasswd` anlegen:

```bash
sudo apt-get install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-tracker dein-benutzer
```

Danach TLS aktivieren, z. B. mit Let's Encrypt.

### 3. Monatliches Backup

Das Repo enthaelt `scripts/backup-monthly.sh`.

Beispiel fuer Cron am ersten Tag jedes Monats um 03:00 Uhr:

```bash
0 3 1 * * TRACKER_DB_PATH=/var/www/tracker/data/tracker.db BACKUP_DIR=/var/backups/tracker /var/www/tracker/scripts/backup-monthly.sh
```

## API-Ueberblick

- `GET /api/state` liefert Habits, Zaehler, heutige Eintraege und Stats
- `POST /api/entries` speichert einen Eintrag fuer einen Habit
- `DELETE /api/entries` loescht einen einzelnen Eintrag wieder
- `POST /api/habits` legt einen neuen Strang an
- `DELETE /api/habits` loescht einen Strang inklusive Historie
- `POST /api/reset` mit `scope=day` oder `scope=all`
- `GET /api/export` laedt einen JSON-Export herunter

## Bewusste Design-Entscheidungen

- Kein Login-System in der App, weil der Schutz davor ueber Nginx sauberer und einfacher ist
- Keine Browser-Persistenz als Hauptspeicher
- Keine grosse Datenbank, weil SQLite fuer einen Nutzer und ein Jahr mehr als genug ist
