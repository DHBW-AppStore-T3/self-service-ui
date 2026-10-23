# self-service-ui

Teil der DHBW-AppStore-T3 Organisation. Fork von
[pfisterer/self-service-ui](https://github.com/pfisterer/self-service-ui) —
**zweite Oberfläche unseres AppStore-Backends** (neben `frontend`): Der Bereich
„App Store" (`web/app-store/`) spricht über Caddy `/api/app-store/*` mit dem
FastAPI-Backend, Anmeldung über Keycloak (Realm `dhbw`, Client
`appstore-self-service`) hinter einem oauth2-proxy. Läuft auf
`self-service[-staging].<zone>`. Alles Weitere: `claude_docs/app-store.md`,
`claude_docs/architecture.md`. Der Rest der UI (DNS, Cloud-Projekte, LLM) ist
upstream-Code und bei uns nicht konfiguriert.

Branches: `dev` -> Staging, `main` -> Prod (CI baut das Image, `k8s-bump.yml`
im Repo `deployment` rollt es aus). Upstream wird per `git merge upstream/main`
in `dev` übernommen; eigene Änderungen klein halten (App-Store-Ordner,
Caddyfile, Entrypoint, CI), damit das konfliktarm bleibt.

Harness-Gesamtkonzept:
https://github.com/DHBW-AppStore-T3/.github/blob/main/docs/HARNESS.md

Details zu diesem Repo:
- Lebendes Übergabedokument: `claude_docs/HANDOVER.md` (zwingend zu Beginn jeder Session lesen und vor Session-Ende aktualisieren)
- Architektur: `claude_docs/architecture.md`
- Entscheidungen: `claude_docs/decisions.md`

## Lokale Befehle
- Dev-Server: `npm run dev` (`APP_STORE_ENABLED=true` schaltet den App-Store-Reiter ein)
- Tests: `npm test`
- Linting: `npm run lint`
- Build: `npm run build`
