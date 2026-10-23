# App-Store-Bereich (zweite UI des AppStore-Backends)

`self-service-ui` ist neben `frontend` (Vue) die zweite Oberfläche unseres
FastAPI-Backends. Der Bereich liegt unter `web/app-store/` und erscheint als
Reiter „App Store" (`/app-store/apps`, `/app-store/deployments`), wenn der
Container mit `APP_STORE_ENABLED=true` gestartet wird. Ohne die Variable
verhält sich die UI wie upstream (Opt-in).

Der Code stammt aus dem PR #9 (Luminuzz, „Fix/app store integration") und wurde
auf upstream 0.8.165 (i18n, neue Nav) übertragen; Playwright-E2E und die
Dev-oauth2-proxy-Konfiguration des PRs sind bewusst nicht mit übernommen.

## Was die UI kann

| Seite | Lehrende/Admins | Studierende |
| --- | --- | --- |
| `/app-store/apps` | Katalog (Suche, Sichtbarkeit, Sortierung) | Katalog |
| `/app-store/apps/:id` | Details, **Bereitstellen mit einem Klick** | Details |
| `/app-store/deployments` | Deployments mit Status | „Meine Umgebungen", eigene Zugangsdaten |

Aufgerufene Endpunkte des Backends: `GET /users/me`, `GET /apps/`,
`GET /apps/{id}`, `GET /apps/{id}/variables`, `GET /deployments/`,
`GET /deployments/{id}/my-access`, `POST /deployments/`. Die Rolle kommt aus
`/users/me`; das UI blendet nur aus, was das Backend ohnehin ablehnt.
Alles, was mehr Eingaben braucht (Teams, Dateien, Variablen ohne Default, LTI,
App-Verwaltung, Freigaben), bleibt im Vue-Frontend; `APP_STORE_FRONTEND_URL`
ist dessen Adresse für die Links dorthin.

Die anderen Bereiche (DNS-Zonen, Cloud-Projekte, LLM, Workspaces) sind in
unserem Deployment **nicht** konfiguriert und daher ausgeblendet: Sie brauchen
Pfisterers APIs, die es bei uns nicht gibt.

## Anmeldung und API-Pfad

```text
Browser -> https://self-service[-staging].<zone>
        -> oauth2-proxy (:4180)  Keycloak-Realm dhbw, Client appstore-self-service
                                 (public, PKCE S256, kein Secret im Browser)
        -> Caddy (:8080, SPA)    /api/app-store/* -> Backend, Praefix entfernt
        -> appstore-t3-api:8000
```

- Die Upstream-UI authentifiziert nur ueber einen oauth2-proxy (BFF): der
  Browser haelt nur ein Cookie, nie ein Token. Das ist der Grund, warum wir
  keinen eigenen Browser-OIDC-Code eingebaut haben (jeder Merge von upstream
  haette ihn wieder aufgerissen).
- Der Proxy gibt den **Access-Token** als `Authorization: Bearer ...` weiter
  (`injectRequestHeaders`, nicht `--pass-authorization-header`, das den
  ID-Token schickt). Das Backend prueft `azp` gegen `OIDC_ALLOWED_CLIENTS`
  (dort steht `appstore-self-service` zusaetzlich zu `appstore-frontend`) und
  `aud` gegen `appstore-api` (Audience-Mapper am Client).
- Der Keycloak-Client ist **public**; oauth2-proxy verlangt trotzdem ein
  `client-secret` und bekommt einen Platzhalter, den Keycloak ignoriert.
- Kein CORS noetig: alles ist same-origin.

Konfiguration des Containers (siehe `docker-entrypoint.sh`):
`APP_STORE_ENABLED`, `APP_STORE_UPSTREAM` (Pflicht bei `true`, `host:port`),
`APP_STORE_BASE_URL` (Standard `/api/app-store`), `APP_STORE_FRONTEND_URL`,
`OIDC_CLIENT_ID`, `OIDC_ISSUER_URL`, `CONFIG_DIR` (Ziel von `config.js`, fuer
ein read-only Root-Dateisystem).

## Lokal

`npm run dev` mit `DUMMY_AUTH=true` zeigt die Seiten; das Backend lehnt den
Dev-Login ab (nur echte Keycloak-Tokens), die Seiten erklaeren das. Mit echten
Daten: lokalen oauth2-proxy mit Alpha-Config wie im Deployment-Chart
(`k8s/charts/appstore/templates/self-service-ui.yaml`) vor den Vite-Server
setzen; `APP_STORE_DEV_UPSTREAM=http://localhost:8000` leitet nur ohne Proxy
(401).
