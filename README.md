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
2. **In Safari aktivieren.** Safari → Einstellungen → Erweiterungen →
   Haken bei „Userscripts". Dann in der Safari-Leiste auf das
   Userscripts-Symbol klicken und für `netflix.com` und `disneyplus.com`
   „Immer erlauben" wählen.
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

## Lizenz

MIT
