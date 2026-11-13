# LIFESPAN OS Mobil (Handy-App, PWA)

Training im Studio erfassen – auf iPhone und Android, offline, ohne Konto. Persönliche Daten
bleiben auf dem Gerät (IndexedDB). Veröffentlicht unter **https://lifespan-os.github.io/app/**
(Repository `lifespan-os/lifespan-os.github.io`, Ordner `app/`).

Bewusst **ohne Build-Schritt und ohne Abhängigkeiten**: reines HTML/CSS/JavaScript (ES-Module),
damit die Dateien direkt auf GitHub Pages laufen.

| Datei | Inhalt |
|---|---|
| `core.js` | Reine Logik: Export einlesen, Übung zu Maschine, Suche, Training, Rückgabedatei (mit Tests) |
| `app.js` | Oberfläche (Ansichten, Eingaben, Pausentimer, Bildschirm anlassen) |
| `store.js` | Speicher auf dem Gerät (IndexedDB) |
| `sw.js` | Service Worker: App offline verfügbar (nur App-Dateien, nie Nutzerdaten) |
| `core.test.mjs` | Tests: `node --test core.test.mjs nutrition.test.mjs body.test.mjs focus.test.mjs pcdb.test.mjs` |
| `label.js` | Etikett-Scanner: Nährwerte aus Text lesen (Regeln wie `src/domain/labelScan.ts`, plus spaltenweise gelesener Text) |
| `nutrition.js` | Ernährung: Lebensmittel aus dem Export, speichern, tracken, Gerichte, Tabellen für die Rückgabedatei (mit Tests) |
| `food.js` | Oberfläche „Ernährung“ und „Gericht“ |
| `ocr.js` | Texterkennung auf dem Handy (Tesseract.js aus `vendor/ocr/`, erst beim ersten Scan geladen) |
| `vendor/ocr/` | Tesseract.js 5 + deutsche Sprachdaten; nicht im Git, holen mit `scripts/48-handy-texterkennung-laden.cmd` |

## Version 1.2.0 (12.11.2026): Etikett-Scanner und Ernährung – siehe Ende der Datei

## Version 1.1.2 (12.11.2026)

- Widerstandsprofil wie in der Desktop-App (`src/domain/resistance.ts`): neun Profile, Standardprofile
  der Übung (`exercise.resistance_profiles`), Vorbelegung aus Plan und letzter Einheit. Sobald
  Profilgewichte eingetragen sind, ist das Gewicht ihre Summe (Konzentrisch + Exzentrisch: nur
  Konzentrisch zählt); die Rückgabedatei schreibt `rp_*_kg` und `weight_kg` = Summe.
- Mehr Abstand nach oben (Notch): Statusleiste auf „black“, Kopfzeile mit Safe-Area plus 14 px.
- Service Worker „online zuerst“ (3 s Zeitlimit, sonst Speicher): Updates kommen beim nächsten Öffnen an.
- Kopfzeile undurchsichtig, Abstand `--safe-top` + 18 px; meldet iOS als Home-Bildschirm-App 0 px, obwohl der Inhalt unter der Statusleiste liegt, setzt `app.js` 54 px (`fixSafeTop`).

## Datenaustausch

- **PC → Handy:** normaler Export der Desktop-App (`performance-os-export.json`, Format siehe
  `docs/EXPORTFORMAT.md`). Die Handy-App übernimmt Maschinen, Übungen, Sportarten, nicht
  archivierte Trainingspläne (Tage, Übungen, Sätze) und je Übung die letzte abgeschlossene Einheit.
  Ab Schema 38.
- **Handy → PC:** Teil-Exportdatei im selben Format (`LIFESPAN Smartphone-Training <Datum>.json` bzw. ab 1.2.4 für Ernährung `LIFESPAN Lebensmittel <Datum>.json`) mit
  `workout`, `workout_exercise`, `workout_set` (Status `done`) und allen Einträgen, auf die sie
  verweisen (`exercise`, `machine`, `sport`, `training_plan`, `training_plan_day` – unverändert aus
  dem Export), damit die Zwischendatenbank keine fehlenden Verweise meldet. `schemaVersion` = die
  des geladenen Exports; es werden nur Spalten geschrieben, die dieser Export kannte.
- Import am PC **nur mit „Abgleichen (zweites Gerät)“**: neuerer `updated_at` gewinnt, die
  mitgeschickten Stammdaten (gleicher Zeitstempel) ändern am PC nichts. Mehrfaches Senden
  erzeugt keine Doppelten (gleiche IDs).
- Neue Übung an einer Maschine: wie `repo/machine_merge.rs::exercise_for_machine` (vorhandene
  nicht archivierte Übung der Maschine, sonst freier Name: Anzeigename → Hersteller + Name →
  „Name (2)“ …). Gleicher Name am PC → `remap_natural_keys` führt zusammen.
- Mehrere Übungen an einer Maschine (1.1.3, z. B. „Butterfly“ und „Rear Delt“ an derselben
  Nummer): Hat die Maschine Übungen, öffnet ein Tipp die Ansicht `machine` mit allen nicht
  archivierten Übungen (`machineExercises`) und „Weitere Übung an dieser Maschine“
  (`newMachineExercise`: eigener Name, eindeutig wie am PC). Die Suche findet Maschinen auch über
  die Namen ihrer Übungen. Neue Übungen kommen mit der Rückgabedatei an den PC.
- Abschließen: nicht abgehakte Sätze werden verworfen (Schalter „trotzdem speichern“), leere
  Sätze und Übungen ohne Sätze entfallen. Grenzen wie die `CHECK`-Regeln der Datenbank.

## Prüfung (12.11.2026)

- `node --test core.test.mjs`: 16 Tests bestanden (seit 1.1.0 inkl. Widerstandsprofil).
- Durchgespielt im iPhone-13-Format (Playwright): Export laden, Plan starten, Sätze abhaken,
  Maschine per Nummer hinzufügen, Neuladen mitten im Training, abschließen, Datei erstellen.
- Rückgabedatei gegen ein aus allen Migrationen (0001–0054) gebautes Schema geprüft:
  Zwischendatenbank wie `import.rs` (Spalten, `CHECK`-Regeln, `foreign_key_check`), danach
  Abgleich – Trainings, Sätze und neue Maschinenübung korrekt, zweiter Import ohne Doppelte.
- 12.11.2026: Echter Durchlauf vom Nutzer bestätigt (Export laden, Training am iPhone,
  Import am PC mit „Abgleichen (zweites Gerät)“).

## Veröffentlichen

Dateien in das Repository `lifespan-os.github.io` in den Ordner `app/` (Symbole nach
`app/icons/`) hochladen. Bei Änderungen `VERSION` in `sw.js` erhöhen, damit Handys die neue
Fassung laden.
- Heller Modus (1.1.4): Farben wie Desktop-App und Website (`app.css`, Variablen in `:root`),
  Orange als Schrift über `--orange-text` (Kontrast auf Weiß). Statusleiste `default`
  (`index.html`), `theme_color`/`background_color` hell (`manifest.webmanifest`). Auf dem iPhone
  übernimmt eine schon zum Home-Bildschirm hinzugefügte App die neue Statusleiste erst nach
  erneutem Hinzufügen.
- Trainings bearbeiten (1.1.5): In der Detailansicht „Training bearbeiten“ (`startEdit`: Kopie als laufendes
  Training mit `editOf`), Speichern über `saveEdit`: Sätze wie beim Abschließen gefiltert, `updatedAt` neu (gewinnt
  beim Abgleich am PC), Dauer änderbar, Training wieder „offen“. Entfernte Übungen und Sätze werden als
  Löschvermerk gemerkt (`workout.tombstones`) und als Tabelle `deleted_record` mitgeschickt; der Abgleich am PC
  löscht sie, solange sie dort seitdem nicht geändert wurden (`import.rs`, Schema 47).
- Kopfzeile kompakter (1.1.5): `.top` mit `--safe-top + 4px`, Höhe 52 px; `.search` und `.toast` entsprechend.
- Abstand oben fest (1.1.8): am iPhone des Nutzers abgestimmt – `--safe-top` = iOS-Sicherheitsabstand minus 58 px
  (mindestens 0); Ersatzwert im Vollbild 0. Die Einstellung aus 1.1.7 (Hilfe → „Abstand oben“) ist wieder entfernt.

- Ernährung / Etikett-Scanner (1.2.0): Startseite → „Etikett scannen & tracken“. Foto mit der Kamera
  (`<input capture="environment">`) oder aus der Mediathek → `ocr.js` (Graustufen, Kontrast, ≤ 2000 px, Tesseract
  PSM 6, offline aus `vendor/ocr/`, vom Service Worker gespeichert) → `label.js`. Alternativ iPhone „Text scannen“
  (Live Text) ins Textfeld, ohne Zusatzdateien. Formular wie am PC (Grenzen = CHECK-Regeln von `food`),
  „Als Lebensmittel speichern“ (gleicher Name + Marke = vorhandenes Lebensmittel aktualisieren, keine Doppelten am PC),
  Strichcode als `settings` `strichcode.<EAN>` = Lebensmittel-ID (wie Desktop 1.0.120). Tracken in g/ml oder
  Portionen in eine Mahlzeit von heute; eine Mahlzeit desselben Platzes aus dem Export (letzte 3 Tage) wird
  weiterverwendet (Zeile unverändert, Einträge mit `position` ≥ 1000), sonst neu. „Gericht“: Zutaten suchen/scannen,
  als Vorlage/Rezept speichern (freier Name wie am PC: „Name (2)“) und/oder Portionen anteilig eintragen.
  Export vom PC liefert `nutrition` (nicht archivierte Lebensmittel, Strichcodes, Mahlzeiten der letzten 3 Tage,
  Rezeptnamen). Rückgabedatei enthält zusätzlich `food`, `settings`, `meal`, `meal_item`, `recipe`, `recipe_item`
  (nur Neues, „Alles erneut senden“ = alles); am PC wie gewohnt „Abgleichen (zweites Gerät)“. Gespeichert unter
  IndexedDB-Schlüssel `nutrition`; nach neuem Export räumt `pruneLocal` Übertragenes auf.
- Prüfung 1.2.0: `node --test core.test.mjs nutrition.test.mjs` (27 Tests); Durchlauf im iPhone-13-Format
  (Playwright): Export laden, Text auswerten (spaltenweise), speichern, tracken, Gericht mit Rezept und Eintrag,
  Rückgabedatei mit allen sechs Tabellen. Tesseract selbst nur am Handy prüfbar.

## Version 1.2.1 (12.11.2026): genauere Etikett-Erkennung

- Foto → **Ausschnitt wählen** (Rahmen um die Nährwerttabelle ziehen, Drehen in 90°-Schritten); erkannt wird nur
  der Ausschnitt.
- Bildvorbereitung (`ocr.js`): Ausschnitt auf ca. 2200 px längste Seite vergrößert (kleine Schrift), Helligkeit
  gestreckt bzw. Schwarz-Weiß mit örtlicher Schwelle (Bradley) gegen Schatten und Spiegelungen.
- Bis zu drei Durchgänge (Graustufen/Block, Schwarz-Weiß/Block, Graustufen/spaltenweise); gewählt wird der Text mit
  der besten Bewertung (`scanScore`: erkannte Werte, Plausibilität, Strichcode, Bezug), Abbruch, sobald gut genug.
- `label.js`: Lesefehler in Zahlen (`fixDigits`: O→0, l/I/|→1, S→5, B→8, „q“/„9“ statt g, „12,59“ → 12,5 g,
  „649g“ → 64 g), unscharfe Bezeichnungen (Levenshtein, `ruleFor`), `repairScan` (Werte über 100 g, kcal aus kJ,
  wenn das zu den Hauptnährstoffen passt) und `checkValues` (gelbe Hinweise je Feld: gesättigte ≤ Fett,
  Zucker ≤ Kohlenhydrate, Summe ≤ 100 g, kcal ≈ 9 F + 4 KH + 4 E + 2 Ballaststoffe, kcal ↔ kJ).
- Auf dem iPhone steht „Text scannen“ als genauester Weg oben (aufgeklappt), das Foto darunter.
- Tests: `node --test core.test.mjs nutrition.test.mjs` (32 bestanden).

## Version 1.2.2 (12.11.2026): Ernährungseinträge vor dem Senden prüfen

- Ansicht `food-review` („Vor dem Senden prüfen“, erreichbar über Start, „An den PC senden“ und Ernährung):
  alle noch nicht gesendeten Einträge nach Tag und Mahlzeit; Menge, Mahlzeit und Tag änderbar (`updateItem`:
  gleiche ID, wandert bei anderem Tag/Platz in die passende Mahlzeit, leere Mahlzeit entfällt), Löschen.
- Neue/geänderte Lebensmittel bearbeiten oder verwerfen (`discardFood`, nur wenn nicht verwendet), neue Rezepte
  und Strichcodes verwerfen. Gesendete Einträge bleiben gesperrt (am PC bearbeiten).
- Tests: 34 bestanden.

- 1.2.3: In „Vor dem Senden prüfen“ steht der Strichcode eines neuen Lebensmittels bei diesem Lebensmittel (Verwerfen entfernt beides); einzeln nur Strichcodes für Lebensmittel vom PC.

- 1.2.4: Getrennte Rückgabedateien – Trainings „LIFESPAN Smartphone-Training <Datum Uhrzeit>.json“, Ernährung „LIFESPAN Lebensmittel <Datum Uhrzeit>.json“; eigene Knöpfe und eigenes „Als übertragen markieren“.

## Version 1.3.0 (13.11.2026): Body & Longevity

- Startseite → „Körperwerte“ (`body.js`, Logik `bodydata.js`): „… – letzte Werte“ wie am PC (Gewicht,
  Körperzusammensetzung mit Teilüberschriften, Umfänge, Vitalwerte, Fitness) mit Veränderung und Datum;
  Erklärungen (Mouseover/ⓘ) für Blutdruck systolisch/diastolisch und VO2max.
- Tippen auf eine Messgröße → Verlauf (Liniendiagramm der letzten 60 Werte, Veränderung, Min/Max) und alle Werte.
- Werte erfassen, ändern, löschen (nur ungesendete); Prüfung gegen min/max der Messgröße, Datum nicht in der
  Zukunft. Je Messgröße und Tag ein Wert (wie am PC, natürlicher Schlüssel metric_id + date).
- Senden als eigene Datei „LIFESPAN Körperwerte <Datum Uhrzeit>.json“ (Tabellen body_metric, body_measurement).
- Daten vom PC: body_metric und body_measurement aus der Exportdatei (`parseExport` → `catalog.body`); alte
  gespeicherte Daten ohne Körperwerte zeigen einen Hinweis, eine neue Exportdatei zu laden.
- Tests: `node --test core.test.mjs nutrition.test.mjs body.test.mjs` (37 bestanden).

- 1.3.1: „Werte erfassen“ als eigene Ansicht (`body-entry`, wie „Erfassen“ am PC): Tag mit ‹ › wählen, alle Messgrößen nach Bereichen mit Sprungleiste, je Bereich Messmethode und Uhrzeit, „zuletzt“-Wert je Feld, ein Knopf „Werte speichern“ (`saveDay`: erst alles prüfen, dann speichern; geleertes Feld entfernt ungesendeten Handy-Wert). Tests: 38 bestanden.

## Version 1.4.0 (13.11.2026): Menü wie am PC

- `nav.js`: gleiche Bereiche in gleicher Reihenfolge wie die linke Leiste am PC (Overview, Checklisten, Training, Nutrition, Sleep, Recovery, Body & Longevity, Health, Superhuman, Insights, iCoach.me, Settings) als Menü, das von links hereinkommt (☰ oben links in jeder Ansicht).
- Neue Bereichsseiten „Training“ (starten, laufendes Training, letzte 20 Trainings) und „Settings“ (Daten vom PC, An den PC senden, Hilfe); Bereiche ohne Handy-Funktion zeigen „nur am PC“ (`pc-only`).

## Version 1.4.1 (13.11.2026): Training

- Nur die aktuelle Übung ist aufgeklappt (Regeln wie am PC, `domain/workoutFocus.ts`); Kopf antippen klappt auf/zu, Fortschritt „2/4“.
- Notiz je Übung (`workout_exercise.notes`, max. 500 Zeichen).
- Nach dem Bestätigen eines Wertes zoomt iOS wieder auf die optimale Breite (`resetZoom`), alle Felder mindestens 16 px.
- Suche: je Maschine/Übung „12× benutzt · zuletzt …“ (`usageFromRows`, `usageOf`).
- Übungen an der Maschine: Info-Symbol mit Muskelverteilung (`focusinfo.js`, Daten `focusdata.js` aus gripFocus.ts/muscleMap.ts erzeugt; Muskelfokus aus `machine_muscle_focus`/`exercise_muscle_focus`).
- Tests: 40 bestanden (dazu `focus.test.mjs`).

## Version 1.5.0 (13.11.2026): Nutrition wie am PC, Wasserhaushalt bearbeiten

- Nutrition hat die Reiter **Tagebuch**, **Scanner & Tracken** (bisherige Ansicht `food`) und **Verlauf** (`food-history`).
- Tagebuch (`diary.js`) wie `DiaryTab.tsx`: Tag mit ‹ › wählen; Karten in der Anordnung vom PC (`ui.diary_layout`):
  Tagessumme gegen die Tagesziele (Energieleiste, Defizit/Überschuss, Tagesbedarf fest bzw. dynamisch mit
  Kalibrierung, Makroziele mit Mehrverbrauch, weitere Nährwerte), Wasserhaushalt, Mahlzeiten, Supplements,
  Fasttracking, Mikronährstoffe mit % DGE/EFSA. Verlauf wie `NutritionHistoryTab.tsx` (Energie je Tag, Tabelle).
- Rechnung wie am PC: `pcdb.js` ist die Umsetzung der Rust-Abfragen (goals, meal, fasttrack, supplement, water,
  neat, energy mit Training/Cardio/Kalibrierung) auf den Exporttabellen; `pcdomain.js` ist `src/domain` der
  Desktop-App (gebündelt mit esbuild), `nutrientcatalog.js` der Nährstoffkatalog aus `fasttrack.rs`. Beide werden
  mit `scripts/tools/handy/pcdomain-erzeugen.cmd` neu erzeugt (nach Änderungen an `src/domain` bzw. `fasttrack.rs`).
- Daten: `parseExport` hebt zusätzlich `catalog.pc` auf (Tabellen der Ansichten, Supplements nur soweit benutzt).
  Am Handy Erfasstes (Mahlzeiten, Lebensmittel, Wasser, Körperwerte, Trainings) ist eingerechnet (`makeDb`).
- Wasserhaushalt bearbeiten: Gläser antippen wie am PC (`setWaterCount` wie `water::set_count`), Glasgröße wählbar.
  Gespeichert unter IndexedDB-Schlüssel `water`; gesendet mit der Ernährung („LIFESPAN Lebensmittel …“):
  `water_intake`, `deleted_record` (herausgenommene Gläser vom PC) und `settings` `water_glass_ml`.
- „+ Lebensmittel eintragen“ im Tagebuch öffnet „Scanner & Tracken“ für diesen Tag und diese Mahlzeit.
- Tests: `node --test core.test.mjs nutrition.test.mjs body.test.mjs focus.test.mjs pcdb.test.mjs` (44 bestanden); Ansichten mit einem echten Export im iPhone-13-Format durchgespielt (Playwright).

## Version 1.5.1 (13.11.2026): Muskelverteilung der Maschine

- Maschinensuche (Info-Symbol je Maschine) und Maschinenansicht (oben „Muskelverteilung der Maschine“): wie am PC
  (Maschinendatenbank): eigener Fokus der Maschine, sonst die festgelegte Standardverteilung des Bewegungsmusters,
  sonst die Muskelgruppen (`machineFocusInfo` in `app.js`, Regeln in `focusinfo.js`).

## Version 1.5.2 (13.11.2026): mehr Maschinen mit Standardverteilung

- `focusdata.js` neu erzeugt (jetzt mit `scripts/tools/handy/focusdata.ts` über `pcdomain-erzeugen.cmd`):
  90 weitere Einzweckgeräte mit festem Bewegungsmuster, drei neue Kombigeräte-Gruppen („Klimmzug / Dips“,
  „Brustpresse / Schulterpresse“, „Beinpresse / Hack-Squat“), `machineStandard` für Maschinen mit eigener
  Griffbreite ohne Angabe (Technogym „Upper Back“: Rudern mit hohen Ellbogen).
- Für alle Maschinen mit Standardverteilung geprüft: gleiche Verteilung und Überschrift wie am PC.

## Version 1.5.3 (13.11.2026): sechs neue Bewegungsmuster

- `focusdata.js` neu erzeugt: Kreuzheben, Sissy Squat, Rotatorenmanschette (Außenrotation), Nacken, Step-up,
  aufrechtes Rudern (Werte vom Nutzer freigegeben) für 17 Maschinen, dazu Kombigeräte „Kreuzheben / Split Squat“
  und „Kreuzheben / Kniebeuge“. PC und Handy für alle 1.282 Maschinen mit Standardverteilung verglichen.

## Version 1.5.4 (13.11.2026): Muster über den Übungsnamen

- Wie am PC (`NAME_PATTERNS` in gripFocus.ts): freie Übungen, Körpergewicht und Übungen an Mehrzweckgeräten bekommen
  ein Muster über den Namen (z. B. Kabel-Rudern, Kniebeuge, Rumänisches Kreuzheben, Face Pull, Liegestütz, French Press).
- Vorher werden die Namen der Maschine aus dem Übungsnamen entfernt (`nameHint`, `machineNamesOf` in focusinfo.js):
  eine Übung, die wie die Maschine heißt (z. B. „Cable Crossover“), bekommt so kein Muster über den Namen.

## Version 1.6.0 (13.11.2026): Overview wie am PC

- Die Overview zeigt dieselben Karten wie am PC, mit denselben Werten und Grafiken:
  - Tagesbereitschaft, Wochenziele (Ringe), Streaks, Nächstes Training
  - Arbeitssätze je Muskelgruppe, Übungsfortschritt (1RM-Schätzung), Schlaf-Regelmäßigkeit
  - Ballaststoffe/Zucker/Salz, Erinnerungen, Training, Regeneration, Ernährung (Tagesgrafik und Protein-Vorschläge)
  - Schlaf, Alltagsbewegung, Energieverbrauch, Gewichtstrend und „Diese Woche“
- Die Karten stehen in der Reihenfolge, die am PC unter „Übersicht anpassen“ gewählt ist. Ausgeblendete Karten fehlen, leere Karten rücken ans Ende.
- Die Overview lässt sich wie am PC auf einen früheren Tag umschalten.
- `pcoverview.js` rechnet wie der Rust-Kern (overview.rs, insights.rs, dashboard.rs, Cardio, Satzprotokoll). Die Rechenregeln kommen aus `pcdomain.js`, neu erzeugt mit weeklyMuscleSets, describeScheduled und exportReminderState.
- Der Export behält dafür zusätzlich die Termine der Trainingstage, die Messgrößen und die Daten der Check-In-Fotos (ohne Bilder). Für „Nächstes Training“ mit Termin und die Check-In-Erinnerung braucht es einmal einen neuen Export vom PC.
- Noch nicht am Handy: der Wirkstoffspiegel.

## Version 1.6.1 (13.11.2026): Muskel-Körperkarte in der Overview

- Karte „Muskel-Körperkarte“ wie am PC (2D): Vorder- und Rückansicht des Modells aus dem Profil, Arbeitssätze je Muskelteil der laufenden Woche bzw. der Vorwoche, Darstellung Standard / Individuell / Relativ.
- Gerechnet mit `muscleMapForRange` und `muscleLevels` aus src/domain/muscleMap.ts (in `pcdomain.js`), mit eigenem Muskelfokus von Maschinen und Übungen, Bewegungsmustern, Griffbreite und Griffstellung.
- Bilder und Flächen wie am PC: `musclemap/male.webp`, `musclemap/female.webp`, `musclemap/regions.js` (aus src/data/muscle-map). Einen Muskel antippen zeigt Sätze und Stufe.
- Die Darstellung kommt vom PC (Settings `ui.muscle_map`); eine Umstellung am Handy gilt nur auf dem Handy. Zielwerte für „Individuell“ werden am PC eingestellt. Die 3D-Ansicht gibt es nur am PC.
