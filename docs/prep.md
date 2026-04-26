# Devcontainer Setup — Gesprek 26 april 2026

## Doel

Zorg dat na elke devcontainer rebuild automatisch worden hersteld:
- Claude Code (CLI)
- Superpowers plugin
- ccstatusline met eigen instellingen

---

## Aangemaakt / gewijzigd

### `.devcontainer/devcontainer.json`
`postCreateCommand` gewijzigd van `npm install -g @anthropic-ai/claude-code` naar:
```json
"postCreateCommand": "bash .devcontainer/postCreate.sh"
```

### `.devcontainer/postCreate.sh` (nieuw)
Script dat na elke rebuild draait:
1. Installeert Claude Code via `npm install -g @anthropic-ai/claude-code`
2. Migreert naar de native binary via `claude install`
3. Vervangt de npm claude symlink met de native binary (zodat auto-update werkt en het migratiebericht verdwijnt)
4. Voegt de marketplace expliciet toe via `claude plugin marketplace add anthropics/claude-plugins-official` — `claude install` doet dit non-interactief **niet**, dus zonder deze stap faalt de plugin-install
5. Update de marketplace en installeert de superpowers plugin via `claude plugin install superpowers@claude-plugins-official`
6. Merget `claude-settings.json` in `~/.claude/settings.json` (behoudt instellingen die plugin zelf schrijft)
7. Maakt een symlink: `~/.config/ccstatusline/settings.json` → `$(pwd)/.devcontainer/ccstatusline-settings.json`

### `.devcontainer/claude-settings.json` (nieuw)
Gewenste Claude Code instellingen die na rebuild worden toegepast:
```json
{
  "theme": "dark",
  "statusLine": {
    "type": "command",
    "command": "npx -y ccstatusline@latest",
    "padding": 0
  }
}
```

### `.devcontainer/ccstatusline-settings.json` (nieuw)
Volledige ccstatusline widget-configuratie (version 3). Bevat vier rijen:
- Rij 1: model, thinking-effort, skills, output-style
- Rij 2: context-percentage, session-usage, weekly-usage, session-cost, reset-timer, session-clock
- Rij 3: git-worktree, git-branch, current-working-dir
- Rij 4: tokens-cached, tokens-input, tokens-output, tokens-total

Via de symlink wordt dit bestand direct gebruikt door ccstatusline — wijzigingen zijn meteen actief zonder rebuild.

---

## Aandachtspunten na rebuild

- **Authenticatie**: `~/.claude/.credentials.json` verdwijnt bij rebuild. Opnieuw inloggen via `claude` of `/login`.
- **Plugin install non-interactief**: Als `claude plugin install` faalt tijdens postCreate (bijv. auth vereist), handmatig uitvoeren na inloggen:
  ```bash
  claude plugin marketplace update claude-plugins-official
  claude plugin install superpowers@claude-plugins-official
  ```
- **Waarom `claude install` nodig is:** Migreert naar de native binary zodat auto-update werkt en het migratiebericht verdwijnt. Let op: `claude install` registreert in een non-interactieve postCreate run **geen** marketplaces — die stap moeten we expliciet zelf doen.
- **Waarom `marketplace add` nodig is:** Zonder geregistreerde marketplace faalt `claude plugin marketplace update claude-plugins-official` met "Marketplace not found", waarna de plugin-install ook faalt. `claude plugin marketplace add anthropics/claude-plugins-official` registreert de officiële marketplace direct.
- **Waarom `marketplace update` nodig is:** Na registratie is de plugin-lijst nog leeg — `claude plugin marketplace update claude-plugins-official` haalt de lijst op zodat `superpowers` vindbaar is. Zonder deze stap faalt de install met "Plugin not found".
- **Symlink fix:** De check `-L "$NPM_CLAUDE_BIN"` (controleer of het een symlink is) is verwijderd omdat npm soms een wrapper-script neerzet i.p.v. een symlink. De fix draait nu altijd zolang de native binary bestaat.
- Als de plugin toch faalt, handmatig uitvoeren na inloggen:
  ```bash
  claude plugin marketplace update claude-plugins-official
  claude plugin install superpowers@claude-plugins-official
  ```
