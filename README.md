# Schlummer

Einschlafhilfe für **Netflix** und **Disney+** in Safari auf dem Mac.

Du stellst ein, wie viele Folgen noch laufen sollen. Bis zum Ende dieser
Folgen werden Bild und Ton langsam ausgeblendet. Intro, Zusammenfassung und
Abspann werden auf Wunsch automatisch übersprungen. Am Ende wird pausiert,
der Mac schläft dann von selbst ein.

## Installation (einmalig, etwa 2 Minuten)

1. **Userscripts installieren.** Lade die kostenlose App
   [Userscripts](https://apps.apple.com/de/app/userscripts/id1463298887) aus
   dem Mac App Store und öffne sie einmal.
2. **In Safari aktivieren.** Safari → Menü „Safari" → „Einstellungen…" (⌘,)
   → Reiter „Erweiterungen" → Haken bei „Userscripts". Danach einmal
   netflix.com öffnen, in der Safari-Leiste auf das Userscripts-Symbol
   klicken und „Immer auf dieser Website erlauben" wählen. Dasselbe einmal
   auf disneyplus.com.
3. **Schlummer installieren.** Öffne diesen Link in Safari:

   **https://raw.githubusercontent.com/konradwohlthat-gif/schlummer/main/dist/schlummer.user.js**

   Klicke dann in der Safari-Leiste auf das Userscripts-Symbol und auf
   **„Installieren"**.

Fertig. Updates holt Userscripts automatisch.

**Tipp:** Stelle unter Systemeinstellungen → Sperrbildschirm die Zeit
„Bildschirm bei Inaktivität ausschalten" auf 5 oder 10 Minuten. Nach dem
Ende der letzten Folge ist das Video pausiert, und der Mac geht dann von
selbst dunkel.

## Bedienung

Starte eine Folge und drücke **Z**. Oben rechts erscheint das
Schlummer-Panel. Z schließt es wieder, ebenso ein Klick daneben.

| Element | Bedeutung |
|---|---|
| **Schlafmodus** | Ein/Aus. |
| **− 1 +** | Anzahl der Folgen, bis Bild und Ton ganz weg sind. Wird gemerkt. |
| **Intro überspringen** | Klickt „Intro überspringen" und „Zusammenfassung überspringen". |
| **Abspann überspringen** | Klickt „Nächste Folge", sobald der Abspann beginnt. |
| **Mehr ▾** | Lautstärkekurve, Mindestlautstärke, Startverzögerung, Blaulichtfilter. |

### Was passiert im Schlafmodus

- **Dimmen und Ton** laufen linear mit der Abspielzeit. Pause hält an,
  Zurückspulen hellt leicht auf.
- **Nur ganz gesehene Folgen zählen.** Wenn du eine Folge vorzeitig
  wegklickst, bleibt die Anzahl bestehen.
- **Noch wach?** Wenn du die Maus bewegst oder eine Taste drückst, obwohl
  schon mehr als 40 % gedimmt ist, wird eine Folge nachgelegt. Das Ende
  liegt immer am Ende einer Folge, nie mitten in einer Szene.
- **Am Ende** wird pausiert, Bild bleibt schwarz, Ton bleibt aus. Die
  erste Mausbewegung oder Taste danach stellt alles zurück. Das Video bleibt
  pausiert, Ton kommt erst, wenn du bewusst auf Play drückst.
- **„Schaust du noch?"** wird automatisch bestätigt.

### Einstellungen unter „Mehr"

| Einstellung | Standard | Wirkung |
|---|---|---|
| Lautstärkekurve | Gehör | *Gehör* senkt die empfundene Lautheit gleichmäßig. *Linear* senkt den Zahlenwert gleichmäßig, klingt früh leise. |
| Mindestlautstärke | 0 % | Der Ton endet bei diesem Wert statt bei 0. |
| Startverzögerung | 0 min | So viele Minuten Abspielzeit bleibt alles unverändert, erst dann beginnt das Dimmen. |
| Blaulichtfilter | aus | Warmer Farbton über dem Bild, stufenlos. Nur im Schlafmodus aktiv. |

„Standardwerte" setzt alles zurück.

## Was auf den echten Seiten geprüft wurde

In Chrome mit den Live-Playern getestet (Stand 2026-10-09):

- **Netflix:** Panel, Dimmen, Lautstärkekurve, Verlängerung bei Interaktion,
  Intro überspringen, Abspann überspringen, Folgenwechsel mit Zählung, Ende
  (pausiert, Lautstärke 0, schwarz), Aufwachen mit zurückgesetzter
  Lautstärke, Autoplay-Sperre bis zum bewussten Play, Serienende,
  Startverzögerung, Mindestlautstärke, Blaulichtfilter, Standardwerte.
- **Disney+:** Panel, Dimmen, Positionsverfolgung, Intro überspringen
  (Gachiakuta S1E2, Sprung bei 0:47), Abspann überspringen, Folgenwechsel mit
  Zählung, Verlängerung bei echter Mausbewegung, Ende (zwei Minuten ohne
  Eingabe stabil: pausiert, schwarz, kein Weiterschalten), Folgenwechsel
  durch Disney+ im Zustand „Beendet" (neue Folge wird sofort pausiert, Sitzung
  bleibt), Aufwachen mit zurückgesetzter Lautstärke, Autoplay-Sperre. Nicht live gesehen: die
  Inaktivitätsfrage.
- **Inaktivitätsdialoge:** Nicht live abgewartet (erscheinen erst nach
  Stunden). Der Netflix-Selektor `interrupt-autoplay-continue` ist im
  Netflix-UI-Bundle enthalten; der Klickpfad für Netflix und Disney+ ist mit
  nachgebauten Dialogen im WebKit-Test belegt (`npm run test:webkit:still`).
- **Safari:** Läuft laut Nutzer am 2026-10-09 auf dem Mac einer Freundin mit
  Userscripts (erste Abnahme). Vollständige Checkliste unten.

## Abnahme in Safari (Checkliste)

1. Skript installiert, Userscripts für netflix.com und disneyplus.com erlaubt.
2. Folge starten, **Z** drücken: Panel erscheint oben rechts, Z schließt es.
3. Vollbild (F bzw. Knopf): Panel und Dimmen liegen über dem Bild.
4. Schlafmodus mit 2 Folgen einschalten: Status zeigt „Folge 1 von 2 · 0 %".
5. Nach einigen Minuten: Bild dunkler, Ton leiser, Status steigt.
6. Intro einer Folge: wird übersprungen.
7. Abspann: springt zur nächsten Folge, Status „Folge 2 von 2".
8. Maus bewegen, wenn über 40 % gedimmt: Einblendung „+1 Folge nachgelegt".
9. Ende der letzten Folge: schwarz, still, pausiert. Mac geht später von selbst aus.
10. Maus bewegen: Bild zurück, Lautstärke zurück, Video bleibt pausiert, erst
    Leertaste startet.
11. Unter „Mehr": Blaulichtfilter sichtbar wärmer, Mindestlautstärke und
    Startverzögerung wirken, „Standardwerte" setzt zurück.
12. Safari schließen und neu öffnen: Einstellungen sind noch da.

## Entwicklung

```bash
npm install
npm test        # Modelltests
npm run build   # erzeugt dist/schlummer.user.js
```

- `src/model.js` enthält das Zeit- und Lautstärkemodell als reine Funktionen.
- `src/adapters/` enthält pro Anbieter die Selektoren für Video, Intro,
  Abspann und Folgenwechsel. Ein neuer Anbieter ist eine neue Datei dort.
- `docs/SPEC.md` beschreibt das gesamte Verhalten.

Zum Ausprobieren in Chrome oder Firefox: den Inhalt von
`dist/schlummer.user.js` in Tampermonkey/Violentmonkey als neues Skript
einfügen.

### WebKit-Test ohne Safari (nur für Entwickler)

`npm run test:webkit` lädt das Bundle in eine WKWebView in Safaris isolierter
Skript-Welt gegen eine Netflix-Attrappe und drückt Z als echtes Tastenereignis.
Details in `test/webkit/README.md`. Bestätigt am 2026-10-09: Panel, Einblendung
und Z funktionieren dort, auch wenn `GM.getValue` hängt oder fehlschlägt.

### Safari per AppleScript prüfen (nur für Entwickler)

Damit sich Safari aus dem Terminal abfragen lässt (zum Beispiel ob das
Panel in der Seite liegt), braucht es zwei Einstellungen, die Nutzer
nicht benötigen:

1. Safari → „Safari" → „Einstellungen…" (⌘,) → Reiter „Erweitert" → ganz
   unten „Funktionen für Webentwickler anzeigen" einschalten.
2. Im neuen Menü „Entwickler" den Punkt „JavaScript aus Apple Events
   erlauben" anhaken. Safari fragt einmal nach Bestätigung.
3. Beim ersten Aufruf fragt macOS, ob das Terminal Safari steuern darf:
   „Erlauben".

Prüfung, ob das Skript in Safari läuft (Netflix-Folge in Safari offen):

```bash
osascript -e 'tell application "Safari" to do JavaScript "document.querySelectorAll(\".schlummer-panel\").length" in front document'
```

Ergebnis `1` heißt: Userscripts hat Schlummer in die Seite geladen.
Ohne diese Einstellungen antwortet Safari mit dem Fehler „You must enable
'Allow JavaScript from Apple Events'".

## Lizenz

MIT
