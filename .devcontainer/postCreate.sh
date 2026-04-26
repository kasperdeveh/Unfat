#!/bin/bash
set -e

echo "=== Post-create setup gestart ==="

# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Migreer naar native installer
/usr/local/share/npm-global/bin/claude install || echo "WAARSCHUWING: Native installer mislukt, npm versie wordt gebruikt"

# Vervang npm claude symlink/wrapper met native binary zodat 'claude' altijd de native versie is
NPM_CLAUDE_BIN="/usr/local/share/npm-global/bin/claude"
NATIVE_CLAUDE=$(readlink -f /home/node/.local/bin/claude 2>/dev/null || true)
echo "Native binary: $NATIVE_CLAUDE"
if [ -n "$NATIVE_CLAUDE" ] && [ -x "$NATIVE_CLAUDE" ]; then
    ln -sf "$NATIVE_CLAUDE" "$NPM_CLAUDE_BIN"
    echo "npm claude symlink → native binary"
else
    echo "WAARSCHUWING: Symlink fix overgeslagen (native binary niet gevonden)"
fi

# Voeg de officiële marketplace expliciet toe — `claude install` registreert deze niet non-interactief
claude plugin marketplace add anthropics/claude-plugins-official || echo "Marketplace al geregistreerd of toevoegen mislukt"

# Haal de marketplace plugin-lijst op zodat superpowers vindbaar is
claude plugin marketplace update claude-plugins-official || true

# Installeer superpowers plugin
claude plugin install superpowers@claude-plugins-official || echo "WAARSCHUWING: Superpowers niet geinstalleerd. Na inloggen handmatig uitvoeren: claude plugin install superpowers@claude-plugins-official"

# Merge custom settings into ~/.claude/settings.json
# (keeps any settings already written by the plugin install, adds ours on top)
mkdir -p "$HOME/.claude"
node -e "
  const fs = require('fs');
  const dest = process.env.HOME + '/.claude/settings.json';
  const current = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : {};
  const patch = JSON.parse(fs.readFileSync('.devcontainer/claude-settings.json', 'utf8'));
  fs.writeFileSync(dest, JSON.stringify({ ...current, ...patch }, null, 2));
  console.log('Claude settings applied.');
"

# Link ccstatusline settings to the repo file so changes in the repo are picked up automatically
mkdir -p "$HOME/.config/ccstatusline"
ln -sf "$(pwd)/.devcontainer/ccstatusline-settings.json" "$HOME/.config/ccstatusline/settings.json"
echo "ccstatusline settings linked."

# Git configuration
git config --global user.name "Kasper"
git config --global user.email "kasperheijnen@hotmail.com"

echo "=== Post-create setup voltooid ==="