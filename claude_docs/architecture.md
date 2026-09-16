# self-service-ui — Architektur

Fork von [pfisterer/self-service-ui](https://github.com/pfisterer/self-service-ui)
("dhbwCloud Self Service", `package.json`-Name: `dynamic-zones-ui`).
React/Vite-App (Mantine UI), nutzt `@dhbw-cloud/dynamic-zones-client`
und `@dhbw-cloud/os-mgt-client` als eigene npm-Pakete gegen eine
DHBW-Cloud-Backend-API — **kein** direkter Bezug zum AppStore-Backend
in diesem Projekt, komplett eigenständiges System.

## Warum in der Org

Referenzimplementierung für Self-Service-Deploy-UIs — das Kernproblem,
das dieses Projekt löst ("Ressourcen selbst zuteilen statt auf eine
zentrale Freigabe warten müssen"), überschneidet sich konzeptionell
mit dem AppStore. Als Vergleich/Inspiration für UX-Entscheidungen
relevant, nicht als Code-Abhängigkeit.

## Stack

React + Vite, Mantine (`@mantine/core`, `@mantine/dates`,
`@mantine/form`, `@mantine/hooks`), ESLint + Vitest
(`npm run check` kombiniert Lint+Test).
