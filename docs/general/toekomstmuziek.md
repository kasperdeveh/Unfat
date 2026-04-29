# Toekomstmuziek

Ideeën die voor de huidige fase van Unfat (mobile-first PWA op GitHub Pages) niet praktisch of relevant zijn, maar wel waardevolle context bevatten voor latere beslissingen.

Verschilt van [ROADMAP.md](./ROADMAP.md) sectie G "Wensenlijst" doordat dit dieper inzoomt op één onderwerp inclusief onderzoek en context — niet als directe uitbreiding van de huidige stack bedoeld, maar als bewaarplaats voor "ooit, misschien".

---

## Native iPhone-app

**Status:** geparkeerd op 2026-04-29.

**Idee:** Unfat ombouwen of opnieuw bouwen als native iOS-app, naast (of ter vervanging van) de huidige PWA.

**Drempel nu:** geen Apple Developer-account ($99/jaar) en geen ervaring met Swift/SwiftUI. We beginnen daarom laagdrempelig met een PWA.

**Waarom dit interessant is:**
- Echte native ervaring (geen browser-chrome, betere performance, push-notificaties zonder PWA-beperkingen op iOS Safari).
- Camera + barcode-API's zijn op iOS native veel volwassener.
- **CORS bestaat niet in native apps** — dus alle "supermarkt-API"-paden die voor de PWA dichtzitten (zie sectie hieronder) komen weer open.
- Toegang tot HealthKit (gewicht-tracking, activiteit-data) wordt mogelijk en sluit aan bij ROADMAP G "doel-berekening via Mifflin-St Jeor formule".

**Mogelijke routes:**
- Native Swift/SwiftUI vanaf scratch.
- React Native of Capacitor om de huidige web-codebase als native app te bundelen (laagdrempeliger, behoudt JavaScript).
- Hybride: PWA blijft "online versie", iOS-app is een aparte release.

---

## Supermarkt-API integratie (Albert Heijn, Jumbo, Dirk, …)

**Status:** geparkeerd op 2026-04-29 — niet haalbaar in huidige PWA-setup, wél kandidaat voor latere native iOS-app of bij eigen backend.

**Doel:** brand-specifieke productdata (bv. "Coca-Cola Zero", "AH-volkoren brood", "Magnum Almond") direct uit een Nederlandse supermarkt-catalogus halen, in plaats van te leunen op user-submitted Open Food Facts-data of NEVO's generieke records.

### Waarom het in de huidige PWA niet werkt

**Kernprobleem: CORS.** De browser blokkeert standaard requests vanaf `unfat.kasper.dev` (of waar Unfat ook draait) naar `ah.nl`, `jumbo.nl`, etc., omdat die supermarkten geen `Access-Control-Allow-Origin`-header voor onze domain returnen. Dit is geen bug — het is een browser-security-mechanisme dat niet te omzeilen is in client-side JavaScript.

**Daarnaast:**
1. **Geen officiële publieke API.** AH, Jumbo, Dirk, Lidl, Plus, Aldi — niemand publiceert er één.
2. **Reverse-engineerd = juridisch grijs.** Alle bekende oplossingen scrapen interne endpoints (in strijd met ToS).
3. **Endpoints zijn fragiel.** AppiePy stierf in juni 2021 toen AH het internal endpoint sloot. `shopscraper-api` gearchiveerd 2019. `wvengen` abandoned. Patroon: zodra een scraper populair wordt, sluit de winkel het.
4. **Anti-bot.** Kale `fetch`-calls krijgen 403; browser-achtige headers + cookies zijn nodig.

**Belangrijk:** dit geldt voor *alle* Nederlandse supermarkten gelijkmatig. Switchen van AH naar Jumbo of Dirk lost niets op — zelfde root cause, zelfde issues.

### Wanneer dit wél zou werken

| Setup | Werkt? | Toelichting |
|-------|--------|-------------|
| **Web-app op GitHub Pages (huidige Unfat)** | ❌ | Pure client-side, CORS blokkeert |
| **Web-app met eigen backend-server** | ✅ | Server-to-server kent geen CORS — vergelijk: een collega bouwde dit in **C#/.NET** met server-side calls naar AH |
| **Native iOS/Android-app** | ✅ | Native apps hebben geen browser → geen CORS |
| **Desktop-script (Python/Node CLI)** | ✅ | Geen browser betrokken |
| **Browser-extensie** | ✅ | Heeft elevated permissions |
| **Supabase Edge Function als proxy** | ✅ (technisch) | Mini-backend in de cloud — zie tussenoplossing hieronder |

### Tussenoplossing: Supabase Edge Function als proxy

Technisch haalbaar zonder de hele stack te verbouwen: een Edge Function (Deno) op Supabase fungeert als mini-backend. Flow: browser → Edge Function → ah.nl → terug naar browser. Lost CORS én anti-bot-detectie op.

**Bezwaren die blijven:**
- Schending van AH's voorwaarden (juridisch grijs).
- AH kan de Edge Function-IP blokkeren.
- AH-zoekresultaten bevatten geen voedingswaarden per product → 2 calls per product nodig (search + detail) → trager + sneller geblokkeerd.
- Edge Function quota (Supabase free tier: ~500k invocations/maand) raakt sneller op bij debounced search-as-you-type.
- Onderhoud onvoorspelbaar (precedent: AppiePy 2021 één-pennestreep dood).

**Marginale winst** t.o.v. het gekozen NEVO + barcode-OFF-pad: brand-precisie binnen één variant (bv. AH-Huismerk Cola vs. Coca-Cola), wat meestal <5% kcal-verschil is. Variant-precisie (cola vs. cola light) zit al in NEVO.

### Bekende oplossingen / referentiemateriaal

**Voor AH (unofficial wrappers / scrapers):**
- [LouayCoding/albert-heijn-api](https://github.com/LouayCoding/albert-heijn-api) — JS, MIT, claimt CORS-enabled, self-hosted server
- [agentcooper/albert-heijn](https://github.com/agentcooper/albert-heijn) — losse scraper
- [DanielNeresDosSantos/albert-heijn-api](https://github.com/DanielNeresDosSantos/albert-heijn-api) — vergelijkbare wrapper
- [RinseV/albert-heijn-wrapper](https://github.com/RinseV/albert-heijn-wrapper) — Node.js wrapper
- [rkalis/AppiePy](https://github.com/rkalis/AppiePy) — Python; **archived juni 2021** (AH sloot internal endpoint)

**Voor AH (commerciële services):**
- [Pepesto AH-API](https://www.pepesto.com/supermarkets/albert-heijn/) — betaald, beheerd, real-time
- [ShoppingScraper](https://shoppingscraper.com/scrapers/ah) — scraper-as-a-service, betaald
- [Apify Albert Heijn actor](https://apify.com/harvestedge/albert-heijn-api)

**Endpoints die historisch werkten:**
- Public webshop search: `https://www.ah.nl/zoeken/api/products/search?query=appel` (vereist browser-headers + cookies)
- Mobile API: `https://api.ah.nl/mobile-services/product/search/v2?query=...&sortOn=RELEVANCE` met header `User-Agent: Appie/8.22.3` (OAuth-token nodig)
- [Mobile API gist (jabbink)](https://gist.github.com/jabbink/8bfa44bdfc535d696b340c46d228fdd1) — receipts en meer

**Voor Jumbo + AH gecombineerd:**
- [bartmachielsen/SupermarktConnector](https://github.com/bartmachielsen/SupermarktConnector) — Python, AH + Jumbo, mobile API
- [wvengen/shopscraper-api](https://github.com/wvengen/shopscraper-api) — Ruby, AH + Jumbo, **archived 2019**

**Dirk, Lidl, Plus, Aldi:** geen substantiële hobby-projecten gevonden. Online catalogi minder volledig dan AH/Jumbo, dus minder interessant zelfs als toegang mogelijk zou worden.

### Wat we nu doen i.p.v.

Voor sub-project F (ROADMAP) kiezen we — bij gebrek aan supermarkt-toegang vanuit een statische PWA — voor:

- **NEVO** (RIVM Nederlands Voedingsstoffenbestand, versie 2025/9.0) als seed voor de gedeelde producten-database (~2300 generieke NL-staples met kcal + macro's).
- **Open Food Facts via barcode-scanning** voor brand-specifieke producten (camera scant EAN → OFF-lookup).
- **Handmatige invoer** als laatste vangnet.

Dat dekt naar schatting >95% van wat een NL-gebruiker logt, zonder afhankelijkheid van een fragiele scraper.

### Heroverweegmoment

Deze sectie wordt relevant zodra één van het volgende verandert:
- We een eigen backend hebben (b.v. een Node/Express-server, of een ingerichte Supabase Edge Function-laag).
- We een native iOS/Android-app gaan bouwen (zie sectie hierboven).
- Een Nederlandse supermarkt publiceert een officiële, CORS-enabled API (onwaarschijnlijk; mogelijk gedreven door EU-regelgeving rond data-portabiliteit).

In die gevallen: NEVO + OFF blijven de basis-data; supermarkt-API is een **aanvulling** voor brand-precisie, niet een vervanging.
