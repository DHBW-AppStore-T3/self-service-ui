# Handover — self-service-ui

Lebendes Übergabedokument gemäß [HARNESS.md](https://github.com/DHBW-AppStore-T3/.github/blob/main/docs/HARNESS.md) Abschnitt 1.2.
Jede Session liest dieses Dokument zu Beginn und aktualisiert es vor dem Abschluss.

---

## 1. Status & Fokus
- **Stack:** React, Vite, Mantine UI (`@mantine/core`, `@mantine/dates`, `@mantine/form`), Vitest, ESLint.
- **Rolle:** Fork von `pfisterer/self-service-ui` ("dhbwCloud Self Service", package: `dynamic-zones-ui`). Dient als Referenzimplementierung und UI/UX-Vergleichsobjekt für Self-Service-Deployment.
- **Integration:** Bisher kein aktiver Integrationsplan mit dem AppStore-Backend.
- **CI/CD:** GitHub Actions für Image-Build (`docker-image.yml`) und Checks (`checks.yml`).

---

## 2. In Arbeit & Nächste Schritte
- [ ] Evaluation von UI/UX-Mustern für Quota- und Projekt-Management zur Übertragung auf den DHBW AppStore.
- [ ] GHCR Docker Image Tag Cleanup und Lowercase-Namenskonventionen in CI finalisieren (siehe PR #3).

---

## 3. Bekannte Fallstricke & Blocker
1. **GHCR Repository-Namen:** GitHub Container Registry erwartet strikt kleingeschriebene Repository- und Image-Namen (`docker-image.yml` beachtet dies nun via `toLower`).
2. **Eigenständige API-Clients:** Verwendet `@dhbw-cloud/dynamic-zones-client` gegen die DHBW-Cloud-Backend-API, nicht gegen das FastAPI-Backend des AppStores.

---

## 4. Letzte Übergaben (Historie)
- **2026-09-18:** `claude_docs/HANDOVER.md` angelegt und `CLAUDE.md` aktualisiert (Harness System 1.2).
- **2026-09-17:** GHCR Docker-Tagging in CI auf Lowercase angepasst (#3).
- **2026-09-16:** Flache `claude_docs/`-Basisstruktur (`architecture.md`, `decisions.md`) initial aufgesetzt (#2).
