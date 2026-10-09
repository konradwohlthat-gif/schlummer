# WebKit-Test (isolierte Skript-Welt wie in Safari/Userscripts)

Lädt `dist/schlummer.user.js` in eine WKWebView in der isolierten Welt
`defaultClient` (dieselbe Art Welt, in der Userscripts Skripte mit `@grant`
ausführt), gegen eine Netflix-Attrappe unter `https://www.netflix.com/watch/…`,
und drückt Z als echtes Fensterereignis.

```bash
npm run build
npm run test:webkit            # ohne GM-Objekt (localStorage)
npm run test:webkit -- hang    # GM.getValue hängt
npm run test:webkit -- reject  # GM.getValue schlägt fehl
npm run test:webkit -- ok      # GM funktioniert
```

Erwartung je Lauf: `panel: true`, nach Z `visible: true`, nach erneutem Z
`visible: false`. Braucht Xcode Command Line Tools (`xcrun swift`) und eine
angemeldete Benutzersitzung (es wird kurz ein unsichtbares Fenster erzeugt).

## Inaktivitätsdialoge („Schaust du noch?")

```bash
npm run test:webkit:still
```

Erzeugt mit `say`/`afconvert` eine kurze Tonspur als Video (echte Dauer, damit
der Schlafmodus startet), baut den Netflix-Knopf
`[data-uia="interrupt-autoplay-continue"]` bzw. das Disney-Element
`inactivity-overlay` (Shadow DOM mit „Schließen" und „Weiter schauen") nach
und prüft: ohne Schlafmodus kein Klick, mit Schlafmodus Klick auf „Weiter",
nie auf „Schließen". Ergebnis 2026-10-09: beide bestanden.
