# self-service-ui — Architektur

Fork von [pfisterer/self-service-ui](https://github.com/pfisterer/self-service-ui)
("dhbwCloud Self Service", `package.json`-Name: `dynamic-zones-ui`). React/Vite
(Mantine, i18next, TanStack Query), Stand: upstream 0.8.165.

## Rolle im AppStore-System

Zweite Oberfläche des AppStore-Backends. Von der Upstream-UI nutzen wir die
Shell (Header, Navigation, Anmeldung, Sprachumschalter) und den eigenen Bereich
`web/app-store/` (Katalog, Details, Bereitstellen, Deployments, Zugangsdaten).
Die Upstream-Bereiche (DNS-Zonen, Cloud-Projekte, LLM, Workspaces) gehen gegen
Pfisterers APIs und sind bei uns abgeschaltet (leere Base-URLs in `config.js`).

Aufbau, API-Pfad und Anmeldung: `claude_docs/app-store.md`.

## Laufzeit

Ein Image fuer alle Umgebungen (Caddy, Port 8080, UID 65532). Beim Start
schreibt `docker-entrypoint.sh` `config.js` aus Umgebungsvariablen
(`CONFIG_DIR` verschiebt es auf ein beschreibbares Volume, damit das
Root-Dateisystem read-only bleiben kann). Caddy liefert die SPA und leitet
`/api/app-store/*` an das Backend; davor steht ein oauth2-proxy.
Deployment: Repo `deployment`, `k8s/charts/appstore/templates/self-service-ui.yaml`.

## Stack

React + Vite, Mantine, i18next (`web/i18n`, en/de), ESLint + Vitest
(`npm run check` kombiniert Lint+Test).
