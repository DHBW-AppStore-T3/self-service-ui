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
