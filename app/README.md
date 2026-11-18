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

## Version 1.7.0 (14.11.2026): Sleep und Recovery am Handy

- **Sleep** wie am PC (SleepPage.tsx):
  - Ansicht: Schlafdauer je Nacht, Schlafphasen (Mittel und je Nacht), Wochen- und Monatstrend, Einträge mit Nickerchen.
  - Nacht erfassen und bearbeiten: Zeiten, Einschlafdauer, Wachzeit, Wachphasen, Qualität, Efficiency, Light/Deep/REM, Messmethode, Notiz.
  - Nickerchen erfassen und bearbeiten. Einträge (auch die vom PC) lassen sich löschen.
- **Recovery** wie am PC (RecoveryPage.tsx):
  - Ansicht: Selbsteinschätzung je Skala, zeitlicher Vergleich mit Schlaf und Trainingsbelastung (mit den Beobachtungen wie am PC), Einschätzungen.
  - Tag einschätzen (Erholung, Müdigkeit, Muskelkater, Stress).
  - ANS-Werte (Ruhepuls, HRV, Atemfrequenz, Schlag-zu-Schlag-Intervall, ANS-Status mit Balken −10…+10) als Körperwerte erfassen.
- Prüfregeln wie im Rust-Kern (`logsdata.js`, mit Tests): eine Nacht bzw. Einschätzung je Tag, Bereiche der Felder, Nickerchen höchstens 6 Stunden.
- Änderungen gehen mit „Körperwerte, Schlaf & Regeneration senden“ in die Datei „LIFESPAN Körperwerte …“: `sleep_log`, `sleep_nap`, `recovery_log` und Löschvermerke (`deleted_record`). Am PC mit „Abgleichen“ importieren; je Nacht bzw. Tag gilt der neuere Stand.
- Overview, Tagesbereitschaft und Streaks rechnen sofort mit den Einträgen vom Handy.

## Version 1.8.0 (14.11.2026): Insights am Handy

- **Insights** wie am PC (InsightsPage.tsx), mit Wochenwahl:
  - Beobachtungen dieser Woche (mit Datenlage), Wochenanalyse und Datenprüfung, die Bereiche der Woche (Schlaf, Regeneration, Training, Ernährung, Körper) und die Lebensstil-Notizen.
  - Mögliche Zusammenhänge der letzten 12 Wochen (nach Aussagekraft gruppiert) und „Welche Daten die Auswertung verbessern“.
- Die Karten stehen in der Anordnung vom PC (`ui.insights_layout`). Gerechnet wird mit `weeklyAnalysis`, `dataCheck`, `coverage`, `dailyAssociations`, `acwr` und `loadVsNextDay` aus `pcdomain.js`.
- Noch nur am PC: Koffein und Schlaf, Hormongaben und Erholung sowie der Datenauszug (PDF).
- Overview → „Diese Woche“ verlinkt jetzt auf den Wochenrückblick am Handy.

## Version 1.9.0 (14.11.2026): Checklisten am Handy

- **Checklisten** wie am PC:
  - Tageswahl mit Wochenstreifen, der die offenen To-dos je Tag zeigt.
  - To-dos des Tages abhaken, anlegen (an diesem Tag oder täglich/wöchentlich/monatlich bis zu einem Enddatum), Text ändern, sortieren und löschen.
  - Erledigte entfernen und offene To-dos vom Vortag übernehmen.
  - Karte „Heute noch einzutragen“ (`dayStatus`) mit Sprung in den jeweiligen Bereich.
- Regeln wie `checklist.rs` (`todosdata.js`, mit Tests): Text 1–300 Zeichen, neue To-dos ans Ende, gleiche Texte am selben Tag werden beim Eintragen auf mehrere Tage übersprungen.
- Änderungen gehen mit der Datei „LIFESPAN Körperwerte …“ an den PC (Tabelle `todo` und Löschvermerke).
- Eigene Checklisten (Bibliothek, Import aus Excel/Notizen) und die Wochen-/Monatsübersicht mit Trainings und Ruhetagen gibt es bisher nur am PC.

## Version 1.10.0 (14.11.2026): Health am Handy

- **Health** wie am PC (HealthPage.tsx) mit drei Reitern:
  - **Blutabnahmen:** Liste mit Anzahl der Werte und Werten außerhalb des Bereichs; je Abnahme die Werte nach Gruppe mit ↑/↓ und Referenzbereich (laut Befund, sonst eigener Bereich des Parameters, sonst Vorgabebereich AKH Wien nach Geschlecht und Alter laut Profil). Neue Blutabnahme erfassen, bearbeiten (auch „ganze Gruppe hinzufügen“) und löschen.
  - **Verlauf** je Parameter: Diagramm mit grünem Referenzband und roten Punkten außerhalb, darunter alle Werte.
  - **Once in a Lifetime:** Blutgruppe (AB0, Rhesus, Kell) per Auswahl, letzter Lp(a)-Wert aus den Blutabnahmen und Einträge je Bereich (Gentests, Pharmakogenetik, HLA, Allergietests …) anlegen, bearbeiten und löschen.
- Regeln wie `repo/lab.rs` und `repo/lifetime.rs` (`healthdata.js`, mit Tests); Formularlogik und Markierung kommen aus `src/domain/lab.ts`, `labReference.ts` und `lifetime.ts` (in `pcdomain.js`).
- Änderungen gehen mit der Datei „LIFESPAN Körperwerte …“ an den PC (Tabellen `lab_draw`, `lab_result`, `lifetime_record` und Löschvermerke).
- Weiterhin nur am PC: Arztbericht (PDF), Import aus CSV/Excel und die Pflege der Parameter.

## Version 1.11.0 (14.11.2026): Superhuman am Handy

- **Superhuman** wie am PC mit vier Reitern:
  - **HRT:** Hormongabe erfassen und bearbeiten wie am PC (gespeichertes Präparat wählen, als Präparat speichern oder löschen, „Angaben der letzten Gabe übernehmen“, Wirkstoffmenge aus Injektionsvolumen × Konzentration, Injektionsort und Kanüle aus bisherigen Angaben, Hinweis auf abgelaufene Charge und auf doppelt erfasste Gaben). Dazu Übersicht je Art und das HRT-Protokoll mit Zeitraum, Bearbeiten und Löschen.
  - **Wirkstoffspiegel:** Modellrechnung aus den Gaben (2 Wochen, 3 Monate, 1 Jahr) mit Fortsetzung ohne weitere Gaben, Abgleich mit Blutwerten aus Health und den Kennwerten der Wirkstoffe.
  - **Wirkstoffrechner:** Lösung aus einem oder mehreren Wirkstoffen, Menge aus Volumen, Volumen für eine Menge, Wochendosis und Intervall, Inhalt einer Ampulle, Pulver auflösen.
  - **Checkliste Injektion:** abhaken, Punkte ändern, ergänzen, sortieren, löschen, Häkchen zurücksetzen, Vorlage wiederherstellen.
- Regeln wie `repo/hrt.rs` (`superdata.js`, mit Tests); Formular- und Rechenlogik aus `src/domain/hrt.ts`, `hormoneLevel.ts`, `doseCalc.ts`, `hrtChecklist.ts` (in `pcdomain.js`).
- Änderungen gehen mit der Datei „LIFESPAN Körperwerte …“ an den PC (`hrt_entry`, `hrt_product`, Einstellung `ui.hrt_checklist` und Löschvermerke).
- Weiterhin nur am PC: Protokoll, Auswertung und Substanzen (PEDs, Medikamente, Peptide).

## Version 1.12.0 (14.11.2026): Körperwerte aus dem Waagen-Screenshot

- **Body & Longevity → Werte erfassen → „Aus Bild übernehmen“:** Screenshot der Waagen-Auswertung (Hume) wählen. Die Texterkennung (offline) liest je Kachel den aktuellen (rechten) Wert; eine Vorschau zeigt Name im Bild → Körperwert und den Wert zum Prüfen, Ändern oder Abwählen. „Ins Formular übernehmen“ trägt die Werte für den gewählten Tag ein und setzt die Messmethode „Hume …“, gespeichert wird mit „Werte speichern“.
- Zuordnung und Prüfung wie am PC (`src/domain/scaleScan.ts` in `pcdomain.js`): unscharfe Namen, Wert rechts vom Pfeil, A/G in Prozent → Verhältnis, Herzfrequenz wird nicht übernommen; Werte außerhalb des Bereichs oder mit starker Abweichung zum vorherigen Wert sind abgewählt und markiert.
- Neue Körperwerte „Grundumsatz (BMR)“ und „Gesundheitspunktzahl“ (unter „Kennzahlen“) gibt es ab der Desktop-Version 1.0.122; am Handy erscheinen sie nach dem nächsten Export.

## Version 1.12.1 (14.11.2026): Waagen-Screenshot sicherer lesen

- Zwei Durchgänge der Texterkennung; gleiche Lesarten zählen, unterschiedliche werden markiert und abgewählt.
- A/G-Verhältnis mit zwei Stellen abgeschnitten (113,6 % → 1,13).
- Strengere Prüfung: über 20 % Abweichung zum vorherigen Wert im Bild, fehlendes Komma (51,7 › 52) und Körperfettmasse ≠ Gewicht × Körperfettanteil werden markiert und nicht vorausgewählt.

## Version 1.12.2 (14.11.2026): Waagen-Auswertung auch als PDF

- „Aus Bild übernehmen“ nimmt auch die PDF-Datei der Hume-App bzw. den „ganze Seite“-Screenshot von iOS (das Bild in der PDF wird ausgelesen).
- Drei Durchgänge der Texterkennung, die Mehrheit zählt; die Gesundheitspunktzahl wird zusätzlich aus dem Kopfbereich gelesen.
- Als Ziffer gelesene Einheiten werden abgeschnitten („86.0kg“ → „86.09“ → 86,0), als Ziffer gelesene Pfeile/Symbole korrigiert („5 › 5 ⇆“ → „256“ → 5); Korrekturen werden nur vorausgewählt, wenn ein zweiter Durchgang sie bestätigt.
- Getestet mit der Original-PDF: alle 12 vorausgewählten Werte stimmen (Gewicht 86,0, Fett 10,3 %, Fettmasse 8,8, Magermasse 73,6, Subkutan 7,7, Viszeral 5, A/G 1,13, Skelettmuskel 51,9, Skelettmasse 11,1, Wasser 67,9 %, Zellmasse 52,8); BMR 1935 und Punktzahl 774 werden gelesen, sobald die Messgrößen vom PC (1.0.122) da sind.

## Version 1.12.3 (14.11.2026): „PDF einfügen“ und berechnete Körperwerte

- Der Knopf heißt „PDF einfügen“ (Bilder gehen weiterhin).
- Gesundheitspunktzahl, BMR und Herzfrequenz erscheinen in der Vorschau nicht und werden nicht übernommen.
- „Werte erfassen“ rechnet wie am PC selbst: Magermasse in Prozent (Magermasse ÷ Gewicht), Unterhautfettanteil (subkutane Fettmasse ÷ Gewicht), BMI (Gewicht ÷ Körpergröße² laut Profil) sowie Anteil Skelettmuskulatur und A/G-Verhältnis (aus Android/Gynoid). Berechnete Felder sind gesperrt, zeigen die Rechnung und werden mit gespeichert.

## Version 1.13.0 (14.11.2026): Superhuman – Protokoll, Auswertung, Substanzen

- Superhuman hat jetzt alle Reiter wie am PC (`SuperhumanPage.tsx`): **Protokoll** (Einnahme
  erfassen, bearbeiten, löschen; Zeitraum 7/30/90/365 Tage oder alle), **Auswertung** (je Substanz
  Einträge, Tage, Summe, Ø je Eintrag, erster/letzter Eintrag; Wochensummen der letzten
  12 Kalenderwochen als Balken) und **Substanzen** (PEDs, Medikamente, Peptide anlegen, ändern,
  archivieren, löschen).
- Prüfregeln wie `repo/protocol.rs`: Name eindeutig (ohne Groß-/Kleinschreibung), Einheit und
  Anwendung aus den festen Listen, Menge 0,001–100 000, Löschen einer Substanz nur ohne Einträge.
  Rechnung aus `src/domain/protocol.ts` (in `pcdomain.js`).
- Daten: `protocol_substance` und `protocol_entry` kommen mit der Exportdatei und gehen mit
  „Körperwerte … senden“ an den PC (Löschungen als Löschvermerk); der PC-Import kennt beide Tabellen.

## Version 1.14.0 (14.11.2026): Health vollständig – Arztbericht, Import, Parameter

- Health hat jetzt alle Reiter wie am PC (`HealthPage.tsx`):
  - **Arztbericht:** Zeitraum (Von/Bis oder 30 Tage, 90 Tage, 6 Monate, 12 Monate), auf Wunsch mit
    Hormontherapie (wenn „Secret Protocols“ am PC an ist), Vorschau und PDF wie
    `doctorReport.ts`/`doctorReportPdf.ts`. Das PDF wird über „Teilen“ weitergegeben oder als Link
    zum Öffnen angeboten; Daten aus Body, Training und Schlaf wie `report_data` (`doctorReportData`).
  - **Import:** Laborwerte aus CSV oder Excel (.xlsx) mit Vorschau, übersprungenen Zeilen und neu
    angelegten Parametern; Übernahme wie `lab.rs import_rows` (alles oder nichts, vorhandene
    Abnahme am selben Datum/Uhrzeit wird ergänzt, gleicher Parameter ersetzt).
  - **Parameter:** Gruppen zum Auf-/Zuklappen (anfangs zu), eigener Bereich, Referenz AKH Wien,
    internationale Referenzwerte mit Balken für den letzten Wert, Wirkstoffspiegel-Verknüpfung;
    anlegen, bearbeiten, archivieren, eigene ohne Werte löschen (Regeln wie `lab.rs`).
- `lab_analyte` geht jetzt mit „Körperwerte … senden“ an den PC (Abgleich über ID bzw. Namen).

## Version 1.15.0 (14.11.2026): Checklisten vollständig – Wochen-/Monatsübersicht und Bibliothek

- **Wochen-/Monatsübersicht** wie `ScheduleOverview.tsx` (anfangs zugeklappt): je Tag geplantes
  Training (Termine der Pläne), erfasste Einheiten, To-dos (abhaken, ändern, löschen, neu je Tag),
  Alarme (nächste Hormongabe, wenn „Secret Protocols“ am PC an ist) und Hinweise Restday/Krank
  (setzen, ändern, entfernen – `training_day_status` wie `day_status.rs`). Im Monat optional auch
  Tage ohne Termine. Tägliche Erinnerungen bleiben eine Einstellung des PCs.
- **Checklisten-Bibliothek** wie `ChecklistLibrary.tsx`: Checklisten anlegen, bearbeiten (Punkte
  sortieren, entfernen, mehrere Zeilen auf einmal hinzufügen), abhaken, Haken zurücksetzen, löschen,
  als To-dos des gewählten Tages übernehmen, als PDF oder Excel teilen; Import aus Excel (.xlsx),
  CSV, Text/Markdown oder eingefügtem Text aus Apple Notizen (Regeln wie `checklist.rs`).
- Neue Datei `checklistdata.js` (mit Tests); `checklist` und `checklist_item` kommen jetzt mit der
  Exportdatei und gehen mit „Körperwerte … senden“ an den PC.

## Version 1.16.0 (14.11.2026): iCoach.me am Handy

- Neuer Bereich **iCoach.me** wie `ICoachPage.tsx` mit den Reitern:
  - **Evolve:** die 16 Module; je Modul der Sprung zu den passenden Fragen. Die Videos liegen im
    Video-Ordner des PCs und werden nur dort abgespielt.
  - **Ask iCoach.me:** 2.063 Fragen & Antworten aus „Die Masterclass“, „Blutwerte“ und „Blutgruppen“
    nach Buch, Teil und Kapitel, Suche über alle (Hervorhebung), Sicherheitshinweis, Fundstelle
    öffnet das Buch an der Seite. Daten: `icoach/icoachme-faq*.json` (wie `src/data`), erst beim
    Öffnen geladen.
  - **Downloads:** die drei Bücher als PDF. Für die öffentliche Seite mit AES-256 und Benutzerpasswort
    verschlüsselt (`qpdf --encrypt <Passwort> <zufälliges Eigentümerpasswort> 256 --print=full
    --modify=none --extract=n`); das Passwort steht nicht im Code.
  - **Magazin:** 16 Magazine und Reports mit Titelbild, Inhalt und „Das lernst du“, nach Rubrik
    filterbar (`icoach/magazin/<id>.pdf|jpg` aus `src-tauri/assets/magazine` und `public/magazin`).
  - **Widgets:** Koffein-Zeitstrahl wie `CaffeineWidget.tsx` (Einschlafzeit, Halbwertszeit,
    Getränk, Uhrzeit, Menge; Kennzahlen, Diagramm, Rest zur Einschlafzeit). Einnahmen in
    `caffeine_intake` (neue Datei `caffeinedata.js`, Regeln wie `caffeine.rs`), gehen mit
    „Körperwerte … senden“ an den PC.
- Der Ordner `icoach/` (≈ 20 MB) liegt nur auf GitHub Pages und wird aus den Quellen des PCs
  erzeugt; er ist nicht Teil von `mobile/` im PC-Repository.

## Version 1.16.1 (14.11.2026): Bildschirmbreite, Mahlzeiten, Bücher

- **Reiter umbrechen** in mehrere Reihen statt seitlich zu wischen (Health, Superhuman, iCoach.me
  und alle anderen Bereiche); Knopfgruppen und Datumsfelder bleiben innerhalb der Bildschirmbreite.
- **Nutrition → Tagebuch:** Mahlzeiten lassen sich auf- und zuklappen (leere Mahlzeiten sind
  anfangs offen, gefüllte zu – wie am PC).
- **Checklisten → Heute noch einzutragen:** Spalten linksbündig.
- **iCoach.me:** Bücher und Magazine liegen unter `media/icoach/` außerhalb des App-Bereichs und
  öffnen sich in einem eigenen Fenster; mit „Fertig“ bzw. ✕ kommt man zurück in die App, auch wenn
  das Passwort nicht eingegeben wird.

## Version 1.16.2 (14.11.2026): neues Heft im Magazin

- **iCoach.me → Magazin:** neues Heft „Brutto vs. Netto: Welche Kalorie zählt?“ (iCoach.Me Magazin ·
  Ernährung, 3 Seiten) in der neuen Kategorie **Ernährung**; PDF unter `media/icoach/magazin/brutto-netto.pdf`,
  Titelbild unter `icoach/magazin/brutto-netto.jpg`. Daten aus `src/domain/magazines.ts` (pcdomain.js neu gebaut).

## Version 1.17.0 (14.11.2026): Training wie am PC

- **Training** hat jetzt alle Reiter der Desktop-App (TrainingPage.tsx), auf Handybreite:
  - **Einheiten:** alle Einheiten vom PC und vom Handy mit Übungen, Arbeitssätzen, Volumen und
    Dauer, Restdays und Krankheitstage in der Liste; „Tag starten“ (Trainingstag aus Plan),
    „Training starten“, **Nachtragen** (Datum, Uhrzeit, Dauer), **Restday**/**Krankheit** mit den
    Meldungen wie am PC, **Cardio erfassen**; Volumen je Woche (8 Wochen). Einheiten vom PC lassen
    sich öffnen und bearbeiten (`core.workoutFromPc`, alle übrigen Spalten bleiben erhalten).
    Nach einer Einheit aus einem Plan: „In den Plan übernehmen“ (wie `plan::adopt_workout`).
  - **Auswertung:** letzte 7 Einheiten, Muskel-Körperkarte (Volumen/Arbeitssätze), Muskeln unter
    dem Zielvolumen, Volumen je Muskelgruppe mit Veränderung und Matrix je Einheit, Zuweisen
    fehlender Muskelgruppen, Hinweise zur Datenlage.
  - **Cardio:** Zeitraum und Art, Kennzahlen, Minuten je Woche (WHO-Linien), Zeit in den
    Herzfrequenzzonen (wie `heart::get`), Fitness-Trend, Bestwerte, alle Cardio-Einheiten
    (wie `cardio_report::sessions`).
  - **NEAT:** Alltagsbewegung je Tag erfassen, ändern, löschen (Regeln wie `neat::save`),
    Kalorien durch Schritte, Schrittziel, Energieverbrauch des Tages, letzte 14 Tage.
  - **Pläne:** anlegen, bearbeiten (Tage, Übungen mit Sätzen, Pause, Notiz, Termine), kopieren,
    löschen, Tag starten – Logik `planDraft` der Desktop-App, Speichern wie `plan::save`.
  - **Datenbank:** Übungsdatenbank (anlegen, bearbeiten, löschen, Filter), Maschinendatenbank
    (Suche, Hersteller, Kategorie, Muskelgruppe, „nur im Training verwendete“, Details),
    Sportarten-Datenbank (anlegen mit Bild, bearbeiten, löschen). Import und Master-Editor nur am PC.
  - **Check-Ins:** Foto aufnehmen oder wählen (verkleinert wie am PC), Pose, Datum, Uhrzeit,
    Vergleich vorher/nachher, Fotoanleitung, alle Check-Ins mit Filter.
  - **Verlauf:** Verlauf je Übung (Gewicht, 1RM, Volumen, Wiederholungen, Strecke), Bestleistungen,
    Arbeitssätze je Muskelgruppe (4 Wochen), Bestleistungen aller Übungen.
- Neue Dateien: `training.js` (Rahmen, Einheiten, Pläne, NEAT), `trainingstats.js` (Auswertung,
  Verlauf, Cardio), `trainingdb.js` (Datenbank, Check-Ins), `trainingdata.js` (Änderungen am Handy,
  mit Tests). Änderungen gehen mit „Körperwerte … senden“ an den PC.
- Für Pläne und Check-Ins braucht es eine neue Exportdatei vom PC (Tabellen `training_plan*`,
  `checkin_photo`); pcdomain.js enthält jetzt die Trainingslogik der Desktop-App.

### Version 1.18.0 (14.11.2026): Offene Daten vor dem Senden

- Settings → „Offene Daten ansehen und bearbeiten“ (auch unter „An den PC senden“): alles, was am
  Handy erfasst oder geändert und noch nicht am PC ist, nach Bereichen (Training, Nutrition,
  Checklisten, Sleep & Recovery, Body & Longevity, Health, Superhuman, Koffein).
- Je Eintrag: **Ansehen** (alle Felder lesbar, Verweise als Namen), **Bearbeiten** (öffnet den
  Eintrag im jeweiligen Bereich mit dessen Prüfungen), **Verwerfen** (dann gilt wieder der Stand vom
  PC) bzw. bei Löschungen **Löschen zurücknehmen**.
- Zusammengehöriges erscheint als ein Eintrag (Plan mit Tagen/Übungen/Sätzen, Blutabnahme mit Werten,
  Checkliste mit Punkten). Neu angelegte Einträge, die noch anderswo verwendet werden (z. B. eine neue
  Übung in einem offenen Plan), lassen sich erst verwerfen, wenn das verwendende verworfen ist.
- Ernährung: Verweis auf „Vor dem Senden prüfen“ (Menge, Tag, Mahlzeit direkt ändern).
- Neue Datei `pending.js` mit Tests (`pending.test.mjs`).

### Version 1.19.0 (14.11.2026): Lebensmittel in Mahlzeiten auswählen

- Nutrition → Tagebuch: Kästchen vor jedem Lebensmittel (bei mehreren auch „Alle auswählen“).
- Mit Auswahl: **Als Gericht speichern** (Vorlage mit genau diesen Mengen, geht mit „Lebensmittel
  senden“ an den PC) und **In andere Mahlzeit kopieren** (Tag und Mahlzeit frei wählbar).
- **Eintragen zu Datum**: ganze Mahlzeit (oder die Auswahl) in einen frei wählbaren Tag eintragen –
  wie am PC (dort ersetzt es „Heute erneut eintragen“, Desktop 1.0.125).
- nutrition.js: `saveItemsAsDish`, `copyItemsTo` (mit Test).

### Version 1.20.0 (14.11.2026): Reiter als Auswahl am linken Rand, Overview ohne Startknöpfe

- Die Reiter jedes Bereichs (Training, Nutrition, Health, Superhuman, iCoach.me) stehen nicht mehr als
  Knopfreihe da, sondern als auf- und zuklappbare Auswahl am linken Rand: zu nur der gewählte Reiter
  (orange, mit ▸), aufgeklappt alle Reiter untereinander mit oranger Linie. Nach der Wahl klappt sie zu.
  Umgesetzt zentral in `foldTabs()` (app.js) für alle `nav.tabs`.
- Overview: „Plan starten“ und „Freies Training“ entfernt (Training starten unter Training → Einheiten).

### Version 1.21.0 (14.11.2026): Design C „Flame Drive“

- Neues Design in den Logo-Farben (Navy, Ozeanblau, Türkis, Flammen-Orange): schräg angeschnittener
  Navy-Kopf mit orangem und türkisem Streifen, Überschriften und Zahlen in schmaler, kursiver
  Sportschrift (Barlow Condensed von Google Fonts, offline im Service Worker gespeichert), Karten-
  überschriften mit orangem „/“, Menü links in Navy mit oranger Markierung.
- Untere Leiste für die Hauptbereiche: Overview, Training, „+“ (Schnell erfassen), Nutrition, Mehr
  (öffnet das Menü). Ausgeblendet, solange ein Training läuft oder unten ein Speichern-Knopf steht.
- „Schnell erfassen“: Mahlzeit, Wasser, Gewicht & Körperwerte, Training, Schlaf, Recovery, To-do,
  Koffein mit einem Tipp.
- nav.js: `tabbarHtml`, `quickSheetHtml`; app.js: `renderNav` mit Leiste, `quickGo`.

### Version 1.22.0 (14.11.2026): Menü von unten

- Das Menü (☰ oben oder „Mehr“ unten) fährt jetzt als Fach von unten hoch: alle Bereiche als Kacheln in
  drei Reihen (vier je Reihe, auf kleinen Handys drei) – mit dem Daumen gut erreichbar; ✕ zum Schließen.

### Version 1.23.0 (14.11.2026): Alle Menüs von unten

- Die Reiter-Auswahl der Bereiche (Training, Nutrition, Health, Superhuman, iCoach.me) öffnet sich jetzt
  ebenfalls als Fach von unten: Bereichsname mit ✕, Reiter als große Kacheln in zwei Spalten, der aktive
  orange umrandet; Schließen auch per Tipp auf den abgedunkelten Hintergrund. Damit bauen sich Hauptmenü,
  „Schnell erfassen“ und Reiter-Auswahl einheitlich von unten auf.

### Version 1.24.0 (14.11.2026): Untere Leiste frei belegen

- Settings → „Untere Leiste“: Die beiden Plätze links und rechts vom „+“ sind frei wählbar (alle Bereiche
  mit Handy-Ansicht, jede Kombination, auch zweimal derselbe). Overview und „Mehr“ bleiben fest.
  „Standard“ setzt Training und Nutrition zurück. Gespeichert in den Einstellungen am Gerät (`prefs.barSlots`).

### Version 1.25.0 (14.11.2026): Konto ohne PC

- Neues Konto direkt am Handy anlegen – für jemanden ohne PC: auf dem Startbildschirm („Ohne PC starten“)
  oder unter Settings → Konten → „Neues Konto anlegen“. Abgefragt werden Name, Geschlecht, Geburtsdatum
  und Größe (wie das Profil am PC).
- Das Konto startet mit dem Startpaket `startpaket.json` (wie ein neuer Benutzer am PC): Maschinendatenbank
  mit Muskelgruppen (ohne Bilder), Lebensmitteldatenbank, Übungsbibliothek und Sportarten. Erzeugt wird es
  am PC mit `scripts\tools\handy\startpaket-erzeugen.py` (alle Migrationen, Startdaten; optional
  Muskelfokus aus einem PC-Export und `--mit-supplements`). Kompaktes Format (Spalten + Zeilen), ca. 0,3 MB
  komprimiert, offline im Service Worker gespeichert.
- Mehrere Konten auf einem Gerät: jedes Konto hat einen eigenen Speicherbereich (store.js `useAccount`,
  Schlüssel-Präfix je Konto; das bisherige Konto bleibt unverändert als Hauptkonto). Wechseln und Löschen
  (zweimal tippen) unter Settings → Konten. Die App bittet den Browser um dauerhaften Speicher.
- core.js: `expandCompact`, `accountDoc`; `parseExport` nimmt auch Objekte und kompakte Dateien.
- Folgt: Supplement-Erfassung am Handy, Herstellerpakete importieren, „Alles an den PC senden“ und am PC
  „Als neuen Benutzer anlegen“.

### Version 1.26.0 (14.11.2026): Supplements am Handy erfassen

- Nutrition → Tagebuch → Supplements: „Supplements eintragen“ und Tipp auf einen Eintrag zum Bearbeiten –
  wie der Einnahme-Editor am PC: Einnahme (Mahlzeit des Tages, nüchtern, unabhängig; eine noch leere
  Standardmahlzeit wird angelegt), Uhrzeit, Stack übernehmen, Supplements suchen (Name, Hersteller) mit
  Startmenge (Tagesdosis bzw. 1), Mengen ändern, entfernen, Notizen; „Vom Tag entfernen“.
  Einnahmen vom PC lassen sich ebenfalls ändern oder entfernen (Löschvermerk für den Abgleich).
- Mikronährstoffe und Tagessumme rechnen die am Handy erfassten Supplements sofort mit.
- Gesendet wird mit „Lebensmittel senden“ (`supplement_intake`, `supplement_intake_item`, Löschvermerke;
  beim Konto am Handy auch die verwendeten Supplements mit Nährwerten). Offene Daten zeigen die Einträge.
- Aus der PC-Exportdatei behält die App jetzt alle nicht archivierten Supplements mit Nährwerten (bisher
  nur verwendete) und die eigenen Nährstofffelder vollständig (Gruppe, eingebaut – eigene Felder fehlten
  bisher in den Mikronährstoffen).
- Startpaket mit Supplement-Datenbank (3.849 Supplements, `--mit-supplements`); Nährwerte schlank ohne
  IDs/Zeitstempel (Spaltenliste `a` im kompakten Format), ca. 0,65 MB komprimiert.
- Neue Datei supplements.js (+ supplements.test.mjs).

### Version 1.27.0 (14.11.2026): Herstellerpakete am Handy

- Settings → Herstellerpakete: Pakete aus der Liste der App (PEAK, GymBeam, IronMaxx, #sinob, Proteini.si –
  Ordner `pakete/` mit `index.json`) oder eine Paketdatei wählen. Vorschau wie am PC (neu / schon vorhanden,
  neue Nährstofffelder, ausgelassene Werte bei anderer Einheit, übersprungene Einträge mit Grund), dann
  „Installieren“. Gleiche Regeln wie `vendor_package.rs`: vorhandene Einträge (gleiche ID, Lebensmittel
  gleicher Name + Marke, Supplements gleicher Name) bleiben, eine neuere Version ergänzt nur Neues.
- Neue Lebensmittel stehen sofort im Tracker, neue Supplements bei „Supplements eintragen“. Alles geht mit
  „Lebensmittel senden“ an den PC (`food`, `supplement`, `supplement_value`, `nutrient_field`,
  `vendor_package`, `vendor_package_item`) – das Paket zählt dabei als ein Eintrag. Noch nicht gesendete
  Pakete lassen sich zurücknehmen (schon verwendete Einträge bleiben).
- Neue Dateien vendor.js (+ vendor.test.mjs) und vendorui.js; Paketliste erzeugen mit
  `scripts\tools\handy\pakete-fuers-handy.py` (kopiert daten\Hersteller-Pakete nach mobile\pakete).

### Version 1.28.0 (14.11.2026): Tagesziele am Handy

- Settings → Tagesziele (auch aus Nutrition: „Tagesziele festlegen“ / „Trinkziel festlegen“): Aufbau und
  Prüfregeln wie am PC (GoalsPanel, `goals::save`): Gültig ab, Kalorienziel fest oder dynamisch aus dem
  Gesamtverbrauch (Defizit/Halten/Überschuss in kcal oder % des Verbrauchs), Protein in g, g je kg oder %,
  Kohlenhydrate und Fett in g oder %, Schlaf, Zielgewicht, Schritte, Trinkziel, Kalibrierung. Neuer
  Zielstand übernimmt den zuletzt gültigen; bisherige Zielstände bearbeiten oder löschen.
- Tagessumme, Wasserhaushalt, Overview und Streaks nutzen die Ziele sofort. Gesendet wird mit „Körperwerte …
  & Tagesziele senden“ (`daily_goal`, Löschvermerke); Offene Daten unter „Settings – Tagesziele“.
- Neue Dateien goals.js (+ goals.test.mjs) und goalsui.js.

### Version 1.29.0 (14.11.2026): Ganzes Konto an den PC

- Settings → Konten → „Ganzes Konto an den PC“ (nur bei einem Konto am Handy): eine vollständige Exportdatei
  „LIFESPAN Konto <Name> <Datum>.json“ im Format der Desktop-App – Grunddaten des Startpakets, Profil und alles
  am Handy Erfasste (Trainings, Ernährung, Supplements, Herstellerpakete, Wasser, Körperwerte, Schlaf,
  Checklisten, Health, Superhuman, Koffein, Training-Daten, Tagesziele). Löschvermerke sind angewendet,
  Einträge gelöschter Eltern entfallen.
- Am PC ohne neue Desktop-Version: neuer Benutzer (Settings → Benutzer → „Neuen Benutzer anlegen“, wechseln)
  und Daten importieren → „Ersetzen“; bestehender Benutzer → „Abgleichen (zweites Gerät)“.
- Danach „Alles als übertragen markieren“ (`mark-sent` mit `all`).
- Neue Datei accountexport.js (+ accountexport.test.mjs); Datei gegen den Importablauf des PCs geprüft
  (Migrationen bis zum Schemastand, alle Zeilen, Fremdschlüssel, Integrität).

### Version 1.30.0 (14.11.2026): BLS 4.0 als optionaler Download

- Settings → „BLS 4.0 (Bundeslebensmittelschlüssel)“ → „BLS herunterladen“ (ca. 2 MB, auf dem Gerät ca. 8 MB,
  einmal je Gerät für alle Konten; „Vom Gerät entfernen“). Gleiche Datei wie am PC (`bls/bls_4_0.json`,
  7.140 Lebensmittel, 138 Nährstoffe, Max Rubner-Institut 2025, CC BY 4.0).
- Die Lebensmittelsuche (Tracker und Gerichte) zeigt BLS-Treffer unter den eigenen Lebensmitteln; ein Tipp
  übernimmt das Lebensmittel wie am PC (`blsFoodInput`: Marke „BLS 4.0“, je 100 g, Kennzeichen → 0 mit Notiz,
  keine Angabe bleibt leer) und wählt es zum Eintragen. „BLS durchsuchen“ zeigt alle Nährstoffe je Gruppe.
- Neue Dateien bls.js (+ bls.test.mjs) und blsui.js. Übernommene Lebensmittel gehen wie eigene an den PC.

### Version 1.31.0 (14.11.2026): Alle Menüs von unten

- Alle Auswahlmenüs öffnen sich einheitlich als Fach von unten – jetzt in einem eigenen Bereich direkt im
  Body (`#sheet-root`), sodass kein Element der Seite (schräg geschnittener Kopf, Karten, Scrollbereiche,
  untere Leiste) das Fach abschneiden oder überdecken kann. Hintergrund antippen oder ✕ schließt.
- Reiter aller Bereiche (Training, Nutrition, Health, Superhuman, iCoach.me), Auswahlgruppen mit
  `data-sheet` (Magazin-Kategorien, Checklisten) und geöffnete Inhalte mit `data-sheet-panel` (iCoach.me-Module:
  Tipp auf ein Modul öffnet es von unten, die Seite bleibt an ihrer Stelle).
- app.js: `foldTabs()` neu mit `showSheet()`/`sheetToggle()`; Klicks im Fach über `sheetRoot`.

### Version 1.32.0 (14.11.2026): Untermenü-Knopf unten

- In der unteren Leiste stehen jetzt zwei runde Knöpfe im Stil von „Schnell erfassen“: „+“ öffnet wie bisher
  Schnell erfassen, der Knopf mit zwei Punkten öffnet das Untermenü der Seite (die Reiter von Training,
  Nutrition, Health, Superhuman, iCoach.me) als Fach von unten. Der Reiter-Knopf oben links entfällt dann.
  Seiten ohne Untermenü zeigen nur „+“. Ohne untere Leiste (z. B. laufendes Training) bleibt der Knopf oben.
- nav.js: `tabbarHtml({ …, sub })`, Symbol `ICONS.sub`; app.js: `S.subMenu` aus `foldTabs()`, Klasse
  `has-submenu` am Body.
- Behoben: Die Settings-Seite war seit 1.30.0 breiter als der Bildschirm (langes Wort in der BLS-Überschrift);
  Überschriften und Texte in Karten brechen jetzt um.

### Version 1.33.0 (15.11.2026): Untermenü auf allen Seiten

- „+“ und „:“ in der unteren Leiste stehen weiter auseinander.
- Der Knopf mit zwei Punkten gibt es jetzt auf allen Seiten: Er öffnet alle Auswahlmenüs der Seite in einem
  Fach (Reiter, dazu z. B. Magazin-Kategorien oder Checklisten-Auswahl als eigene Gruppe). Seiten ohne
  Auswahlmenü (Overview, Checklisten, Schlaf, Recovery, Body & Longevity, Insights, Settings) zeigen die
  Abschnitte der Seite – ein Tipp springt zum Abschnitt. Die Auswahlknöpfe oben in der Seite entfallen dann.
- app.js: `foldTabs()` sammelt alle Gruppen, Schlüssel „page“; Aktion `sheet-jump`.

### Version 1.34.0 (15.11.2026): Runde Knöpfe auf der Oberkante der Leiste

- Die untere Leiste hat wieder vier gleich breite Hauptpunkte (Overview, zwei frei wählbare Bereiche, Mehr).
- Die runden Knöpfe schweben mit ihrer Mitte auf der Oberkante der Leiste: „+“ (Schnell erfassen) zwischen
  dem ersten und zweiten Punkt, „:“ (Untermenü) zwischen dem dritten und vierten.
- nav.js: `tabbarHtml` mit `.tabbar__grid` (4 Spalten) und `.tabbar__fab--a/--b` (absolut, 25 % / 75 %).

### Version 1.35.0 (15.11.2026): Weiße Knöpfe, Leiste eingerückt

- Die runden Knöpfe „+“ und „:“ sind weiß mit orangem Rand und orangem Zeichen.
- Menüpunkte und Knöpfe der unteren Leiste haben mehr Abstand zum Seitenrand (`--bar-pad`, 7 % der Breite,
  14–48 px); die Knöpfe bleiben genau zwischen Punkt 1/2 und 3/4.

### Version 1.36.0 (15.11.2026): Größere Hauptpunkte

- Symbole (26 statt 22 px) und Schrift (0,8 statt 0,7 rem) der vier Hauptpunkte in der unteren Leiste sind
  größer; Höhe und Anordnung der Leiste bleiben gleich. Zu lange Namen enden mit „…“.

### Version 1.37.0 (15.11.2026): Waagen-PDF – Kachel auf zwei Zeilen

- Behoben: Las die Texterkennung eine Kachel der Waagen-Auswertung als zwei Zeilen („10.3 %“ und „› 10.4 %“),
  wurde der vorherige Wert übernommen (Körperfettanteil 10,3 statt 10,4). Jetzt gilt bei nur einer Zahl in der
  Wertzeile die Folgezeile mit Pfeil bzw. Zahl als aktueller Wert (`splitTile` in scaleScan, gleich am PC in
  src/domain/scaleScan.ts mit Test).

### Version 1.38.0 (15.11.2026): Neuer Kopf mit Figur (Entwurf „APP 1“)

- Im Navy-Kopf aller Seiten steht statt des orangen und türkisen Streifens die Figur aus dem Logo (Hand mit
  Flamme), um 10° gekippt (`icons/figur.png`, freigestellt aus der Grafik des Nutzers).
- Overview: großer Kopf mit den heute gegessenen kcal, Tagesbedarf, offenen kcal und Protein/KH/Fett
  (gleiche Rechnung wie die Karte Ernährung, `overviewHero` in overview.js), die Figur groß rechts daneben.

### Version 1.48.0 (17.11.2026): Settings am Handy bearbeiten

Entscheidung des Nutzers vom 17.11.2026: Profil, Benutzer, Mahlzeiten, Messmethoden, Darstellung, Tageswechsel,
Erinnerungen, Schnellerfassung, Seiten anpassen, Secret Protocols und Import/Export sind am Handy änderbar.

- **Mit dem PC abgeglichen** (`pcsettings.js`, Speicher „pcsettings“, geht mit „Körperwerte … senden“ als
  `settings`, `profile` und Löschvermerke `settings:<Schlüssel>` an den PC; dort gewinnt der neuere Stand):
  Profil (Prüfregeln des PCs über `validateProfile` in pcdomain.js), Mahlzeiten (`meal_name.*`, `meal_hidden`,
  `meal_extra`; der PC zieht beim Abgleich wie unter Settings → Mahlzeiten nach: Einträge mit Inhalt behalten
  den alten Namen, festgeschriebene Tage ab heute folgen der Liste), Messmethoden (`measurement_methods`),
  Tageswechsel (`ui.day_start`, seit Desktop 1.0.138 auch am PC in der Datenbank), Seiten anpassen
  (`ui.*_layout`, Bearbeiten-Modus auf der Seite selbst über `layoutedit.js`; Karten, die nur der PC kennt,
  behalten ihren Platz) und Secret Protocols (`secret_protocols`; aus = Superhuman nicht im Menü, wie am PC).
  Offene Daten zeigen je Bereich einen Eintrag „Einstellung“ bzw. „Profil“ zum Verwerfen.
- **Nur auf diesem Handy** (`devprefs.js`, in `S.prefs`): Darstellung (Hell/Dunkel/Wie das Handy; dunkles Design
  über `html[data-theme="dark"]`, untere Leiste mit oder ohne Text), Erinnerungen (Wiegen, Supplements,
  nächste Hormongabe wie `domain/reminders.ts` am PC: ab der Uhrzeit, einmal am Tag, nur solange nichts
  eingetragen ist; Karte „Erinnerungen“ in der Overview und – wenn erlaubt – Benachrichtigung, nur solange die
  App geöffnet ist), Schnellerfassung (Reihenfolge, ausblenden) und Import/Export (Erinnerung ans Senden nach
  1–14 Tagen, nach dem Senden automatisch als übertragen markieren).
- Konten: andere Konten umbenennen; der Name gilt beim nächsten Wechsel auch im Profil. Der Name des
  angemeldeten Kontos ist der Profilname.
- „Heute“ mit Tageswechsel: `appday.js` (`C.appDay`), genutzt von Tagebuch, Body, Ernährung und neuen Trainings.
- Neue Dateien: pcsettings.js, devprefs.js, appday.js, layoutedit.js (+ pcsettings.test.mjs, devprefs.test.mjs).
  pcdomain.js neu erzeugt (zusätzlich `domain/profile.ts` und `domain/reminders.ts`).

### Version 1.47.0 (17.11.2026): Mahlzeiten-Liste, Koffein in der Nacht, Wochenabschluss

- Mahlzeiten wie am PC (Settings → Mahlzeiten): eigene Namen, abgewählte Standardmahlzeiten und bis zu
  10 Mahlzeiten (`meal_name.*`, `meal_hidden`, `meal_extra` aus der Exportdatei, `setMealConfig` in
  nutrition.js). Eigene Mahlzeiten haben den Schlüssel `x:<Name>` (Mahlzeit `other` mit Namen). Beim
  Eintragen gibt es ein Uhrzeit-Feld ohne Vorgabe; ohne Uhrzeit erscheint vorher ein Hinweis mit Sprung ins
  Feld („Ohne Uhrzeit eintragen“ bleibt möglich).
- Koffein-Widget: Einschlafzeit und Halbwertszeit bleiben gespeichert (Gerätespeicher `caffeineSettings`,
  sonst `ui.caffeine` vom PC) und gelten auch für „Koffein vor dem Schlafen“.
- Sleep → Nacht im Detail: „Koffein anzeigen“ legt den Koffeinspiegel als gestrichelte braune Linie mit
  eigener Skala über die Herzfrequenz (`nightCaffeineLevels`); Antippen der Nachtgrafiken zeigt Uhrzeit und
  Werte (`nightHover` in logs.js).
- Sleep, Recovery und Import/Export in der Anordnung vom PC (`ui.sleep_layout`, `ui.recovery_layout`,
  `ui.transfer_layout`). Recovery: ANS-Werte und Einschätzungen zeigen höchstens 10 Einträge, der Rest per
  Bildlauf.
- Checklisten: „To-dos am Montag, 16.11.2026“ mit ‹ › und Wochentag überall; am Sonntag Wochenabschluss
  (abhaken, bearbeiten, quittieren, löschen; Quittierungen im Gerätespeicher `weekReview`).
- Trainingsliste zeigt HYROX-Wettkämpfe (`describeCompetition` in hyrox.js).
- Settings: neue Karten „Einstellungen vom PC“ und „Was am Handy geht“ (settingsview.js).
- Polar: Schritte über den Tag werden beim Abgleich am PC nachgezogen (Bericht in wearabledata.js neu
  gebündelt).

### Version 1.46.1 (16.11.2026): Herstellerprodukte nur noch als Pakete

- `startpaket.json` (Konto am Handy) enthält keine Herstellerprodukte mehr: 56 allgemeine Lebensmittel
  (BLS 4.0), keine Supplements. Hersteller und Shops gibt es als Pakete unter Import/Export →
  Herstellerpakete (`pakete/index.json`, jetzt 12 Pakete: u. a. neu Bodylab24, ESN, More Nutrition,
  Rühl24, VAST Sports, Vitaminversand24). Erzeugt mit `scripts/tools/pakete/hersteller-pakete-erzeugen.py`
  und `scripts/tools/handy/pakete-fuers-handy.py`.
- Bestehende Handy-Konten behalten ihre Einträge; am PC ordnet 1.0.135 sie einmalig den Paketen zu.

### Version 1.46.0 (16.11.2026): HYROX-Ablauf und Wettkampf, Datenbanken als Datei

- Training → Übung hinzufügen: „Hyrox-Simulation (komplett)“, „Hyrox-Wettkampf (Frauen)“ und
  „Hyrox-Wettkampf (Männer)“ legen alle 16 Abschnitte eines Rennens an (8 × 1 km Laufen, jeweils gefolgt
  von SkiErg, Sled Push, Sled Pull, Burpee Broad Jumps, Rudern, Farmers Carry, Sandbag Lunges, Wall
  Balls) – mit Strecke bzw. Wiederholungen, beim Wettkampf mit den Gewichten der Klasse (Regelwerk
  25/26). Fehlende Stationsübungen werden am Handy angelegt. Logik in `hyrox.js` (gleiche Werte wie
  `src/domain/hyrox.ts` am PC).
- Sled Push, Sled Pull, Farmers Carry und Sandbag Lunges zeigen neben Minuten und km eine Spalte kg;
  Satznotizen („Lauf 3 von 8“, „inkl. Schlitten“) stehen unter dem Satz.
- Wettkampf-Angaben im laufenden Training: Wettkampf Frauen/Männer, Wettkampfklasse (Division), Ort,
  Altersklasse, Endzeit, Platz gesamt und in der Altersklasse (jeweils „von“). Beim Wechsel der Klasse
  werden die Stationsgewichte eingetragen. Gespeichert in den Spalten `competition`, `comp_*` der
  Tabelle `workout` (Schema 60), Prüfung wie am PC (`checkCompetition`).
- Import/Export: neue Karte „Lebensmittel- und Supplementdatenbank“ – Export und Import im gleichen
  Dateiformat wie am PC (`lifespan-os-katalog`, `catalogfile.js`, `catalogui.js`). Beim Import kommen
  nur neue Einträge dazu (Prüfregeln und Felderabgleich aus `vendor.js`).

### Version 1.45.6 (16.11.2026): Import/Export im Menükopf

- Menü: Knopf **„Import/Export“** im Kopf neben dem Schließen-Knopf (`drawer__transfer`, Bereich `transfer` mit
  `header: true` in nav.js – nicht in der Liste und nicht als Platz der unteren Leiste wählbar).
- Neue Seite `viewTransfer` (app.js): An den PC senden (mit offenen Daten), Daten vom PC (Exportdatei laden, mit
  Hinweis auf „Für die Handy-App exportieren“ am PC), ganzes Konto an den PC (Konto am Handy), Herstellerpakete,
  BLS 4.0, Weg zu Health → Blutzucker. Settings behält Konten, Tagesziele, untere Leiste, Hilfe und einen Verweis.
- Senden, Offene Daten, Pakete und BLS führen zurück zu Import/Export; Hinweise „unter Settings …“ heißen jetzt
  „unter Import/Export …“ (am PC ab 1.0.133 ebenfalls Import/Export).

### Version 1.45.5 (16.11.2026): Koffein beim Schlaf, Schritte über den Tag

- Sleep: Karte „Koffein vor dem Schlafen“ (`sleepCaffeineHtml` in icoach.js, wie SleepCaffeineCard am PC): der
  Zeitstrahl aus dem Koffein-Widget für den Abend vor der letzten erfassten Nacht; Einschlafzeit = Zubettgehen plus
  Einschlafdauer (`fallAsleepClock` in caffeinedata.js + Test), ohne Eintrag 22:00; Halbwertszeit 5 Stunden.
- Overview: Karte „Schritte über den Tag“ (`stepsDayHtml` in heart.js, Karten-ID `wearable-steps`): bis jetzt
  gesammelte Schritte der Uhr neben dem Median derselben Uhrzeit der bisherigen Tage (bis 28 Tage, ab 3 Tagen).
  Rechnung `stepDayCompare` aus wearableMore.ts des PCs – wearabledata.js neu gebündelt.
- Tageswahl der Overview: iOS-Datumsfeld ragte über den Weiter-Knopf – bleibt jetzt in seiner Spalte.

### Version 1.45.4 (16.11.2026): Koffein-Eingabe aufgeräumt

- iCoach.me → Widgets → Koffein: Eingabe in zwei Blöcke „Dein Abbau“ (Einschlafzeit, Halbwertszeit) und
  „Neue Einnahme“ (Getränk, Uhrzeit, Menge, Umrechnung, Eintragen). Alle Felder gleich hoch (48 px), Einheit im
  Feld, Hinweise über die ganze Breite. iOS-Uhrzeitfelder ragten über ihre Spalte und waren höher – behoben
  (`-webkit-appearance: none`, linksbündig). Stile `.cf-*` in app.css.

### Version 1.45.3 (16.11.2026): Koffein-Widget mit Koffein aus Nutrition

- iCoach.me → Widgets → Koffein: Der Zeitstrahl zählt jetzt wie am PC (`caffeine::list_with_nutrition`) auch
  Koffein aus Nutrition: Supplement-Einnahmen mit dem Nährstoff Koffein (z. B. Pre-Workout), direkt
  eingetragene Nährwerte einer Mahlzeit und das Fasttracking des Tages – vom PC und am Handy erfasst. Ohne
  Uhrzeit gilt die Uhrzeit der Mahlzeit bzw. eine angenommene (nüchtern 07:30, Frühstück 08:00 …), markiert
  „(angenommen)“. Einträge der Schnellerfassung am PC zählen nur einmal. Diese Einträge sind nur zu lesen
  (bearbeiten unter Nutrition). `nutritionIntakes`/`dayIntakes` in caffeinedata.js + Test; `pcdb.intakesOn`
  liefert `createdAt`. Lebensmittel haben keinen Koffeinwert (wie am PC).

### Version 1.45.2 (16.11.2026): Lebensmittel-Export mit verwendeten Supplements

- Fehlerbehebung: Nach 1.45.1 lehnte der PC die Datei mit „Supplement-Einträge, Eintrag 1: verweist auf einen
  Eintrag, der in der Datei fehlt“ ab (`supplement_intake_item.supplement_id` → `supplement`). Bisher gingen
  Supplements nur bei einem Konto vom Handy mit. Jetzt immer die verwendeten (ohne Notizen); Nährwerte nur für
  eigene bzw. bei einem Konto vom Handy. Am PC bleibt beim Abgleich der gleiche oder neuere Stand. Gegen das
  echte Schema (Migrationen 1–59, Fremdschlüsselprüfung wie im Import) mit der Datei des Nutzers geprüft.

### Version 1.45.1 (16.11.2026): Lebensmittel-Export mit Stack

- Fehlerbehebung: „Lebensmittel senden“ mit einer Supplement-Einnahme aus einem gespeicherten Stack (vom PC)
  wurde am PC abgelehnt („Eingenommene Supplements, Eintrag 1: verweist auf einen Eintrag, der in der Datei
  fehlt“). Der PC prüft die Datei vollständig (`supplement_intake.stack_id` → `supplement_stack`). Jetzt gehen
  der verwendete Stack und die verknüpfte Mahlzeit (auch eine vom PC) mit (`withIntakeParents` in
  supplements.js + Test). Beim Abgleich gewinnt am PC weiterhin der neuere Stand.

### Version 1.45.0 (16.11.2026): Atemfrequenz, Blutzucker am Handy, Zonen, Arztbericht

- Health → Heart: Karte „Atemfrequenz in der Nacht“ (Verlauf, letzte 7 Tage gegen die 28 davor). Sleep →
  Nacht im Detail: Verläufe von Herzfrequenz, HRV und Atemfrequenz über die Nacht (`nightLineSvg`, Daten
  `wearable_recovery.hrv_samples/breathing_samples`, Schema 59).
- Health → Blutzucker: Dateien (LibreView, Dexcom Clarity, eigene CSV) direkt am Handy einlesen und eigene
  Messungen eintragen (`glucosedata.js` + Test, Speicher „glucose“). Gehen mit „Körperwerte … senden“ an den
  PC; dort zählt derselbe Messwert über Quelle + Zeitpunkt + Art (keine Doppelten). Neue Karte „Blutzucker
  und Alltag“: Anstieg nach Mahlzeiten nach Kohlenhydraten, Training (vorher/während/danach), Schlaf.
- Training → „♥ Puls“ zeigt die Zeit je Herzfrequenzzone (Zonen der Uhr, sonst eigene Zonen).
- Arztbericht: mit Messungen der Uhr und Blutzucker, sobald pcdomain.js neu erzeugt ist (doctorReport.ts).
- Kompakte „Für Handy exportieren“-Datei vom PC (Export\Handy, `compact: true`) wird wie jede Exportdatei
  geladen (`expandCompact`).

### Version 1.44.0 (15.11.2026): Blutzucker, Tageszeitstrahl, Puls je Einheit, Pausenklänge

- Health → neuer Reiter „Blutzucker“ (`glucose.js`, Daten `glucose_reading` aus dem PC-Export, Schema 58):
  Mittelwert, Zeit im Bereich 70–180 mg/dl mit allen Konsens-Bereichen, Schwankung (CV), GMI ab 10 Tagen,
  Tagesverlauf mit Mahlzeiten aus dem Tagebuch und Anstieg danach, Tagesprofil (Median, 25–75 %, 10–90 %),
  Mittelwert je Tag und Nächte 00–06 Uhr. Import (LibreView, Dexcom Clarity, CSV, Apple Health) am PC.
- Health → Heart: Herzfrequenz und Schritte auf einem 24-Stunden-Zeitstrahl, Ebenen einzeln abschaltbar
  (`timelineSvg` in heart.js, Schritte aus `wearable_day.step_samples`). „±0“ statt „−0“ bei „Gemessene
  Erholung“ (`signedText`).
- Sleep → Gemessene Nächte: alle Schlafwerte von Polar im Detail (Teilwerte, kurze/lange Unterbrechungen,
  Schlafziel, eigene Bewertung, Kontinuitätsklasse, Gerät). Trainings der Uhr zeigen die HRV im Training,
  wenn das Gerät Schlag-zu-Schlag-Abstände liefert.
- Training → Einheiten: „♥ Puls“ klappt die Herzfrequenz einer abgeschlossenen Einheit auf (wie
  `workout_heart.rs` am PC: Training der Uhr, sonst Ausschnitt der ganztägigen Werte).
- Pausentimer: dieselben Klänge wie am PC (`sounds/`, reihum, Signalton als Ersatz) über Web Audio. Auf
  dem iPhone nur, solange die App geöffnet ist – Web-Apps dürfen im Hintergrund keinen Ton abspielen.
- wearabledata.js enthält jetzt auch `src/domain/glucose.ts`.

### Version 1.43.0 (15.11.2026): Mehr Polar-Daten (Polar Loop und Uhren)

- Health → Heart: **Gemessene Erholung heute** (`recoveryTodayHtml`: HRV, Ø und niedrigste Herzfrequenz der
  Nacht, gemessener Schlaf, Atemfrequenz, Hauttemperatur gegen den eigenen Ø der 28 Tage davor, ab 5 Tagen;
  Einstufungen nur „laut Polar“), Trainings der Uhr zum Aufklappen mit Herzfrequenz-Verlauf, Zeit in den Zonen
  und Belastung, **Belastung laut Uhr** (Cardio Load, Strain, Tolerance, Verhältnis), **Temperatur, SpO2 und
  EKG** (nur Uhren mit Elixir-Sensoren, sonst Hinweis) und **Tag und folgende Nacht** (Koffein, letzte
  Mahlzeit, Belastung, Supplements gegen HRV, niedrigste HF, Schlafwert, Schlafdauer der Nacht danach).
- Sleep → Gemessene Nächte: Schlafwert je Nacht, **letzte Nacht im Detail** (Schlafverlauf als Leiste,
  Kontinuität, Zyklen, Sleep Charge, SleepWise: Wachheit, Schlafträgheit, bevorzugtes Schlaffenster).
- Daten aus dem PC-Export ab 1.0.129 (Schema 57): zusätzlich `wearable_day`, `wearable_sleepwise`,
  `wearable_biosensing` in `KEEP_TABLES` (ohne `raw_json`); Tageskontext aus `caffeine_intake`, `meal`,
  `supplement_intake` (`contextOf` in heart.js, wie `wearable_data::day_context` am PC).
- `wearabledata.js` ist jetzt ein Bündel aus `src/domain/wearable.ts` und `src/domain/wearableMore.ts` des PCs
  (esbuild, ES2022, Einstieg `export * from "./wearable"; export * from "./wearableMore";`). Übernehmen eines
  Uhr-Trainings ins Training und der Verbrauchsvergleich Uhr/App gibt es nur am PC.

### Version 1.42.0 (15.11.2026): Health → Heart, gemessene Nächte (Polar)

- Health → neuer Reiter **Heart** (`heart.js`, `heartTabHtml`): Herzfrequenz am Tag (Kennzahlen, Verlauf über
  24 Stunden, Zeit in den Trainingszonen mit den Zonen wie in Training → Cardio, `heartOn`), niedrigste
  Herzfrequenz der Nacht und HRV (RMSSD, Nightly Recharge) mit Vergleich „letzte 7 Tage gegen 28 Tage davor“
  (ab 3 Werten je Zeitraum), nächtliche Erholung, Trainings der Uhr. Ohne Laborwerte öffnet Health direkt Heart.
- Sleep → Karte **Gemessene Nächte (Uhr)** (`measuredSleepHtml`): Ø gemessener Schlaf, Tief-/REM-Anteil,
  Schwankung der Einschlafzeit, Ø niedrigste Herzfrequenz, Vergleich mit der eigenen Angabe, Liste je Nacht.
- Daten aus dem PC-Export (ab 1.0.128, Schema 56): `heart_rate_day`, `wearable_sleep`, `wearable_recovery`,
  `wearable_exercise` in `KEEP_TABLES` (pcdb.js), ohne `raw_json`. Am PC kommen sie über Settings → Polar.
- Rechnungen in `wearabledata.js`, erzeugt aus `src/domain/wearable.ts` des PCs (dort testen; neu erzeugen mit
  `tsc --target es2022 --module esnext wearable.ts`). Import des Polar-Datenexports direkt am Handy (Weg 2)
  folgt, sobald eine echte Exportdatei vorliegt.

### Version 1.41.0 (15.11.2026): Feste Leisten, keine Vergrößerung, direkte Links, Check-In schnell

- Kopf und untere Leiste bleiben stehen: kein Überziehen beim Scrollen (`overscroll-behavior: none` auf html
  und body), keine seitliche Verschiebung (`overflow-x: clip`).
- Keine Vergrößerung beim Antippen eines Felds (`maximum-scale=1` im Viewport) – nach einer Eingabe ist das
  nächste Feld direkt antippbar. Nach dem Schließen der Tastatur rastet die Ansicht wieder ein
  (`settleViewport()` in app.js, ersetzt `resetZoom()`).
- Sprungziele landen unter dem Kopf: `--head-h` (gemessen in `measureHead()`), `scroll-padding-top` auf html;
  „Abschnitte“ im Untermenü nutzen `scrollIntoView`.
- Links in der Übersicht führen direkt zum Ziel: Erinnerung Check-In-Fotos → Training → Check-Ins;
  Gewicht, Umfänge, Griffkraft, VO2max → Body → Werte erfassen beim passenden Bereich
  (`REMINDER_TARGET` in overview.js, `data-tab="entry:<Bereich>"`, `bodyOpenEntry()` in body.js).
- Schnell erfassen: neuer Eintrag „Check-In-Foto“ (Training → Check-Ins, Foto aufnehmen oder wählen);
  „Gewicht & Körperwerte“ öffnet direkt „Werte erfassen“.

### Version 1.40.0 (15.11.2026): Körperwerte sofort sichern

- Body & Longevity → Werte erfassen: „Übernehmen und speichern“ (Aus Bild übernehmen) speichert die
  übernommenen Werte sofort. Geänderte Werte werden außerdem automatisch gespeichert, wenn ein Bereich
  verlassen wird (Fokus wechselt z. B. von Umfänge zu Vitalwerte), beim Tageswechsel, beim Verlassen der
  Ansicht (`bodyLeave()` in `go()`) und wenn die App in den Hintergrund geht. Merker `day.dirty`,
  Speichern über `autoSave()` in body.js (wie „Werte speichern“, ohne die Ansicht zu wechseln).

### Version 1.39.0 (15.11.2026): Zwei neue Magazine

- iCoach.me → Magazin: „Vom Lebensmittel zur Kalorie“ (Ernährung) und „Macht Soja dich weiblich?“ (Gesundheit &
  Werte) – gleiche Einträge wie am PC (`MAGAZINES` in pcdomain.js), Titelbilder in `icoach/magazin/`, PDFs
  (verkleinert, 1240 px, JPEG 60) unter `/media/icoach/magazin/`.

### Version 1.49.0 (17.11.2026): Weekly Reports unter Insights

- Neue Karte „Weekly Reports“ ganz oben unter Insights (`weeklyreports.js`): Berichte, die der PC jeden Montag
  für die abgeschlossene Woche erstellt (Tabelle `weekly_report` der Exportdatei, in `pcdb.js` `KEEP_TABLES`).
  „Lesen“ zeigt den Bericht wie am PC (`weeklyReportHtml` aus pcdomain.js), „PDF“ erzeugt das PDF wie am PC
  (`weeklyReportToPdf`, freigestelltes Logo `lifespan-logo-freigestellt.png`) und gibt es über Teilen weiter.
  Superhuman-Teile nur bei eingeschalteten Secret Protocols.
- Korrektur: Insights brach ab, wenn eine Karte leer war (`layout` fehlte in `insightsview.js`).

### Version 1.50.0 (17.11.2026): Dateien aus Google Drive am iPhone

- Dateiauswahl für „Neue Exportdatei laden“, Lebensmittel-/Supplementdatenbank und Hersteller-Pakete ohne
  `accept`-Filter: Google Drive meldet JSON-Dateien in der App „Dateien“ nicht als JSON, iOS lehnte sie als
  „nicht unterstützter Dateityp“ ab. Der Inhalt wird wie bisher beim Einlesen geprüft.
- Passt zum Austausch-Ordner der PC-App (1.0.141): dort legt der PC die Handy-Datei ab.

### Version 1.51.0 (17.11.2026): Hinweis auf neue Weekly Reports

- Overview → „Erinnerungen“: „Neuer Weekly Report: KW …“, sobald die geladene Exportdatei einen Montagsbericht
  enthält, der noch nicht angesehen wurde. „Lesen“ öffnet ihn unter Insights; „✕“ blendet den Hinweis aus.
- Gesehen = `prefs.wrSeen` (Wochenbeginn des zuletzt gesehenen Berichts, je Gerät); Öffnen unter Insights zählt
  ebenfalls. Kein Hintergrund-Push – die PWA zeigt den Hinweis, sobald sie geöffnet ist.

## Version 1.52.0 (18.11.2026): Darstellung nach der Prüfung

- Tabellen „Volumen je Einheit“ (Training → Auswertung) und „Volumen je Muskelgruppe und Woche“ (Training → Verlauf)
  zerfielen: Die allgemeine Regel `.num` (runder Zahlenknopf) traf die Tabellenzellen. Jetzt normale Zellen,
  erste Spalte bleibt beim seitlichen Wischen stehen. Gleiche Muskelteile werden zu einer Zeile zusammengefasst
  (`D.trainingGroupLabels.mergeLabeledGroups`, ab neu erzeugter pcdomain.js).
- Keine Trennung mitten im Wort mehr (Überschriften, „Zuweisen“, NEAT-Liste); Zahl und Einheit bleiben zusammen.
- Lange Seitentitel kleiner statt „BODY & LON…“; im Menükopf auf schmalen Handys nur das Logo.
- ANS-Skala: −10 und +10 bleiben in der Karte. Wirkstoffrechner: Name über die ganze Breite.
- Listen mit mehr als 10 Einträgen: „Alle … Einträge anzeigen“ statt Bildlauf in der Seite.
- Overview-Karten lassen sich zuklappen (Tippen auf den Kopf, gespeichert je Gerät: `lifespan.overview.collapsed`).
- Schnell erfassen in 3 Spalten; Text-Knöpfe in Listen mit 44 px Tippfläche; Health-Einleitung nur auf dem ersten Reiter.
- Schrift „Barlow Condensed“ liegt in `fonts/` (OFL, `fonts/OFL-Barlow-Condensed.txt`) – keine Anfrage an Google
  Fonts mehr; der Service Worker speichert sie mit den App-Dateien.
- Schlaf-Einträge: Pfeil statt „Bearbeiten“ (der ganze Eintrag ist tippbar).

## Version 1.53.0 (18.11.2026): kleinerer Kopf mit Schritten

- Overview-Kopf: kcal-Zahl, Tagesbedarf und Makros etwa 15 % kleiner, Figur klein oben rechts wie auf den
  anderen Seiten. Rechts neben den kcal stehen die Schritte zum Tagesschrittziel im gleichen Stil (große Zahl,
  Ziel, Balken; `heroSteps` in `overview.js`, Werte aus der Alltagsbewegung des Tages). Ohne Schritte und ohne
  Schrittziel entfällt der Block.
- Insights → mögliche Zusammenhänge: „Eiweiß und Erholung am Folgetag“ entfällt (wie am PC 1.0.151, ab neu
  erzeugter pcdomain.js).
