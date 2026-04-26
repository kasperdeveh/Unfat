# Session Handoff — 2026-04-26

> Tijdelijke notitie voor overdracht naar nieuwe Claude Code sessie. Mag weg zodra je verder bent gegaan.

## Status
Brainstorm voor sub-projecten **A (Foundation) + B (Solo tracking MVP)** is **afgerond**. Volledig design ligt vast in een spec doc (gecommit). Volgende stap is een implementatieplan opstellen via de **superpowers:writing-plans** skill.

## Eerste prompt voor nieuwe sessie

> "We waren bezig met sub-projecten A + B van Unfat. Lees in deze volgorde: `CLAUDE.md`, `/home/node/.claude/projects/-workspaces-Unfat/memory/MEMORY.md`, `docs/general/ROADMAP.md` en `docs/superpowers/specs/2026-04-26-foundation-mvp-design.md`. Daarna: roep de superpowers:writing-plans skill aan om een implementatieplan te maken. Daarna kan deze HANDOFF.md weg."

## Wat is besloten (zeer kort — details in spec)
- **Stack:** vanilla HTML/CSS/JS + Supabase + GitHub Pages, PWA
- **Auth:** magic link
- **App-structuur:** SPA met mini hash-router, geen build step
- **Pagina's:** Login, Onboarding, Dashboard, Voeg eten toe (search + portion + new sub-flows), Instellingen
- **Bottom nav:** 3 tabs (Home, Voeg toe, Instellingen)
- **Visuele stijl:** dark sporty, fluo-groene accent (#00e676)
- **Datamodel:** `profiles` (1-op-1 met auth.users), `products` (gedeeld tussen alle gebruikers, RLS regelt edit-rechten), `entries` (kcal als snapshot, `date` als losse kolom)
- **Doelen:** handmatig in MVP (Mifflin-St Jeor formule later)
- **Maaltijdtypes:** ontbijt/lunch/diner/snack
- **Visuele feedback:** 3 staten (groen onder doel / oranje boven doel / rood boven max)
- **Onboarding:** verplicht setup-scherm bij eerste login

## Conventies vastgelegd in CLAUDE.md
- **Memory transparantie:** Claude meldt PROACTIEF waar hij iets opslaat
- **Devcontainer rebuild waarschuwing:** Claude waarschuwt voordat een rebuild ter sprake komt
- Communicatie NL, code/commits/DB EN
- Git commits per logische stap
- CHANGELOG.md + ROADMAP.md bijwerken vóór commit

## Memory die persisteert
- `feedback_devcontainer_rebuild.md` — Waarschuwing-regel voor rebuild
- `project_database_split.md` — Prod=dev voor nu, splitsen later
- `user_language.md` — NL communicatie, EN code

## Open punten / aandachtspunten voor implementatie-fase
- **Supabase project moet nog aangemaakt worden** — eerste handeling in implementatieplan
- **Anon key + URL** moeten in `src/js/config.js` (publiek mag, RLS regelt veiligheid)
- **GitHub Pages** moet aangezet worden in repo settings na deploy.yml
- **PWA icons** (192px + 512px) moeten gemaakt worden
- **Mockups** uit deze brainstorm staan in `.superpowers/brainstorm/*/content/` (gitignored, niet bewaard) — alleen als referentie tijdens implementatie nuttig

## Niet vergeten
- Visual companion server stopt na 30 min inactiviteit — restart kan met `scripts/start-server.sh` als je weer mockups nodig hebt
- Sub-projecten C-G staan in ROADMAP voor latere brainstorm-cycli (één voor één, nooit alles tegelijk)

## Relevante git commits van deze sessie
- `2431ff4` — Set up project context, roadmap and conventions
- `72b1cdb` — Add design spec for Foundation + Solo tracking MVP
