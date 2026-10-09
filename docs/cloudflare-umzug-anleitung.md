# Cloudflare-Umzug: Anleitung (Stand 9. Oktober 2026, Phase 2 umgeschaltet)

> Update 9. Oktober: Phase 2 ist umgeschaltet. Nutzerdaten liegen in D1 `cynosure`, der Login läuft über den Worker (Cookie `cyn_session`, Geheimnis `SESSION_SECRET`). Supabase wird von der Seite nur noch für Event-Screenshots genutzt. Offen: R2 für Screenshots, danach Supabase Pro kündigen.

Kurz vorab: **Der Umzug ist in zwei Phasen aufgeteilt. Phase 1 ist fertig und läuft.** Phase 2 (Login und Nutzer-Tabellen) ist noch nicht gebaut, das ist Programmierarbeit von Claude. Du musst dabei nur wenige Dinge im Dashboard anklicken.

## Phase 1: erledigt (nichts zu tun)
- Datenbank **cynosure-hot** (Cloudflare D1) mit Spielhistorien, Spieldetails, Roster und Ledger.
- Der Worker liest alles daraus (`USE_D1 = "1"` in `wrangler.jsonc`), KV wird dafür nicht mehr gebraucht.
- Die GitHub-Läufe schreiben über eine interne Schnittstelle des Workers (Secret `HOT_API_SECRET`, in GitHub und im Worker gesetzt).
- Supabase hält davon nur noch eine Kopie als Rückfall.

### Prüfen, ob alles da ist (optional, je 1 Minute)
1. Cloudflare-Dashboard → **Storage & Datenbanken → D1** → `cynosure-hot` ist da und enthält die Tabellen `member_games`, `game_detail`, `blobs`.
2. **Workers & Pages → cynosure → Einstellungen → Variablen und Geheimnisse**: Variable `USE_D1` = `1`, Geheimnis `HOT_API_SECRET` vorhanden.
3. GitHub → Repository **ZilkaTV/cynosure → Settings → Secrets and variables → Actions**: `HOT_API_SECRET` vorhanden.
4. GitHub → **Actions**: die letzten Läufe sind grün.

### Notfall: zurück zu Supabase (nur Phase 1)
1. In `wrangler.jsonc` `"USE_D1": "0"` setzen, committen, pushen.
2. Danach liest der Worker wieder KV und Supabase. Die Supabase-Kopie ist höchstens ein paar Minuten alt.

## Phase 2: noch offen (Login und Nutzer-Tabellen)
Das macht Claude, in Schritten, jeder Schritt einzeln deploybar. Dein Anteil steht jeweils dabei.

| Schritt | Was passiert | Dein Anteil |
|---|---|---|
| 1. Export | Alle Supabase-Tabellen werden als Datei gesichert, bevor etwas umgestellt wird. | Nur bestätigen, dass Supabase Pro noch aktiv ist (Export braucht Zugriff). |
| 2. Tabellen in D1 | Mitglieder, Reaktionen, Quests, Events, Speedruns, Game Nights, Umfrage und die übrigen Nutzer-Tabellen werden in D1 angelegt und importiert. | Keiner. |
| 3. API im Worker | Für jede Tabelle ein Endpunkt mit denselben Zugriffsregeln wie bisher (nur eigene Zeilen, Inner Circle, Admin). | Keiner. |
| 4. Login | Die Discord-Anmeldung läuft schon über unseren Worker (`/api/auth/discord/callback`). Neu: der Worker stellt selbst das Anmelde-Cookie aus, nicht mehr Supabase. | Keiner. Die Discord-Redirect-URL (`https://cynclan.com/api/auth/discord/callback`) bleibt gleich. Das Signier-Geheimnis setzt Claude selbst. |
| 5. Seite umstellen | Registrierung, Reaktionen, Quests, Speedrun, Events, Umfrage, Game Nights, Bumps nacheinander auf die neue API. | Zwischendurch kurz testen (eine Checkliste kommt jeweils). |
| 6. Screenshots (R2) | Event-Screenshots (etwa 22 MB) ziehen in einen R2-Speicher. | **R2 aktivieren:** Dashboard → Storage & Datenbanken → R2 → aktivieren. Cloudflare verlangt dafür meist eine hinterlegte Zahlungsmethode, der Free-Bereich (10 GB) kostet nichts. |
| 7. Umschalten | Zeitpunkt festlegen, alle melden sich einmal neu mit Discord an. | Ankündigung im Discord, 1 Minute. |
| 8. Aufräumen | Supabase eine Woche nur lesend lassen, dann abschalten. | **Supabase Pro kündigen** und das Projekt löschen (siehe unten). |

Zeitbedarf Phase 2: etwa 3 bis 5 Arbeitstage. Die Seite bleibt dabei die ganze Zeit online.

## Supabase Pro kündigen (erst nach dem 12. Oktober)
1. Vorher im Supabase-Dashboard unter **Usage → Egress** prüfen: Tagesverbrauch unter etwa 170 MB. Und **Log Ingestion** unter 1 GB im Monat.
2. Organisation **Cynosure → Billing → Change subscription plan → Free**.
3. Bestätigen. Bei einer Rückstufung bekommst du nicht automatisch Geld zurück, die Gebühr für den laufenden Zeitraum ist bezahlt.
4. Erst nach dem vollständigen Umzug (Phase 2) das Projekt löschen: **Project Settings → General → Delete project**.

## Wenn etwas schiefgeht
- Seite zeigt keine Daten: GitHub → Actions, ob die Läufe grün sind. Dann Cloudflare → Workers → cynosure → **Logs/Echtzeit**.
- Mails zum KV-Limit: sollten ausbleiben. Kommt eine, schick Betreff und Text.
- Supabase meldet wieder Sperre (HTTP 402): der Worker pausiert die Läufe selbst. Seite bleibt mit den D1-Daten erreichbar, nur Login und Nutzer-Funktionen gehen dann nicht.
