# Výběr jména (Mliko × Danča)

Statická stránka (HTML/JS) + Supabase jako databáze. Hosting: GitHub Pages.

## 1) Databáze (Supabase, zdarma)
1. https://supabase.com → přihlásit se přes GitHub → New project (region Frankfurt).
2. SQL Editor → New query → vlož obsah `supabase.sql` → Run.
3. Project Settings → API → zkopíruj **Project URL** a **anon public** key do `supabase-config.js`.

Pozor: free projekty Supabase se po ~7 dnech bez aktivity pozastaví (v dashboardu jde jedním klikem obnovit). Při běžném používání to nehrozí.

## 2) Hosting na GitHub Pages
1. Na GitHubu vytvoř repozitář, nahraj všechny soubory z této složky.
2. Settings → Pages → Source: `main` / root → Save.
3. Za minutu běží na `https://<uživatel>.github.io/<repo>/`.

## 3) První spuštění
Otevři stránku, vyber Mliko, klikni „Vytvořit pavouka" (jednou). Danča si pak vybere „Danča".

## Jak to funguje
- 287 jmen → předkolo (31 zápasů, 62 jmen) + 256členný pavouk.
- Postoupí jméno, na kterém se shodnete oba. Neshoda (1:1) = červený zápas.
- Změníš-li hlas a tím se změní postupující, hlasy v následujícím zápase se vynulují.
- Anon klíč není tajný a pravidla jsou otevřená; ochrana je jen neznalostí URL.
