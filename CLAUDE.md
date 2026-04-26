## Project context
Unfat is een mobile-first calorietracker web app (PWA).
Doel: de gebruiker helpen afvallen door dagelijkse calorie-inname bij te houden,
met motivatie via badges/competities en sociale features (vrienden).

## Tech stack
- Frontend: vanilla HTML/CSS/JavaScript (geen framework)
- Backend: Supabase (PostgreSQL + Auth + Row Level Security)
- Hosting: GitHub Pages (statisch)
- PWA: installeerbaar op homescreen, web push notifications
- Externe API: Open Food Facts (CORS-enabled, direct vanuit browser)

## Communicatie
- Communicatie in het Nederlands, code/comments/commits/database in het Engels
- Om tokens te besparen: zo min mogelijk woorden, blijf wel duidelijk
- Vraag uitleg als iets onduidelijk is, zodat de gebruiker ervan leert
- Houd code simpel en leesbaar

## Memory transparantie
Wanneer je zelf voorstelt om iets op een later moment op te pakken (een feature uitstellen, een uitbreiding voor later plannen, een verbetering die nu niet past, etc.), leg het PROACTIEF vast en vermeld expliciet WAAR. De gebruiker hoeft niet te vragen of je het onthoudt — ga er niet vanuit dat hij dat zelf bijhoudt. Opslagplekken:
- Toekomstige features / open werk → `docs/general/ROADMAP.md`
- Design beslissingen per sub-project → `docs/superpowers/specs/*.md`
- Werkwijze of context die niet in code/docs staat → memory (`/home/node/.claude/projects/-workspaces-Unfat/memory/`)
- Project-brede regels of conventies → `CLAUDE.md`

## Plugins
- Gebruik altijd de **superpowers** plugin voor brainstorming, planning, debugging en code review

## Projectstructuur
- `src/` - Web app (HTML, CSS, JS) — wordt vanaf src/ gehost
- `docs/general/` - Algemene documentatie (CHANGELOG, ROADMAP)
- `docs/superpowers/specs/` - Design documenten per sub-project (uit brainstorming skill)
- `supabase/` - Database migrations en schema (komt later)

## Database
- Eén Supabase project voor dev en prod (later splitsen)
- Tabellen en kolommen in snake_case en Engels
- Row Level Security (RLS) verplicht op alle tabellen
- Anon key mag in client code (Supabase design)
- Schema-wijzigingen versioneren in `supabase/migrations/`

## Git
- Doe regelmatig een commit na elke logische stap of wijziging
- Gebruik duidelijke, beschrijvende commit messages in het Engels
- Waarschuw proactief als de gebruiker het gesprek wil afsluiten of wil switchen terwijl er nog uncommitted changes zijn

## Changelog & Roadmap
- Werk `docs/general/CHANGELOG.md` bij vlak voor een commit
- Bundel meerdere wijzigingen van dezelfde dag onder één datum
- Werk ook `docs/general/ROADMAP.md` bij als een feature is afgerond
- **ROADMAP.md structuur**: open items bovenaan met volledige omschrijving, afgeronde items compact samengevat in een tabel onderaan onder het kopje `## Afgerond ✅`
- Bij het afronden van een feature (finishing-a-development-branch): altijd eerst CHANGELOG.md en ROADMAP.md bijwerken, dan pas pushen of mergen

## Development
This is a vanilla HTML/CSS/JavaScript web application. There is no build step.

**Local development:** Open `src/index.html` with the Live Server VS Code extension (port 5500). The devcontainer forwards ports 5500 and 3000.

**Formatting:** Prettier is configured via the VS Code extension. No config file exists, so defaults apply.

**Testing:** Geen geautomatiseerde tests opgezet. Handmatig testen in browser via Live Server. Pas tests opzetten als blijkt dat we iets vaak breken.

## Devcontainer
- Pas NOOIT `.devcontainer/devcontainer.json` aan zonder expliciete toestemming
- Pas NOOIT `.devcontainer/post-create.sh` aan zonder expliciete toestemming
- Waarschuw de gebruiker proactief als er een devcontainer rebuild ter sprake komt, zodat hij eerst kan verifiëren of belangrijke state behouden blijft (auth credentials, MEMORY in `/home/node/.claude/`, ccstatusline settings, etc.)
