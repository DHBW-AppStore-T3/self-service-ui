# Handover — self-service-ui

Lebendes Übergabedokument gemäß [HARNESS.md](https://github.com/DHBW-AppStore-T3/.github/blob/main/docs/HARNESS.md) Abschnitt 1.2.
Jede Session liest dieses Dokument zu Beginn und aktualisiert es vor dem Abschluss.

---

## 1. Status & Fokus
- **Stack:** React, Vite, Mantine, i18next, Vitest, ESLint; Caddy-Image.
- **Rolle:** zweite UI des AppStore-Backends (neben `frontend`), basierend auf upstream 0.8.165 (`pfisterer/self-service-ui`). Bereich `web/app-store/`; Details `claude_docs/app-store.md`.
- **Deployment:** Staging `https://self-service-staging.<zone>` (Branch `dev`), Prod `https://self-service.<zone>` (Branch `main`, erst nach Promotion). Chart im Repo `deployment`.
- **CI/CD:** `.github/workflows/ci.yml` (Lint/Test/Build, Trivy, Push nach ghcr, Roll-out über `deployment/k8s-bump.yml`). `checks.yml` bleibt als Upstream-Check.

---

## 2. In Arbeit & Nächste Schritte
- [ ] Promotion nach `main`/Prod: Keycloak-Client im Live-Realm `dhbw` von prod anlegen (siehe `deployment/k8s/README.md`, Abschnitt „self-service-ui").
- [ ] PR #9 (Luminuzz) klären: sein App-Store-Code ist hier übernommen; PR schließen oder auf diesen Stand bringen.
- [ ] Optional: Playwright-E2E aus PR #9 nachziehen; Upstream-Merge regelmäßig (`git merge upstream/main`).

---

## 3. Bekannte Fallstricke & Blocker
1. **GHCR Repository-Namen:** GitHub Container Registry erwartet strikt kleingeschriebene Repository- und Image-Namen (`docker-image.yml` beachtet dies nun via `toLower`).
2. **Eigenständige API-Clients:** DNS/Cloud/LLM-Bereiche nutzen Pfisterers Clients und sind bei uns abgeschaltet; nur `web/app-store/` spricht mit unserem FastAPI-Backend.
3. **Access-Token:** Das Backend akzeptiert nur Access-Tokens mit `azp` in `OIDC_ALLOWED_CLIENTS`; der oauth2-proxy muss `injectRequestHeaders` (nicht `--pass-authorization-header`) nutzen.

---

## 4. Letzte Übergaben (Historie)
- **2026-10-23:** upstream 0.8.165 gemerged, SSO-Handoff entfernt, App-Store-Bereich aus PR #9 übernommen, CI + Deployment angelegt.
- **2026-09-18:** `claude_docs/HANDOVER.md` angelegt und `CLAUDE.md` aktualisiert (Harness System 1.2).
- **2026-09-17:** GHCR Docker-Tagging in CI auf Lowercase angepasst (#3).
- **2026-09-16:** Flache `claude_docs/`-Basisstruktur (`architecture.md`, `decisions.md`) initial aufgesetzt (#2).
