## Plugins
- Gebruik altijd de **superpowers** plugin voor brainstorming, planning, debugging en code review

## Projectstructuur
- `src/` - Broncode
- `tests/` - Unit tests
- `docs/` - Documentatie

## Werkwijze
- Alle code/comments moeten altijd in het Engels. Wij praten onderling wel altijd in het Nederlands met elkaar.
- Schrijfcode en database tabellen in het Engels
- Vraag uitleg als iets onduidelijk is, zodat ik ervan leer
- Houd code simpel en leesbaar

## Git
- Doe regelmatig een commit na elke logische stap of wijziging
- Gebruik duidelijke, beschrijvende commit messages in het Engels
- Waarschuw proactief als de gebruiker het gesprek wil afsluiten of wil switchen terwijl er nog uncommitted changes zijn

## Changelog
- Werk ~/docs/general/CHANGELOG.md bij vlak voor een commit
- Bundel meerdere wijzigingen van dezelfde dag onder één datum
- Werk ook ~/docs/general/ROADMAP.md bij als een feature is afgerond
- **ROADMAP.md structuur**: open items bovenaan met volledige omschrijving, afgeronde items compact samengevat in een tabel onderaan onder het kopje `## Afgerond ✅`. Pas deze structuur toe bij elke wijziging van ROADMAP.md.
- Bij het afronden van een feature (finishing-a-development-branch): altijd eerst CHANGELOG.md en ROADMAP.md bijwerken, dan pas pushen of mergen

## Development
This is a vanilla HTML/CSS/JavaScript web application. There is no build step.

**Local development:** Open `src/index.html` with the Live Server VS Code extension (port 5500). The devcontainer forwards ports 5500 and 3000.

**Formatting:** Prettier is configured via the VS Code extension. No config file exists, so defaults apply.

## Verboden acties
- Pas NOOIT .devcontainer/devcontainer.json aan zonder expliciete toestemming
- Pas NOOIT .devcontainer/post-create.sh aan zonder expliciete toestemming