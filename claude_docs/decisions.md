# Entscheidungen

## Fork statt Neuentwicklung

Statt eine eigene Self-Service-UI von Grund auf zu bauen, wurde das
bestehende `pfisterer/self-service-ui`-Projekt geforkt — es löst ein
eng verwandtes Problem (dynamische Ressourcen-Zuteilung ohne
zentrale Freigabe) bereits produktionsreif. Dient aktuell als
Referenz/Inspiration, nicht als aktiv integrierter Teil des
AppStore-Systems.

## Integration mit dem AppStore-Backend (supersedes "keine geplante Integration")

Diese Entscheidung wurde durch die 4-Issue-Serie backend#9 / frontend#9 /
self-service-ui#5 / deployment#43 ersetzt: self-service-ui bekommt einen
produktionssicheren SSO-Handoff zum AppStore. `openWithSso()`
(`web/header.jsx`) ruft vor dem Öffnen des App-Store-Popups
`POST /api/appstore/handoff/mint` auf — von Caddy zum AppStore-Backend
weitergeleitet (`Caddyfile`, `/api/appstore/*`), das den bereits vom
oauth2-proxy injizierten Keycloak-Bearer gegen einen kurzlebigen,
backend-signierten `handoff_token` eintauscht. Der App-Store-Frontend
vertraut nie einer bloßen E-Mail-Adresse aus einem Query-Parameter,
nur diesem Token. Helm-Default (`appstoreUpstream`/`appstoreBaseUrl`
leer) hält das Feature deaktiviert, bis eine Umgebung es explizit setzt.
