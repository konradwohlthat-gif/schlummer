# Schlummer – Spezifikation Version 1

Stand: 2026-10-09. Ergebnis des Design-Interviews.

## Ziel

Einschlafhilfe für Netflix und Disney+ in Safari auf dem Mac. Beim Einschalten
stellt man eine Anzahl Folgen ein. Bis zum Ende dieser Folgen werden Bild und
Ton linear bis auf 0 heruntergefahren. Intro, Zusammenfassung und Abspann
werden auf Wunsch automatisch übersprungen. Freunde sollen es ohne
Entwicklerwissen installieren können.

## Plattform und Verteilung

- **Form:** Ein Userscript (eine JS-Datei) für die kostenlose App
  „Userscripts" aus dem Mac App Store. Kein Apple Developer Account nötig.
- **Hosting:** Öffentliches GitHub-Repository `schlummer`. Die Skript-Datei
  trägt `@updateURL`/`@downloadURL` auf die Raw-Datei im Repo, Userscripts
  zieht neue Versionen selbst.
- **Installation für Freunde:** Userscripts installieren, in Safari
  aktivieren und für netflix.com sowie disneyplus.com erlauben, dann den
  Install-Link öffnen. README mit Anleitung liegt im Repo.
- **Kern-Code** ist hüllenunabhängig geschrieben, sodass ein späterer Wechsel
  zu einer echten Safari Web Extension nur die Hülle betrifft.
- **Sprache der Oberfläche:** Deutsch.

## Dimmen (Bild)

- Eine schwarze, klick-durchlässige Ebene über dem gesamten Viewport
  (im Vollbild über dem Vollbild-Element). Deckkraft = Fortschritt (0 bis 1).
- Keine echte Display-Helligkeit. Begründung: geht in reiner Erweiterung,
  funktioniert auch an externen Displays, Ergebnis für den Einschlaf-Fall
  praktisch gleich.
- Weiche Übergänge (ca. 0,5 s), damit Sprünge bei Spulen oder Verlängerung
  nicht hart wirken.
- **Blaulichtfilter** (Einstellung, stufenlos 0 bis 100 %, Standard 0 %):
  Eine zweite, warm-orange Ebene (`rgb(255, 147, 41)`, `mix-blend-mode:
  multiply`) unter der schwarzen Ebene. Ihre Deckkraft ist der eingestellte
  Wert. Sie ist nur im Schlafmodus aktiv, blendet beim Einschalten über 2 s
  ein und beim Ausschalten wieder aus. Unabhängig vom Dimm-Fortschritt.

## Ton

- Lautstärke des `<video>`-Elements wird aus dem Fortschritt berechnet:

      vol = min + (basis − min) × kurve(1 − p)

  `basis` ist die Ausgangslautstärke, `min` die Mindestlautstärke
  (absolut, auf `basis` gedeckelt), `kurve` die gewählte Lautstärkekurve.
- **Lautstärkekurve** (Einstellung, Standard „Gehör"):
  - *Gehör*: `kurve(x) = x^(1/0,6)` nach dem Stevens'schen Potenzgesetz.
    Die empfundene Lautheit sinkt damit linear, Bild und Ton verschwinden
    gefühlt gleichmäßig.
  - *Linear*: `kurve(x) = x`. Der Wert sinkt linear, klingt früh leise.
- **Mindestlautstärke** (Einstellung, 0 bis 50 %, Standard 0 %): Der Ton
  endet bei diesem Wert statt bei 0. Liegt die Ausgangslautstärke darunter,
  bleibt sie unverändert.
- Ausgangslautstärke wird beim Einschalten gelesen. Ändert der Nutzer die
  Lautstärke während des Dimmens über die Netflix-Steuerung, wird der neue
  Wert als neue Ausgangsbasis übernommen (Basis = neuer Wert / (1 − Fortschritt),
  gedeckelt auf 1).
- Stummschaltung durch den Nutzer wird respektiert, nie aufgehoben.
- Neue Video-Elemente (Netflix erzeugt pro Folge ein neues) bekommen sofort
  die berechnete Lautstärke.

## Zeitmodell: Folgen-Budget

Der Nutzer stellt nicht Minuten ein, sondern Folgen-Enden.

**Begriffe**

- `budget`: verbleibende Folgen inklusive der aktuellen.
- `rest`: Restzeit der aktuellen Folge (`duration − currentTime`).
- `len`: Länge der aktuellen Folge, dient als Annahme für die nächsten.
- `R_now = rest + (budget − 1) × len`: geplante Restzeit.
- **Anker:** `(p_a, R_a)` = Fortschritt und geplante Restzeit beim letzten
  Planwechsel.

**Fortschritt**

    p = p_a + (1 − p_a) × (1 − R_now / R_a), begrenzt auf 0..1

Das ist linear in der Abspielzeit, solange der Plan gleich bleibt. Pause
friert ein (R_now ändert sich nicht). Zurückspulen hellt leicht auf,
Vorspulen dimmt etwas mehr. Der Fortschritt beim Einschalten ist immer 0,
egal wo in der Folge man ist.

**Startverzögerung** (Einstellung, 0 bis 60 Minuten, Standard 0): Beim
Einschalten wird noch kein Anker gesetzt. Der Fortschritt bleibt 0, Bild und
Ton bleiben unverändert, bis so viele Minuten Abspielzeit vergangen sind
(Pause zählt nicht). Dann wird der Anker gesetzt (`p_a = 0`, `R_a = R_now`)
und das Dimmen läuft linear über den Rest des Budgets. Die Verzögerung wird
so gedeckelt, dass mindestens 5 Minuten Dimmzeit übrig bleiben. Interaktion
während der Verzögerung hat keine Wirkung (Fortschritt ist 0).

**Folgenwechsel**

- Eine Folge zählt als beendet, wenn das Video `ended` feuert, der Anbieter
  selbst weiterspringt, oder der Nutzer nach mehr als 80 % der Laufzeit
  weiterklickt (Abspann). Dann `budget − 1`. Erreicht `budget` 0, beginnt
  das Endverhalten.
- Springt der Nutzer vor 80 % weg, zählt die Folge nicht. `budget` bleibt,
  der Plan wird neu verankert: `p_a` = aktueller Fortschritt, `R_a` = neue
  geplante Restzeit. Das Dimmen läuft von dort linear über die vollen Folgen.
- Beim Wechsel wird `len` auf die Länge der neuen Folge gesetzt.
- `duration` wird erst nach `loadedmetadata` verwendet.

**Verlängerung bei Interaktion**

- Interaktion = Mausbewegung, Klick, Tastendruck (alles, was die
  Player-Steuerung einblendet).
- Liegt der Fortschritt bei einer Interaktion über 40 %, wird das Budget um
  ganze Folgen erhöht, bis die geplante Restzeit mit der ursprünglichen
  Dimm-Rate mindestens bis 40 % reicht, also `R_now ≥ 0,6 × R_a / (1 − p_a)`.
  Danach neu verankern mit `p_a = 0,4`, `R_a = R_now`. Das Ende liegt damit
  wieder exakt an einer Folgengrenze, die Rate wird höchstens etwas flacher.
- Nach einer Verlängerung werden weitere Interaktionen 10 s lang ignoriert.
- Unter 40 % passiert bei Interaktion nichts.
- Begründung: Wer sich bewegt, ist noch nicht eingeschlafen. Ein Ende mitten
  in einer Szene wird vermieden.

## Ende (Fortschritt 100 %, Budget 0)

- Video pausieren, Ebene bleibt schwarz, Ton bleibt 0.
- Startet der Anbieter trotzdem die nächste Folge, wird diese sofort wieder
  pausiert (Listener auf `play` und auf Folgenwechsel).
- Erste Interaktion nach dem Ende: Ebene entfernen, Ausgangslautstärke
  zurücksetzen, Schlafmodus aus. Video bleibt pausiert. Ton kommt erst bei
  bewusstem Play. Da Netflix' Autoplay nur durch unser Pausieren zurückgehalten
  wurde, unterdrückt das Skript nach dem Aufwachen 30 s lang jedes Abspielen,
  das nicht unmittelbar (1,5 s) auf eine Nutzereingabe folgt.
- Es wird nie `video.muted` gesetzt, nur die Lautstärke: Netflix übernimmt
  beides in seinen eigenen Zustand, und ein Stummschalten könnte hängen bleiben.
  Nach dem Ausschalten wird die Ausgangslautstärke 6 s lang auf jedes neue
  Video-Element nachgezogen.
- Nebeneffekt: Pausiertes Video hält den Mac nicht wach, macOS schaltet den
  Bildschirm nach Systemeinstellung ab. README empfiehlt 5 bis 10 Minuten.
- Verworfen: Sprung zur Startseite (hell, Trailer halten Mac wach).

## Überspringen

Drei unabhängige, gespeicherte Schalter:

| Schalter              | Standard | Wirkung                                                     |
|-----------------------|----------|-------------------------------------------------------------|
| Schlafmodus           | aus      | Dimmen, Ton, Budget, Ende                                   |
| Intro überspringen    | an       | Klickt „Intro überspringen" und „Zusammenfassung überspringen", auch außerhalb des Schlafmodus |
| Abspann überspringen  | an       | Klickt „Nächste Folge", sobald der Knopf im Abspann erscheint, auch außerhalb des Schlafmodus |

Alle Einstellungen mit Standardwert:

| Einstellung         | Bereich        | Standard |
|---------------------|----------------|----------|
| Folgen              | 1 bis 10       | 1        |
| Intro überspringen  | an / aus       | an       |
| Abspann überspringen| an / aus       | an       |
| Lautstärkekurve     | Gehör / Linear | Gehör    |
| Mindestlautstärke   | 0 bis 50 %     | 0 %      |
| Startverzögerung    | 0 bis 60 min   | 0 min    |
| Blaulichtfilter     | 0 bis 100 %    | 0 %      |

Regeln im Schlafmodus:

- Abspann-Schalter aus: Abspann läuft durch. Springt der Anbieter danach
  nicht selbst weiter (Autoplay im Profil abgeschaltet), klickt das Skript
  nach Ende des Videos selbst auf „Nächste Folge".
- Bei der letzten Budget-Folge wird in keinem Fall weitergeklickt.
- „Schaust du noch?" wird automatisch bestätigt.

## Bedienung

- **Panel** oben rechts im Player, dunkler Look im Stil des Anbieters.
  Taste Z öffnet und schließt es (Änderung vom 2026-10-09: nicht mehr bei
  Mausbewegung). Es schließt sich auch bei Klick daneben oder nach 10 s ohne
  Mauskontakt. Kurze Hinweise („+1 Folge nachgelegt") erscheinen bei
  geschlossenem Panel als kleine Einblendung für 3 s. Im Vollbild innerhalb
  des Vollbild-Elements.
  Nicht in die Anbieter-Leiste eingehängt (deren Aufbau ändert sich oft).
- **Inhalt:** Schalter Schlafmodus, Folgenanzahl mit − / + (1 bis 10),
  Schalter Intro, Schalter Abspann. Im laufenden Modus Status
  „Folge 1 von 2 · 37 %".
- **Aufklappbarer Bereich „Mehr":** Lautstärkekurve (Gehör / Linear),
  Mindestlautstärke (Schieberegler 0 bis 50 %), Startverzögerung
  (Schieberegler 0 bis 60 min), Blaulichtfilter (Schieberegler 0 bis 100 %).
  Jeder Wert hat einen Standard und wird nach Änderung dauerhaft gespeichert,
  der geänderte Wert ist damit der neue Standard des Nutzers. Ein Knopf
  „Standardwerte" setzt alle Einstellungen zurück.
- **Taste Z** öffnet und schließt das Panel. Der Schlafmodus wird über den
  Schalter im Panel ein- und ausgeschaltet. (S ist bei Netflix belegt.)
- **Folgenanzahl:** Beim allerersten Mal 1, danach wird der zuletzt genutzte
  Wert gemerkt.
- **Speicher:** `GM.setValue`/`GM.getValue`, Fallback `localStorage`.
- Aus- und wieder Einschalten setzt alles zurück (Fortschritt 0, Budget =
  eingestellte Anzahl).

## Anbieter-Adapter

Kern (Dimmen, Ton, Zeitmodell, Panel) ist anbieterneutral. Pro Anbieter ein
Adapter-Objekt mit:

- `matches(url)`
- `getVideo()` – aktuelles `<video>`
- `isPlayerPage()` / `episodeId()` – Folgenwechsel erkennen (URL plus neues
  Video-Element)
- `findSkipIntro()`, `findSkipRecap()`, `findNextEpisode()`,
  `findStillWatching()` – jeweils Button oder `null`, bevorzugt über stabile
  Attribute (`data-uia`, `data-testid`), nicht über Text, da sprachabhängig
- `fullscreenRoot()` – Element, in das Ebene und Panel im Vollbild gehören

Version 1: Netflix. Version 1.1: Disney+. Selektoren werden an den
Live-Seiten ermittelt.

## Test und Abnahme

- Entwicklung und Fehlersuche in Chrome über die Browser-Werkzeuge, mit
  eingeloggten Netflix- und Disney+-Konten. Nur Player-Steuerung, keine
  Kontoänderungen.
- Zeitmodell als reine Funktionen mit Unit-Tests (ohne Browser).
- Abnahme in Safari mit Userscripts durch den Nutzer anhand Checkliste:
  Vollbild, Intro, Folgenwechsel natürlich und übersprungen, Verlängerung
  bei Interaktion, Ende, Aufwachen, Update-Mechanismus.

## Bewusst nicht in Version 1

- Echte Display-Helligkeit (bräuchte native App).
- Weitere Anbieter als Netflix und Disney+.
- Tab schließen oder Mac in Ruhezustand versetzen (nicht aus Userscript
  möglich).

## Nachträglich in Version 1 aufgenommen (2026-10-09)

- Wahrnehmungsgerechte Lautstärkekurve als Standard, linear als Option.
- Blaulichtfilter, stufenlos einstellbar, Standard aus.
- Mindestlautstärke, einstellbar, Standard 0 %.
- Startverzögerung, einstellbar, Standard 0 min.

## Ideen für später

1. **Nachtvorschlag:** Nach 23 Uhr bietet das Panel den Schlafmodus von sich
   aus an.
2. **Blaulichtfilter mit dem Fortschritt ansteigen lassen** statt konstant.

## Ergänzung 2026-10-09: Logo-Nachlauf bei Family Guy (Disney+)

Nutzerwunsch: Nach dem Intro-Sprung läuft bei Family Guy das Logo etwa 15 s
weiter; diese sollen mit dem Intro in einem Sprung übersprungen werden, damit
nur eine Ladepause entsteht. Umsetzung im Disney-Adapter:

- Tabelle `INTRO_PROFILES` (Serienname aus `document.title` → `{ marker, extra }`),
  derzeit `family guy: { marker: 13, extra: 31 }`. `marker` ist fest
  eingetragen (Disneys Sprungweite, gemessen 13 s, in jeder Staffel etwa
  gleich), `extra` der Logo-Nachlauf (Nutzerwunsch vom 2026-10-09: 25 s,
  später 31 s).
- Erscheint der Intro-Knopf frisch (im vorherigen Tick noch nicht da, Folge
  seit mehr als 1,5 s geladen), liegt die Position am Markeranfang; dann
  springt das Skript ohne Klick per Zeigerereignis auf den Regler direkt an
  `Position + marker + extra`. Nicht frisch (etwa Wiedereinstieg mitten im
  Intro): Knopf klicken, `extra` nachziehen.
- Zusammenfassung vor dem Intro: Zeigt Disney+ einen Knopf, wird er am Text
  erkannt (`zusammenfassung|rückblick|recap`) und normal geklickt. S11E5
  „200 Folgen später" hat keinen Knopf (Zusammenfassung 0 bis 26 s, dann Intro-
  Marker). Dafür `EPISODE_PROFILES` (Play-ID, Fallback Folgentitel aus
  `title-overlay`): am Folgenanfang (Position ≤ 5 s) ein Sprung an
  `recapEnd + marker + extra` = 70 s; beim Wiedereinstieg nichts. Mechanik live bestätigt (1 s → 29 s in einem
  Schritt mit den früheren Werten 13 + 15).
- Fallback, wenn der Regler nicht lesbar ist oder die Folge nicht am Anfang
  steht: Knopf klicken, danach `extra` nachziehen.
- Spulen auf Disney+ nur über den Regler (Zeigerereignisse auf
  `main-app-controls-overlay`), da `currentTime` ignoriert wird; Fallbacks:
  „+10 s"-Taste (abgerundet), dann `currentTime`.
