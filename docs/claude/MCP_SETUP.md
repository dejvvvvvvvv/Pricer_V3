# MCP Setup — ModelPricer / Pricer V3 (Context7 + Brave)

Tento dokument tě provede nastavením MCP serverů tak, aby je **Claude Code** mohl používat přímo v projektu.

## Co tím získáš
- **Context7**: aktuální dokumentace a příklady (lepší než “googlení”) — používej jako *první volbu*.
- **Brave Search**: webové vyhledávání — používej *jen když nutné* a loguj použití do `docs/claude/BRAVE_USAGE_LOG.md`.

---

## 0) Předpoklady

### 0.1 Máš nainstalovaný Claude Code CLI
V terminálu zkus:

```bash
claude --help
```

Pokud příkaz neexistuje, nainstaluj Claude Code podle oficiální dokumentace.

### 0.2 Node.js (kvůli Brave MCP)
Brave MCP server běží přes `npx` a vyžaduje Node.js.
Ověření:

```bash
node -v
npm -v
npx -v
```

---

## 1) Získání API klíčů

### 1.1 Context7 API key (doporučeno)
Context7 key není vždy povinný, ale **doporučuje se** (lepší rate limits). Vytvoř si ho v dashboardu Context7.

### 1.2 Brave Search API key (povinné)
Vytvoř si Brave Search API účet, zvol plán a v developer dashboardu vygeneruj API klíč.

---

## 2) Přidej konfigurační soubory do projektu

V kořeni repozitáře musí být:
- `.mcp.json`
- `.env.mcp.example` (jen vzor)
- `scripts/load-mcp-env.ps1`
- `docs/claude/MCP_SETUP.md`
- `docs/claude/BRAVE_USAGE_LOG.md`

---

## 3) Vytvoř si `.env.mcp`

V kořeni projektu:

```bash
# Windows PowerShell
Copy-Item .env.mcp.example .env.mcp
```

Otevři `.env.mcp` a doplň:

```env
CONTEXT7_API_KEY=...
BRAVE_API_KEY=...
```

---

## 4) Načti env proměnné do terminálu

### Windows (PowerShell)
Ve stejném terminálu, kde budeš spouštět `claude`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/load-mcp-env.ps1
```

Skript nastaví proměnné jen pro **aktuální terminal session**.

---

## 5) Ověř, že Claude vidí MCP servery

### 5.1 Kontrola mimo Claude (CLI)

```bash
claude mcp list
```

### 5.2 Kontrola přímo uvnitř Claude Code
V Claude Code napiš:

```
/mcp
```

---

## 6) Rychlý test (doporučený)

### 6.1 Context7 test
Zeptej se v Claude Code např.:

> "Jak ve Vite nastavím alias pro importy? use context7"

### 6.2 Brave test
Zeptej se např.:

> "Najdi oficiální dokumentaci k Brave Search MCP Server env vars." 

Až Claude použije Brave tool, **zapiš 1 query = 1 použití** do `docs/claude/BRAVE_USAGE_LOG.md`.

---

## 7) Nejčastější problémy

### “Brave server failed to start”
- Není nastaven `BRAVE_API_KEY`
- Nejde `npx` (špatná instalace Node.js)

### “Claude se pořád ptá na povolení serveru”
- U project-scoped serverů je to normální bezpečnostní prompt.
- Reset povolení:

```bash
claude mcp reset-project-choices
```

---

## 8) Bezpečnost
- Nikdy necommituj `.env.mcp` (repo už ignoruje `.env.*`).
- `.mcp.json` má používat `${...}` proměnné, aby klíče nebyly natvrdo v repu.

