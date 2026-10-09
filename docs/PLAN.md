# Schlummer – Umsetzungsplan

Spezifikation: `docs/SPEC.md`. Ziel: ein Userscript `dist/schlummer.user.js`,
gebaut aus kleinen ES-Modulen, mit Unit-Tests für das Modell und Live-Tests
in Chrome, Abnahme in Safari/Userscripts.

## Dateien

| Datei | Verantwortung |
|---|---|
| `src/model.js` | Reine Funktionen: Plan, Fortschritt, Folgen-Budget, Verlängerung, Startverzögerung, Lautstärkekurve |
| `src/settings.js` | Standardwerte, Laden/Speichern (GM.* mit localStorage-Fallback) |
| `src/overlay.js` | Schwarze Dimm-Ebene und Blaulicht-Ebene, Vollbild-Umhängen |
| `src/panel.js` | Bedienpanel im Player |
| `src/session.js` | Zustand einer Schlafmodus-Sitzung (Plan + Basis-Lautstärke + Ende) |
| `src/controller.js` | Verdrahtung: Video finden, Folgenwechsel, Interaktion, Skip-Knöpfe, Ausgaben anwenden |
| `src/adapters/netflix.js`, `src/adapters/disney.js` | Anbieter-Selektoren |
| `src/main.js` | Einstieg: Adapter wählen, Controller starten |
| `src/header.txt` | Userscript-Metadaten |
| `build.mjs` | esbuild → `dist/schlummer.user.js` |
| `test/model.test.js` | Tests für `model.js` (node --test) |

## Schritte

1. Scaffold (package.json, esbuild, Test-Runner).
2. `model.js` testgetrieben: Plan, Fortschritt, Folgenwechsel (fertig / übersprungen), Verlängerung, Startverzögerung, Lautstärke (Gehör / Linear, Mindestlautstärke, Rebase).
3. `settings.js`, `overlay.js`, `panel.js`, `session.js`, `controller.js`, Netflix-Adapter, `main.js`.
4. Build, in Chrome auf Netflix einspielen, Selektoren prüfen, Fehler beheben. Schleife bis stabil.
5. Disney+-Adapter an der Live-Seite ermitteln, testen.
6. README mit Installationsanleitung, Git-Repo, GitHub `konradwohlthat-gif/schlummer`, Update-URL eintragen.
7. Checkliste für die Safari-Abnahme.

## Erkenntnisse aus dem Live-Test (Netflix, Chrome)

- `video.currentTime` darf auf Netflix nie direkt gesetzt werden: Der Player
  bricht mit Fehler M7375 ab. Das Skript liest nur. Zum Spulen im Test wird
  die interne Player-API benutzt (`netflix.appContext…videoPlayer.seek`).
- Beim Spulen entfernt Netflix das `<video>`-Element kurzzeitig und legt ein
  neues an. Der Controller behandelt das als dasselbe Video (URL unverändert).
- Entwicklung: minifiziertes Bundle einmal in `localStorage['schlummer.dev']`
  ablegen, nach Reload mit `eval(localStorage.getItem('schlummer.dev'))` laden.

### Bestätigte Netflix-Selektoren (Live-Test 2026-10-09)

- Intro: `[data-uia="player-skip-intro"]` (erscheint z. B. bei 2:10, Klick springt 28 s)
- Abspann: `[data-uia="next-episode-seamless-button"]` neben `watch-credits-seamless-button`,
  erscheint ca. 24 s vor Ende
- Serienende: `[data-uia="postplay-background-play-trailer"]`, `postplay-back-to-browse`
- Niemals klicken: `[data-uia="control-next"]` (Weiter-Knopf der Steuerleiste, gleicher Text)
- Netflix übernimmt `video.muted`/`video.volume` in seinen Zustand und legt beim
  Folgenwechsel neue `<video>`-Elemente an: Wiederherstellung nach dem Ausschalten
  muss einige Sekunden auf neue Elemente nachgezogen werden.
- Unverifiziert: `[data-uia="interrupt-autoplay-continue"]` („Schaust du noch?").

### Bestätigte Disney+-Struktur (Live-Test 2026-10-09, "hive"-Player)

- Player-URL: `/de-de/play/<uuid>`; Folgenwechsel ändert die UUID.
- Zwei `<video>`: Platzhalter (readyState 0) und echter Player `#hivePlayerN.hive-video`
  (N zählt pro Folge hoch). Auswahl über Klasse, sonst readyState > 0.
- `video.duration` ist Infinity, `video.currentTime` ist nur die Position im
  Puffer-Fenster (seekable ≈ 60 s). Absolute Position und Dauer stehen im
  Fortschrittsregler: `main-app-controls-overlay` → Shadow DOM → `[aria-valuemax]`
  (Sekunden) / `aria-valuenow`. Die Leiste wird nur bei Mausbewegung gerendert
  und lässt sich per synthetischem `mousemove` auf `pointer-actions` wecken.
- Direktes Setzen von `currentTime` wird ignoriert (kein Fehler). Spulen im Test
  per Klick auf den Regler.
- Intro: `skip-overlay` → Shadow DOM → `button` („Intro überspringen").
- Abspann: `end-card-overlay` → Shadow DOM → `button.end-card-overlay__content-tile`
  (Kachel „Als Nächstes"), daneben „Schließen" (nie klicken).
- Intro-Klick live bestätigt (Gachiakuta S1E2: Sprung bei 0:47, danach Position 2:30
  nach 1:40 Laufzeit). Simpsons S9 hat auf Disney+ keine Intro-Marker.
- Steuerleiste nur wecken, wenn eine Sitzung läuft (sonst flackert sie alle 4 s).
- Unverifiziert: `inactivity-overlay` (Inaktivitätsfrage), Serienende.
- Synthetische Ereignisse sind `isTrusted === false` und zählen nicht als Interaktion.

## Stand 2026-10-09 (Ende der ersten Bau- und Testrunde)

Alle Funktionen des Spec inklusive der vier Zusatzfunktionen sind gebaut und
auf Netflix live geprüft; Disney+ bis auf Intro-Klick und Inaktivitätsfrage.
Offen: Abnahme in Safari/Userscripts durch den Nutzer (Checkliste im README).
Netflix „Schaust du noch?" auf Wunsch des Nutzers nicht live getestet; der
Selektor `interrupt-autoplay-continue` steht im Netflix-UI-Bundle
(akiraClient), ebenso `player-skip-intro`, `player-skip-recap`,
`next-episode-seamless-button(-draining)`, `postplay-back-to-browse`,
`postplay-background-play-trailer`. Nebenwirkung der Tests:
Die Netflix-Position von Rick and Morty und die Disney+-Position der Simpsons
(Staffel 9) im Haushaltsprofil wurden durch die Testläufe verschoben.

## Nachtest 2026-10-09, 17:14 bis 17:18 (Disney+, Simpsons S9E14)

- Eine echte Mausbewegung des Nutzers bei 95 % löste „verlaengert via mousemove"
  (+1 Folge) und damit den Folgenwechsel aus: Verhalten wie spezifiziert.
- Neustart der Sitzung im Abspann: „done" um 17:16:24, danach zwei Minuten ohne
  Eingabe stabil (Sitzung aktiv, pausiert, Deckkraft 1, keine URL-Änderung, kein
  Teardown im Protokoll). Aufwachen um 17:18:38 per Mausbewegung, Lautstärke 1,
  Video blieb pausiert. Das frühere Selbst-Beenden trat mit dem aktuellen Stand
  nicht mehr auf; die Schonfrist beim URL-Wechsel und der 3-px-Filter bleiben als
  Absicherung.

## Analyse: einmaliges Selbst-Beenden nach dem Ende (Disney+, Build fe0a20b)

Befund damals: 20 s nach „done" war die Sitzung aus, die URL zeigte bereits die
nächste Folge, die „Als Nächstes"-Karte war offen, Lautstärke 1, Video pausiert.
Disney+ hatte also trotz unseres Pausierens zur nächsten Folge weitergeschaltet.
In den drei späteren Durchläufen (01c42b2 und neuer) schaltete Disney+ im
„done"-Zustand nicht weiter, und die Sitzung blieb jeweils 20 s bis 2 min stabil.

Mögliche Auslöser für `exitSleep` sind nur: Taste Z, Panel-Schalter, Aufwachen
durch echte Eingabe, Teardown beim Verlassen der Player-URL. Eingaben gab es
keine. Bleibt der Teardown: fe0a20b hatte noch keine Schonfrist, ein kurzer
Zwischenzustand der URL beim Disney-Folgenübergang hätte sofort abgebaut. Seit
01c42b2 gilt eine Schonfrist von 6 s, und das Protokoll würde „player-url
verlassen" vermerken. Zusätzlich zählen nur noch echte Mausbewegungen ab 3 px.
Nicht reproduzierbar, Ursache mit hoher Wahrscheinlichkeit abgedeckt; in Safari
beobachten, ob nach dem Ende eine Folge ohne Eingabe weiterläuft.

## Installation in Safari vorbereitet

`dist/schlummer.user.js` liegt in
`~/Library/Containers/com.userscripts.macos.Userscripts-Extension/Data/Documents/scripts/`,
dem Standardordner der Userscripts-App. Verbleibende Schritte für den Nutzer:
Userscripts in Safari aktivieren, für netflix.com und disneyplus.com erlauben,
Seite neu laden.

## Nachstellung des Folgenübergangs im Zustand „Beendet" (2026-10-09, 17:30)

Disney+ Simpsons S9E17: Sitzung im Abspann gestartet, „done" um 17:30:12. Dann
per Skript die „Als Nächstes"-Kachel geklickt, Disney+ wechselte zur nächsten
Folge (neue URL, neues Video-Element hivePlayer4). Ergebnis: Sitzung blieb 20 s
lang „Beendet", neues Video sofort pausiert, Lautstärke 0, Deckkraft 1, kein
Protokolleintrag für Teardown oder URL-Verlassen. Aufwachen um 17:31:22 per
Maus, Lautstärke 1, Video pausiert. Der Übergang, der beim einmaligen
Selbst-Beenden im Spiel war, wird vom aktuellen Stand also sauber überstanden.

## Safari-Meldung „Z öffnet das Panel nicht" (2026-10-09, 19:30 bis 19:50)

Nutzermeldung mit der ersten in den Userscripts-Ordner kopierten Datei
(Stand 4384e1b). Ohne JavaScript-Zugriff auf Safari wurde die isolierte
Skript-Welt mit einer WKWebView nachgestellt (`test/webkit/harness.swift`):

- `window.top === window` gilt in WebKits isolierter Welt; die entfernte
  Prüfung war nicht die Ursache (Entfernung bleibt, da überflüssig).
- Das Bundle läuft dort vollständig: Panel, Einblendung, Z öffnet/schließt,
  mit echtem Tastenereignis.
- Mit hängendem `GM.getValue` blieb das alte Bundle für immer in
  `await loadSettings()` stehen: kein Panel, keine Reaktion. Das passt zum
  Symptom. Seit 4df6bcd greift nach 1,5 s ein Zeitlimit mit localStorage-
  Fallback; im Harness bestanden für hängendes, fehlschlagendes und
  funktionierendes GM.
- Offen bleibt nur die Bestätigung im echten Safari (Nutzer).
