# Entscheidungen

## Fork statt Neuentwicklung

Statt eine eigene Self-Service-UI von Grund auf zu bauen, wurde das
bestehende `pfisterer/self-service-ui`-Projekt geforkt — es löst ein
eng verwandtes Problem (dynamische Ressourcen-Zuteilung ohne
zentrale Freigabe) bereits produktionsreif. Dient aktuell als
Referenz/Inspiration, nicht als aktiv integrierter Teil des
AppStore-Systems.

## Zweite UI des AppStore-Backends (supersedes „SSO-Handoff")

Der frühere SSO-Handoff (`openWithSso()`, `/api/appstore/handoff/mint`) ist
entfernt: das Backend hat den Endpunkt abgeschafft, und ein Popup mit Token in
der URL war ohnehin die schwächste Lösung. Stattdessen ist die UI selbst eine
Oberfläche des Backends (`web/app-store/`, aus PR #9 übernommen), mit eigener
Anmeldung am Keycloak-Realm `dhbw`.

- **Auth: BFF statt Browser-OIDC.** Upstream authentifiziert ausschließlich
  über einen oauth2-proxy (der Browser hält kein Token). Wir behalten das, statt
  Browser-OIDC einzubauen: jeder Merge von upstream würde `auth.jsx`,
  `client.jsx` und `session.jsx` wieder berühren. Der Keycloak-Client
  `appstore-self-service` ist trotzdem *public* (PKCE S256, kein Secret); der
  Proxy bekommt nur einen Platzhalter für `client-secret`, den Keycloak
  ignoriert. Geheim ist allein das Cookie-Secret des Proxys.
- **Access-Token statt ID-Token.** `injectRequestHeaders` setzt den Access-Token
  als Bearer; das Backend prüft `azp` (`OIDC_ALLOWED_CLIENTS`) und `aud`.
- **Opt-in.** `APP_STORE_ENABLED=true` schaltet den Bereich ein; sonst verhält
  sich die UI wie upstream.
- **CI.** `docker-image.yml` (Upstream-Release: `:latest`, Helm-Chart-Push, Tags,
  Retention) entfällt zugunsten von `ci.yml` (Lint, Test, Build, Trivy, Push
  `ghcr.io/dhbw-appstore-t3/self-service-ui:sha-<commit>`, Roll-out via
  `deployment/k8s-bump.yml`). Der Upstream-Helm-Chart (`helm-chart/`) bleibt
  unverändert liegen, wird aber nicht benutzt; unser Chart ist Teil von
  `deployment/k8s/charts/appstore`.

## App-Store-Bereich auf Stand des Frontends (Epic #22)

Der Bereich übernimmt den Funktionsstand des Frontends, nicht dessen Design.
Festgelegt wurde:

- **Admin-Ansicht im Browser statt im Backend.** Ein Schalter pro Konto in
  `localStorage` genügt, weil er nur ausblendet; erlaubt oder verboten
  entscheidet das Backend. Pro Konto, damit mehrere Personen an einem Browser
  sich nicht teilen.
- **Fachbereichs-Tabelle kopiert.** Zehn Zeilen, zwei getrennte Builds; ein
  gemeinsames Paket oder ein Backend-Feld kostet mehr als das gemeinsame
  Pflegen. Der Kopf von `web/app-store/departments.js` sagt, wo das Original liegt.
- **Rückfall auf die erste Version.** Ohne festgelegte `deploy_version`
  deployen Lehrende die erste Version der Liste, statt blockiert zu sein; auf
  Staging war anfangs bei keiner App etwas festgelegt.
- **Live-Log bricht ab, statt zu wiederholen.** `EventSource` verbindet sich von
  selbst neu; ein Proxy, der den Strom nicht trägt, würde so ununterbrochen
  scheitern. Nach dem ersten Fehler bleibt der Strom zu, das Polling trägt den Status.
- **Wizard: Logik übernehmen, Oberfläche neu.** Die reinen Module sind
  Portierungen mit eigenen Tests, damit der Payload gleich bleibt; die
  Werthilfen für `@openstack:`-Marker fehlen bewusst (siehe `app-store.md`).
- **Eigene Hilfe- und Zugangsdaten-Seite** statt Verweisen ins Frontend: jeder
  Verweis wäre genau die Übergabe, die der Epic abbaut.

