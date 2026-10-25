# App-Store-Bereich (zweite UI des AppStore-Backends)

`self-service-ui` ist neben `frontend` (React/Vite/Tailwind, Repo
`DHBW-AppStore-T3/frontend`) die zweite Oberfläche unseres FastAPI-Backends. Der
Bereich liegt unter `web/app-store/` und erscheint als Reiter „App Store“
(`/app-store/...`), wenn der Container mit `APP_STORE_ENABLED=true` gestartet
wird. Ohne die Variable verhält sich die UI wie upstream (Opt-in).

Der Code stammte zunächst aus dem PR #9 (Luminuzz, „Fix/app store integration“)
und wurde auf upstream 0.8.165 (i18n, neue Nav) übertragen; Playwright-E2E und
die Dev-oauth2-proxy-Konfiguration des PRs sind bewusst nicht mit übernommen.
Seit dem Epic [#22](https://github.com/DHBW-AppStore-T3/self-service-ui/issues/22)
deckt der Bereich den Funktionsstand des Frontends ab, **im Design von
self-service-ui** (Mantine, lucide, Tokens aus `app.css`), nicht im
Frontend-Design.

## Was die UI kann

| Seite | Lehrende | Admins (zusätzlich, mit Admin-Ansicht) | Studierende |
| --- | --- | --- | --- |
| `/app-store/apps` | Katalog: Suche, Fachbereichs-Filter, „Empfohlen“, Sortierung (#16) | Auswahl „Sichtbarkeit“ | Katalog |
| `/app-store/apps/:id` | Details, Bereitstellen mit einem Klick, **ohne Versionsauswahl** (#17) | Version festlegen (nur freigegebene), Versionszahl, Quellcode-Link | Details |
| `/app-store/apps/:id/deploy` | Bereitstellungs-Wizard (#18) | – | – |
| `/app-store/deployments` | Deployments mit Status | – | „Meine Umgebungen“, eigene Zugangsdaten |
| `/app-store/deployments/:id` | Status folgt dem Backend, Teams, Task-Verlauf, **Live-Log** (#19) | – | Status, Hinweis bei Fehler, eigene Zugangsdaten (#19) |
| `/app-store/credentials` | OpenStack-Zugangsdaten per clouds.yaml (#20) | – | – |
| `/app-store/help` | Kurze Hilfe (#20) | – | Hilfe |
| `/app-store/settings` | – | Schalter „Admin-Ansicht“, Empfohlene Apps (#15, #16) | – |

**Admin-Ansicht** (#15): ein Schalter pro Konto im Browser
(`localStorage`, Schlüssel `appstore.adminView`, Objekt Konto → `true`), kein
Backend. Aus: ein Admin erlebt die UI wie eine Lehrperson. `useRole()`
(`queries.jsx`) liefert `admin` und `isAdminView`; Admin-Teile prüfen
`isAdminView`, nicht `admin`. Das Backend entscheidet weiterhin allein, was
erlaubt ist; die UI blendet nur aus.

Aufgerufene Endpunkte des Backends (`api.js`): `GET /users/me`, `GET /apps/`,
`GET /apps/{id}`, `GET /apps/{id}/variables`, `GET /apps/{id}/runtime`,
`GET /apps/{id}/versions` (Freigabe-Einträge, Admin), `GET /courses/`,
`GET /courses/{id}`, `GET /users/` (Studierende), `GET /users/search`,
`GET /deployments/`, `GET /deployments/{id}`, `GET /deployments/{id}/my-access`,
`GET /deployments/{id}/stream` (SSE), `GET /tasks/deployment/{id}`,
`POST /deployments/`, `GET|POST|DELETE /me/openstack-credentials[...]`,
`PUT /admin/apps/{id}/recommended`, `PUT /admin/apps/{id}/deploy-version`. Die
Rolle kommt aus `/users/me`; das UI blendet nur aus, was das Backend ohnehin
ablehnt.

### Entscheidungen im Detail
- **Fachbereiche** (#16): kuratierte Tabelle (`departments.js`, Zuordnung über
  exakte Git-Link-Aliasse) ist eine **Kopie** der Tabelle aus
  `frontend/src/config/department-catalog.ts`. Neue App → in beiden Repos
  eintragen. „Empfohlen“ ist vorausgewählt, solange mindestens eine App
  empfohlen ist; verwaltet wird es auf `/app-store/settings`.
- **Version** (#17): Lehrende deployen `deploy_version`; ist keine festgelegt
  oder nicht mehr deploybar, die erste Version der Liste (stabile zuerst).
  Freigabe/Ablehnung von Versionen bleibt im Frontend (Link).
- **Status** (#19): `GET /deployments/{id}` alle 5 s, solange der Status in
  Bewegung ist, nicht im Hintergrund-Tab; ein fehlgeschlagener Poll behält den
  letzten Stand. Das Live-Log (SSE) gibt es nur in der Owner-Ansicht und wird
  bei Abbruch nicht wiederholt; das Polling trägt den Status weiter.
- **Wizard** (#18): Die reine Logik (`wizard/teams.js`, `students.js`,
  `variables.js`, `payload.js`) ist aus `frontend/src/views/new-deployment/`
  übernommen; der Payload von `POST /deployments/` ist derselbe. Nicht dabei:
  Werthilfen für `@openstack:`-Marker (Netz-/Flavor-/Image-Auswahl) und eine
  eigene Oberfläche für Mehr-Image-Packer-Apps.
- **Zugangsdaten** (#20): `clouds.yaml` hochladen oder einfügen; bei leerem
  Bestand wird sofort gespeichert, sonst bestätigt der Button.

### Was im Frontend bleibt
Über `APP_STORE_FRONTEND_URL` (die Adresse des Frontends) führen `LegacyLink`s
noch an genau zwei Stellen dorthin: **„Apps verwalten“** im Katalog
(Anlegen, Bearbeiten, Löschen von Apps) und **„Versionen verwalten“** auf der
Admin-Detailseite (Freigabe, Ablehnung, Einreichen). Der Deploy-Pfad kommt ohne
Übergabe aus. Ebenfalls nur im Frontend: Kursverwaltung, Lifecycle-Aktionen
(Pausieren, Fortsetzen, Löschen, Abbrechen, Neu bereitstellen), das
Kubernetes-Pods-Panel (frontend#36) und der LTI-/Moodle-Einstieg
(frontend#9, siehe unten).

### Verwandte Themen
- Einmalanmeldung aus einem LMS: Handoff-Token in #5
  ([self-service-ui#5](https://github.com/DHBW-AppStore-T3/self-service-ui/issues/5)).
- LTI-Einstieg: frontend#9 (`DHBW-AppStore-T3/frontend`).

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
