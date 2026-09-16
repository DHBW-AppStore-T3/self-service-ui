# Entscheidungen

## Fork statt Neuentwicklung

Statt eine eigene Self-Service-UI von Grund auf zu bauen, wurde das
bestehende `pfisterer/self-service-ui`-Projekt geforkt — es löst ein
eng verwandtes Problem (dynamische Ressourcen-Zuteilung ohne
zentrale Freigabe) bereits produktionsreif. Dient aktuell als
Referenz/Inspiration, nicht als aktiv integrierter Teil des
AppStore-Systems.

## Keine geplante Integration mit dem AppStore-Backend

Anders als `moodle_appstore` (LTI-Integrationsziel) gibt es für dieses
Repo keinen konkreten Integrationsplan — es bleibt bewusst als
eigenständiges Vergleichsprojekt in der Org, bis eine Entscheidung für
oder gegen eine tiefere Integration getroffen wird.
