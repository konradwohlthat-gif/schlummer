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
