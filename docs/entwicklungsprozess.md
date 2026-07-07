# Entwicklungsprozess

## MIDI Analyse — Master-Bewerbung Medientechnik

---

## 1. Ausgangslage & Problemstellung

**Kontext:** Der Autor unterrichtet seit Jahren Schlagzeug an einer Musikschule. Der Unterricht wird in drei Räumen mit unterschiedlicher Ausstattung durchgeführt:

- **Raum 1 (Hauptraum):** Casio Digitalpiano → Ableton Live (3,5 Tage/Woche)
- **Raum 2:** Yamaha Digitalpiano → Ableton Live (sporadisch)
- **Raum 3:** Casio Digitalpiano → Ableton Live (sporadisch)

Während des Unterrichts spielt der Lehrer Klavierbegleitung zu den Schlagzeug-Übungen der Schüler. Die MIDI-Daten aller Instrumente werden in Ableton Live aufgezeichnet.

Nach einem halben Jahr Unterricht mit **75+ Schlagzeug-Schülern** stellte sich die Frage:

> **Lässt sich musikalischer Fortschritt von Schlagzeug-Schülern objektiv anhand von MIDI-Daten messen und visualisieren?**

### Datenbasis
- **~75+ Schüler** (variable Teilnahme, daher nicht exakt)
- **>1,3 Millionen MIDI-Noten**
- **~44 Sessions** à **6–9 Stunden**, unterteilt in 30/45-Minuten-Unterrichtsslots
- **Zeitraum:** Januar – Juni 2026
- **Format:** Ableton Live Sets (.als), Standard-MIDI-Dateien (.mid/.midi)
- **3 Fehltage** aufgrund nicht gelöstem .band-Import vom iPad (GarageBand-Dateien der Schüler)

### Datenbesonderheit
Die MIDI-Daten enthalten **zwei Spieler** gleichzeitig:
1. **Lehrer (Autor):** Klavierbegleitung — präzises Timing, Akkorde, Melodien
2. **Schüler:** Schlagzeug (via E-Drums/MIDI-Trigger) — Kick, Snare, HiHat, Becken etc.

Die Trennung dieser beiden Spieler war eine der zentralen technischen Herausforderungen.

---

## 2. Technologieentscheidungen

### Phase 1: Google AI Studio (Prototyp)

Der erste funktionale Entwurf entstand in **Google AI Studio** — ein schneller Prototyp, der die grundlegende Machbarkeit zeigte. Die Einschränkungen der Plattform (kein persistenter State, keine Datenbank) machten jedoch einen Umzug nötig.

### Phase 2: Firebase Firestore (Proof of Concept)

| Entscheidung | Begründung |
|---|---|
| Firebase Firestore | Schnell einsatzbereit, kein Server-Management |
| React + Vite | Moderne SPA, schnelle Builds, große Community |
| Recharts | React-native Charting, einfache Integration |
| TypeScript | Typsicherheit für komplexe Datenstrukturen |

**Problem:** Firestore-Dokumente sind auf 1MB begrenzt. Eine einzelne Session mit >1,3 Mio MIDI-Noten sprengt dieses Limit um Größenordnungen. Firebase wurde zu teuer und unflexibel.

### Phase 3: Eigenes Backend (Python FastAPI + SQLite)

| Entscheidung | Begründung |
|---|---|
| Python FastAPI | Async-fähig, schnell, nah an der Standardbibliothek |
| SQLite | Kein Server nötig, portabel, perfekt für lokales Setup |
| Docker + Docker Compose | Reproduzierbare Umgebung |
| Single Container | FastAPI serviert API + statische Frontend-Dateien, kein nginx |

### Phase 4: Supabase PostgreSQL (Evaluation)

Für eine mögliche Cloud-Deployment-Strategie wurde Supabase PostgreSQL getestet. Die Daten wurden erfolgreich migriert (asyncpg, Connection Pooler via pgbouncer). Da GitHub Pages jedoch kein Backend hosten kann und der eigene Docker-Server die Daten lokal hält, wurde **zurück auf SQLite** gewechselt.

**Fazit:** Für das aktuelle Setup (eigener Server, Docker) ist SQLite die optimale Lösung. Der Supabase-Code bleibt als Option für zukünftige Cloud-Szenarien erhalten.

---

## 3. Zentrale Herausforderungen & Lösungen

### 3.1 >1,3 Millionen Noten im Browser

**Problem:** `Math.max(...array)` und `Math.min(...array)` werfen einen Stack Overflow bei Arrays >125.000 Elementen.

**Lösung:** Sämtliche Spread-Operatoren in Chart-Komponenten durch `reduce()` ersetzt:

```typescript
// Vorher (Absturz bei großen Datensätzen)
const maxTime = Math.max(...notes.map(n => n.time));

// Nachher (stabil)
const maxTime = notes.reduce((max, n) => Math.max(max, n.time), 0);
```

*Betroffene Dateien: ProgressionChart.tsx, AdvancedCharts.tsx, CalendarView.tsx, CreativeVisualizer.tsx, alsParser.ts*

### 3.2 Lazy Loading schwerer Felder

**Problem:** Die List-API aller Sessions lief 44 Sekunden und übertrug 335MB — weil sie `notes_json` für jede Session mitsandte.

**Lösung:**
- Listen-Endpoint verwendet `SELECT` mit konkreten Spalten (kein `SELECT *`)
- `notes_json`, `sliding_tempo_json`, `pedal_analysis_json` werden nur bei gezieltem Aufruf einer Session geladen
- Frontend hat `loadSessionNotesFromCloud()` für lazy-load per useEffect

```python
# Vorher:
SELECT * FROM sessions
# → 335MB, 44s für 41 Sessions

# Nachher:
SELECT id, file_name, session_date, tempo, notes_count, ...
# → 25KB, 0.3s
```

### 3.3 Teacher/Student Split per k-means Clustering

**Problem:** Lehrer und Schüler spielen gleichzeitig — die MIDI-Noten sind in einem Datenstrom ohne Absender-Kennzeichnung.

**Lösung:** k-means-Clustering (k=2) auf die absolute Grid-Abweichung (`|gridOffsetMs|`):

```typescript
// K-Means auf |gridOffsetMs| → zwei Cluster:
// Cluster 0 = Lehrer (präziser, kleiner Drift)
// Cluster 1 = Schüler (größerer Drift, Schlagzeug-Timing)
// Annahme: Lehrer ist präziser → kleinerer Mittelwert
```

Die Clusterzentren trennen zuverlässig die beiden Spieler, da der Lehrer erfahrungsgemäß ein stabileres Timing hat als die Schüler.

### 3.4 .band Import vom iPad (ungelöst)

**Problem:** GarageBand-Dateien (.band) sind Zip-Archive. Der Parser (JSZip) extrahiert die enthaltenen .mid-Dateien korrekt, aber der Import vom iPad Safari schlug fehl. Das Problem war **nicht der allgemeine Upload** (andere Dateitypen funktionieren), sondern spezifisch die .band-Handhabung im mobilen Safari.

**Status:** Ungelöst. Ca. 3 Tage fehlen deshalb im Datensatz. Workaround: MIDI-Dateien direkt aus GarageBand exportieren.

### 3.5 Grid-Raster (1/16tel)

Das Grid ist **mathematisch fest auf 1/16tel = 0.25 Beats** gesetzt, nicht aus der ALS-Datei ausgelesen. Alle Noten werden auf diesen Raster quantisiert:

```typescript
const grid = 0.25;
const nearestGrid = Math.round(playedBeats / grid) * grid;
const gridOffset = playedBeats - nearestGrid; // Positiv = zu spät, negativ = zu früh
```

Da der Lehrer und fortgeschrittene Schüler auch Notenwerte kleiner 1/16tel spielen (32tel, Triolen), werden diese auf das nächstgelegene 16tel-Raster abgebildet. Eine dynamische Grid-Ableitung aus dem kürzesten Notenabstand wäre eine mögliche Verbesserung.

### 3.6 Skalen-Klassifikation & Drums

**Problem:** Die Tonleiter-Analyse klassifizierte alle Noten nach Dur/Moll/Pentatonisch — ignorierte aber, dass Schlagzeug-Noten (Kick=C2, Snare=D2, HiHat=F#2, etc.) keine melodische Funktion haben.

**Lösung:** Noten im Drum-Range (MIDI-Key 36–84, typisches Schlagzeug-Spektrum) werden als `"Percussion"` kategorisiert und von der harmonischen Analyse ausgeschlossen.

### 3.7 Datenmodell-Entwicklung

Das Datenmodell wuchs organisch mit den Metriken:

```
Phase 1 (Google AI Studio): dateiName, datum, tempo, noten (roh)
Phase 2 (Firebase):         + geschaetztesBpm, driftMs, swing
Phase 3 (SQLite):           + velocitySpread, polyphonie, focusScore
Phase 4 (Erweitert):        + teacherStudentSplit, slidingTempo, pedalAnalyse
```

---

## 4. Architektur-Entwicklung

```
v1: Google AI Studio
    ┌──────────────────────┐
    │ Google AI Studio     │
    │ (Prototyp, kein DB)  │
    └──────────────────────┘

v2: Firebase + React SPA
    ┌─────────┐    ┌──────────┐
    │ Browser │───▶│ Firebase │
    │  SPA    │    │ Firestore│
    └─────────┘    └──────────┘

v3: FastAPI + SQLite (aktuell)
    ┌─────────┐    ┌────────────┐    ┌───────┐
    │ Browser │───▶│ FastAPI    │───▶│SQLite │
    │  SPA    │    │ :80 + API  │    │/data/ │
    └─────────┘    │ + Static   │    └───────┘
                   │ + Axinio   │
                   └────────────┘
```

---

## 5. Design-Entscheidungen

### Dark Theme
- Dark Mode (angelehnt an Ableton Live)
- Farbkonstanten zentral in `theme.ts` (keine Magic Numbers)
- Umstellung: initial hatten viele Komponenten **light classes** — nachträglich auf Dark vereinheitlicht

### Manuelles Speichern
- Sessions werden pro Button gespeichert (kein Auto-Save)
- Da das Halbjahr vorbei ist, können die Daten statisch bleiben
- Auto-Save kann später entfernt werden

### Progressive Batch-Loading
- "ALLE AUS DB LADEN" lädt Sessions einzeln statt in einem Request
- Verhindert Timeout bei großen Datenmengen

---

## 6. Metriken im Detail

### Timing Drift
Die fundamentale Metrik. Jede MIDI-Note hat eine `time` in Beats. `nearestGrid` ist der nächste 1/16tel-Punkt.

```
drift_beats = time - nearestGrid
drift_ms = (drift_beats / tempo) * 60 * 1000
```

Positiver Drift = Note kommt zu spät. Negativ = zu früh (vorgezogen).

### Focus Score
Gewichteter Index (0–100):

```python
score = (
    (1 - drift_normalized) * 0.4 +
    (velocity_spread_score) * 0.3 +
    (1 - polyphony_std_normalized) * 0.3
) * 100
```

### Teacher/Student Split
k-means-Clustering (k=2) auf `|gridOffsetMs|`. Annahme: Lehrer hat kleineren Drift → Cluster 0 = Lehrer, Cluster 1 = Schüler.

### Style Classification
Basierend auf Notendichte, Polyphonie und Intervallstruktur:
- **Melodisch:** Wenige Noten, große Intervalle (typisch Klavierbegleitung)
- **Rhythmisch:** Gleichmäßige, repetitive Patterns (typisch Schlagzeug)
- **Polyphon:** Viele gleichzeitige Noten, Akkorde
- **Hybrid:** Mischformen
- **Percussion:** Hauptsächlich Drum-Noten (MIDI-Key 36-84)

---

## 7. Deployment

| Komponente | Technologie |
|---|---|
| Container | Docker, Alpine Linux |
| Host | Dedizierter Linux-Server |
| Netzwerk | Tailscale (gregsplace) |
| Port | 8090 (Host) → 80 (Container) |
| Datenbank | SQLite in Docker-Volume `midi_data:/data` |
| Aktuelle Größe | ~539MB (41 Sessions, >1,3 Mio Noten) |

### Entwicklungs-Workflow
```
git pull → Änderungen in src/ oder backend/
docker compose build app
docker compose up -d --force-recreate app
curl localhost:8090/health
Hard Refresh (Strg+F5)
```

---

## 8. Ausblick

### Kurzfristig
- Grid dynamisch aus Notenabstand ableiten (32tel/Triolen-Unterstützung)
- Skalen-Klassifikation für Drums finalisieren
- Auto-Save entfernen, Daten statisch halten

### Mittelfristig
- .band-Import vom iPad final beheben
- Fehlende 3 Tage nachimportieren

### Langfristig
- **RAG-System:** MIDI-Daten + OneNote-Notizen + Unterrichtsmitschnitte
- **Multi-Schüler-Dashboard:** Lehrer sieht alle 75+ Schüler
- **Oracle-DB:** Falls Cloud-Deployment nötig wird
- **Server-Tunnel** für öffentlichen Zugriff (Tailscale Funnel / Cloudflare Tunnel)

---

## 9. Dateistruktur

```
/
├── src/
│   ├── App.tsx                  # Hauptkomponente, State-Management
│   ├── alsParser.ts             # ALS/MIDI/Band-Parser + Metriken
│   ├── firebase.ts              # REST-API-Client (fetch)
│   ├── theme.ts                 # Zentrale Farbkonstanten
│   └── components/
│       ├── AdvancedCharts.tsx    # Heatmaps, Histogramme
│       ├── CalendarView.tsx      # Kalender-Übersicht
│       ├── ProgressionChart.tsx  # Metrik-Entwicklung über Zeit
│       ├── SessionComparison.tsx # Side-by-Side Vergleich
│       ├── SvgCharts.tsx         # Benutzerdefinierte SVG-Charts
│       ├── CreativeVisualizer.tsx# Kreativ-Visualisierung
│       └── StudentProgress.tsx   # Einzelschüler-Ansicht
├── backend/
│   ├── main.py                  # FastAPI-App, Routing, Axinio-Proxy
│   ├── supabase_db.py           # PostgreSQL-Zugriff (optional)
│   ├── config.py                # DB-Konfiguration
│   └── requirements.txt
├── Dockerfile                   # Multi-Stage-Build
├── docker-compose.yml           # Single-Container
├── index.html                   # Titel "Midi Analyse..."
└── README.md
```

---

## 10. Technisches Glossar

| Begriff | Erklärung |
|---|---|
| **ALS** | Ableton Live Set — Projektdatei von Ableton Live |
| **gridOffsetMs** | Zeitliche Abweichung einer Note vom Raster in Millisekunden |
| **k-means (k=2)** | Clustering-Algorithmus, teilt Daten in zwei Gruppen |
| **MIDI** | Musical Instrument Digital Interface — digitales Notenformat |
| **Recharts** | React-Bibliothek für responsive Diagramme |
| **SPA** | Single Page Application — Client-seitig gerenderte Web-App |
| **Vite** | Moderner Build-Tool für JavaScript/TypeScript |

---

*Dokumentation erstellt Juli 2026 für die Master-Bewerbung Medientechnik.*
*Projekt: Midi_Analysator — github.com/vamperl001/Midi_Analysator*
