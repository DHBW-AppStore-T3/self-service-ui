# DHBW-App-Store im Self-Service-Portal

Dieses Repository ergänzt `pfisterer/self-service-ui` um einen React-/Mantine-Bereich.
Der bestehende Vue-App-Store im benachbarten `frontend/` bleibt erhalten.

## Umfang

- Neuer Reiter **App-Store** in Desktop- und Mobilnavigation.
- `/app-store/apps`: Katalog aus dem vorhandenen FastAPI-Backend, Textsuche,
  Sichtbarkeitsfilter, Sortierung und App-Details unter `/app-store/apps/:id`.
- `/app-store/deployments`: sichtbare Deployments mit Status und Aktualisierung alle 15 Sekunden.
- Bereitstellung, Kurs-/Teamzuordnung, Zugangsdaten, App-Verwaltung und LTI bleiben
  im bestehenden App-Store. Die passenden Links führen zu `/apps/:id`, `/apps`
  und `/deployments/:id` des vorhandenen Frontends. Es wird kein Vue-Code eingebettet.
- Deutsch/Englisch über die vorhandene Sprachauswahl; Lade-, Leer- und Fehlerzustände.

React rendert die Oberfläche, Mantine liefert die Komponenten. Webpack baut die
Anwendung und stellt den Entwicklungsserver bereit. `vite.config.js` wurde entfernt.
Nur die übernommenen Unit-Tests verwenden weiterhin Vitest mit dessen interner
Vite-Abhängigkeit; diese ist nicht der Build oder Entwicklungsserver der Anwendung.

## Lokaler Start unter PowerShell

Node.js 24.15+ (oder eine von den Abhängigkeiten unterstützte neuere Version) und npm:

```powershell
cd C:\Users\flock\Desktop\DHBW_APP\self-service-ui
npm ci
$env:DUMMY_AUTH = 'true'
$env:APP_STORE_UPSTREAM = 'http://localhost:8000'
$env:APP_STORE_FRONTEND_URL = 'http://localhost:5173'
npm run dev
```

Adresse: http://localhost:8084/app-store/apps

Die Variablen werden aus der Prozessumgebung gelesen. Webpack erzeugt `config.js`
im Speicher; es verändert keine lokale `.env`-Datei. Ohne laufendes Backend zeigt
die Oberfläche eine Fehlermeldung. Es gibt keine automatisch eingesetzten Beispieldaten.

**Der Dummy-Login ist nur eine lokale Vorschau des Portals.** Er authentifiziert
nicht am App-Store-Backend. Dieses erwartet einen echten Keycloak-Bearer-Token.
Die echten Daten benötigen die nachfolgende Login-Proxy-Anbindung. Testdaten
werden ausschließlich in den Browser-Tests abgefangen.

## API und Anmeldung

```text
Browser → /api/app-store/* → oauth2-proxy → Caddy → FastAPI
                           fügt Bearer ein       entfernt /api/app-store
```

In Produktion steht der vorhandene oauth2-proxy vor Caddy. Er muss einen vom
App-Store-Backend akzeptierten **Access-Token** als `Authorization: Bearer …`
weitergeben; ein ID-Token oder eine E-Mail allein genügt nicht. Keycloak-Realm,
Signaturschlüssel und Rollen müssen zum App-Store passen. API-Anfragen ohne
Sitzung sollen HTTP 401 statt einer HTML-Loginseite erhalten. Der Browser speichert
keine Tokens; 401 öffnet den bestehenden Dialog zur erneuten Anmeldung.

| Variable | Zweck / Standard |
| --- | --- |
| `APP_STORE_BASE_URL` | Browser-API-Pfad, `/api/app-store` |
| `APP_STORE_UPSTREAM` | Backend-Ziel; lokal `http://localhost:8000`, Caddy `backend:8000` |
| `APP_STORE_FRONTEND_URL` | URL des vorhandenen Vue-App-Stores; lokal `http://localhost:5173`; in Produktion setzen |
| `APP_STORE_ENABLED` | `false` blendet Reiter und Routen aus; Standard `true` |
| `APP_STORE_BFF_UPSTREAM` | Nur Entwicklung: bereits authentifizierter BFF inklusive `/api/app-store`-Routing; Pfad bleibt erhalten |
| `AUTH_PROXY_UPSTREAM` | Nur Entwicklung: Proxy für `/oauth2/*` |

Für authentifizierte lokale Entwicklung `DUMMY_AUTH=false`, `AUTH_PROXY_UPSTREAM`
und `APP_STORE_BFF_UPSTREAM` auf den eingerichteten Login-Proxy setzen. Dessen
Callback-/Cookie-Konfiguration muss zur lokalen Browseradresse passen.
Nur `/oauth2` weiterzuleiten und die App-Store-API direkt an FastAPI zu schicken,
reicht nicht: In diesem Fall würde der Bearer-Token fehlen.

Cloud-Projekte, DNS-Zonen und API-Tokens behalten ihre vorhandenen Einstellungen.
Sie erscheinen wie bisher nur, wenn ihre APIs konfiguriert sind.

Das Containerimage wird weiter mit dem vorhandenen Dockerfile gebaut. Der Container
benötigt Netzwerkzugriff zum App-Store-Backend; `APP_STORE_UPSTREAM` und
`APP_STORE_FRONTEND_URL` sind umgebungsspezifisch zu setzen. Ein produktiver
Deployment- oder Keycloak-Umbau ist nicht Bestandteil dieser Änderung.

## Prüfung

```powershell
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

Die Browser-Tests prüfen Navigation, direkte Unterseiten samt Reload, Suche,
Detail-/Deployment-Links, Wiederholung fehlgeschlagener Anfragen und mobile
Darstellung mit abgefangenen API-Antworten. Sie ersetzen keinen Test des echten
Keycloak-/Proxy-/Backend-Verbunds. Screenshots entstehen unter `test-results/`.
