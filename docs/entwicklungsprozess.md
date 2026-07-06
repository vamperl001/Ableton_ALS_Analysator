# Entwicklungsprozess

## MIDI Analyse — Master-Bewerbung Medientechnik

---

## 1. Ausgangslage & Problemstellung

Ein Klavierschüler übt täglich auf einem digitalen Piano (Yamaha) und zeichnet seine Sessions in Ableton Live auf. Nach sechs Monaten Unterricht stellte sich die Frage:

> **Lässt sich musikalischer Fortschritt objektiv anhand von MIDI-Daten messen?**

Ziel war es, aus den Rohdaten (Ableton Live Projektdateien, .als) metrische Profile zu extrahieren, die Entwicklung über die Zeit sichtbar zu machen und eine Plattform zu schaffen, die diese Analyse interaktiv darstellt.

### Datenbasis
- ~44 Sessions über 6 Monate (Januar–Juni 2026)
- ~200.000 MIDI-Noten-Events
- Format: Ableton Live Sets (.als), Standard-MIDI-Dateien (.mid/.midi), GarageBand-Projekte (.band)
- Tägliche Übungseinheiten von 15–90 Minuten

---

## 2. Technologieentscheidungen

### Phase 1: Firebase (Proof of Concept)

| Entscheidung | Begründung |
|---|---|
| Firebase Firestore | Schnell einsatzbereit, kein Server-Management |
| React + Vite | Moderne SPA, schnelle Builds, große Community |
| Recharts | React-native Charting, einfache Integration |
| TypeScript | Typsicherheit für komplexe Datenstrukturen |

**Erkenntnis:** Firebase wurde zu teuer und unflexibel. Die Firestore-Dokumente waren auf 1MB begrenzt — eine einzelne Session mit 50.000 MIDI-Noten sprengte dieses Limit. Workaround war nötig, aber nicht nachhaltig.

### Phase 2: Eigenes Backend (SQLite)

| Entscheidung | Begründung |
|---|---|
| Python FastAPI | Async-fähig, schnell, nah an der Standardbibliothek |
| SQLite | Kein Server nötig, portabel, einfaches Deployment |
| Docker + Docker Compose | Reproduzierbare Umgebung, Single-Binary-Deployment |
| Single Container | nginx entfernt, FastAPI serviert auch statische Dateien |

**Architektur-Entscheidung:** Statt nginx + uvicorn wurde FastAPI direkt zum Static-File-Server gemacht. Spart Komplexität und einen Container.

### Phase 3: Supabase PostgreSQL

| Entscheidung | Begründung |
|---|---|
| Supabase PostgreSQL | Vollständig gehostet, 500MB kostenlos, SQL pur |
| asyncpg | Performanter PostgreSQL-Treiber, Pooling, Prepared Statements |
| Connection Pooler (pgbouncer) | Supabase-interne Verbindungsverwaltung |

**Warum der Wechsel?** SQLite liegt als Datei auf dem Server — für eine Deployment-Strategie über GitHub (CI/CD, öffentliche URL) brauchte es eine extern erreichbare Datenbank. Supabase bietet das als Managed Service an.

---

## 3. Zentrale Herausforderungen & Lösungen

### 3.1 200.000 Noten im Browser

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
- Frontend hat `loadSessionNotesFromCloud()` für lazy-load per Button oder useEffect

```python
# Langsam:
SELECT * FROM sessions
# → 335MB, 44s für 41 Sessions

# Schnell:
SELECT id, file_name, session_date, tempo, notes_count, ...
# → 25KB, 0.3s
```

### 3.3 .band Import von iPad

**Problem:** GarageBand-Dateien (.band) sind Zip-Archive. iPad Safari blockierte unbekannte MIME-Types beim Datei-Upload.

**Lösung:**
- JSZip entpackt .band-Archive clientseitig und extrahiert alle .mid-Dateien
- `accept="*/*"` auf dem File-Input umgeht Safaris Filter
- Alle MIDI-Tracks innerhalb eines .band werden zu einer Session zusammengeführt

**Workaround (vom Nutzer gewählt):** MIDI-Dateien direkt aus GarageBand exportieren und umbenennen.

### 3.4 Supabase Migration

**Problem:** Supabase PostgreSQL akzeptiert keine vorbereiteten Statements (Prepared Statements) im Connection Pooler-Modus. 

**Lösung:**
- `statement_cache_size=0` beim asyncpg-Verbindungsaufbau
- Typannotationen mit `::text`, `::timestamptz` in SQL-Queries
- Batch-Insert über einzelne `INSERT ... ON CONFLICT` Statements

```python
pg = await asyncpg.connect(dsn, statement_cache_size=0)
await pg.execute("INSERT INTO sessions (...) VALUES ($1::text, $2::text, ...)")
```

### 3.5 Datenmodell-Entwicklung

Das Datenmodell wuchs organisch mit den Metriken:

```
Phase 1 (Firebase):    fileName, date, tempo, notes (roh)
Phase 2 (SQLite):      + estimatedBpm, avgDriftMs, avgSwing
Phase 3 (Erweitert):   + velocitySpread, polyphony, focusScore
Phase 4 (Lehrer/Sch.): + teacherStudentSplit, slidingTempo, pedalAnalysis
Phase 5 (PostgreSQL):  Umstellung auf TIMESTAMPTZ, JSON-Felder
```

---

## 4. Architektur-Entwicklung

```
v1: Firebase + React SPA
    ┌─────────┐    ┌──────────┐
    │ Browser │───▶│ Firebase │
    │  SPA    │    │ Firestore│
    └─────────┘    └──────────┘

v2: nginx + uvicorn + SQLite (Docker)
    ┌─────────┐    ┌──────┐    ┌────────┐    ┌───────┐
    │ Browser │───▶│nginx │───▶│uvicorn │───▶│SQLite │
    │  SPA    │    │:80   │    │:8000   │    │:data/ │
    └─────────┘    └──────┘    └────────┘    └───────┘

v3: FastAPI single container + SQLite
    ┌─────────┐    ┌────────────┐    ┌───────┐
    │ Browser │───▶│ FastAPI    │───▶│SQLite │
    │  SPA    │    │ :80        │    │:data/ │
    └─────────┘    │ + Static   │    └───────┘
                   └────────────┘

v4 (aktuell): FastAPI + Supabase PostgreSQL (Docker)
    ┌─────────┐    ┌────────────┐    ┌─────────────────┐
    │ Browser │───▶│ FastAPI    │───▶│ Supabase (PG)   │
    │  SPA    │    │ :80        │    │ Pooler :6543    │
    └─────────┘    │ + Static   │    └─────────────────┘
                   │ + Axinio   │
                   └────────────┘
```

---

## 5. Design-Entscheidungen

### Dark Theme
- Dark Mode von Anfang an (passend zum Ableton Live Look)
- Alle Farbkonstanten in `theme.ts` zentralisiert (keine Magic Numbers in Komponenten)
- Späte Vereinheitlichung: CalendarView, SessionComparison, Charts hatten ursprünglich **light classes** — nachträglich auf `text-slate-100`, `bg-slate-800` etc. umgestellt

### Kein Auto-Save
- Sessions werden manuell per Button gespeichert (explizite Aktion statt automatischer Sync)
- Begründung: Der Nutzer importiert oft viele Dateien auf einmal und will selektiv speichern

### Progressives Batch-Loading
- Die "ALLE AUS DB LADEN"-Funktion lädt Sessions nacheinander statt alle auf einmal
- Verhindert Timeout des `/sessions/full`-Endpoints (>30s bei 41 Sessions)
- Nutzer sieht Fortschrittsanzeige `(3/41)`

---

## 6. Metriken im Detail

### Timing Drift
Die fundamentale Metrik. Jede MIDI-Note hat eine `time` in Beats. Die `nearestGrid` ist der nächste Grid-Punkt (1/16 Note). 

```
drift_beats = time - nearestGrid
drift_ms = (drift_beats / tempo) * 60 * 1000
```

Ein positiver Drift = die Note kommt zu spät. Negativ = zu früh.

### Focus Score
Gewichteter Index (0–100):

```python
score = (
    (1 - drift_normalized) * 0.4 +
    (velocity_spread_score) * 0.3 +
    (1 - polyphony_std_normalized) * 0.3
) * 100
```

### Style Classification
Basierend auf Notendichte und Polyphonie:
- **Melodisch:** Wenige Noten, große Intervalle
- **Rhythmisch:** Gleichmäßige Notenabstände, repetitive Patterns
- **Polyphon:** Viele gleichzeitige Noten, komplexe Akkorde
- **Hybrid:** Mischformen

---

## 7. Deployment

| Komponente | Technologie |
|---|---|
| Container | Docker, Alpine Linux |
| Host | Linux Server, Tailscale |
| Domain | gregsplace (Tailscale MagicDNS) |
| Port | 8090 (Host) → 80 (Container) |
| DB | Supabase PostgreSQL (extern) |
| Persistenz | Docker Volume `midi_data:/data` |
| CI/CD | Manuell via `docker compose up --build` |

### Entwicklungs-Workflow
1. Lokale Änderungen in `src/` oder `backend/`
2. `docker compose build app` (→ Vite-Build + pip install)
3. `docker compose up -d --force-recreate app`
4. Health-Check via `curl localhost:8090/health`
5. Hard Refresh im Browser (Strg+F5/Cmd+Shift+R)

---

## 8. Ausblick

### Kurzfristig
- iPad .band-Import finalisieren
- Weitere Analysen: Übungsdauer, Hand-Unabhängigkeit, Tonart-Treue
- GitHub Actions CI für automatischen Build

### Langfristig
- Echtzeit-MIDI-Overlay (WebSocket von Ableton)
- Multi-User (Lehrer sieht alle Schüler)
- Audio-basierte Metriken (Lautstärke, Klangfarbe via FFT)

---

## 9. Dateistruktur (relevant)

```
/
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Hauptkomponente, Routing, State
│   │   ├── alsParser.ts             # ALS/MIDI/Band-Parser
│   │   ├── firebase.ts              # API-Client (REST calls)
│   │   ├── theme.ts                 # Zentrale Farbkonstanten
│   │   └── components/
│   │       ├── AdvancedCharts.tsx
│   │       ├── CalendarView.tsx
│   │       ├── ProgressionChart.tsx
│   │       ├── SessionComparison.tsx
│   │       ├── SvgCharts.tsx
│   │       ├── CreativeVisualizer.tsx
│   │       └── StudentProgress.tsx
│   └── index.html                   # Titel geändert
├── backend/
│   ├── main.py                      # FastAPI-App, Routing, Axinio-Proxy
│   ├── supabase_db.py               # asyncpg-PostgreSQL-Zugriff
│   ├── config.py                    # DB-Konfiguration
│   └── requirements.txt
├── Dockerfile                       # Multi-Stage-Build
├── docker-compose.yml               # Single-Container-Deployment
└── .env.example                     # Vorlage für Umgebungsvariablen
```

---

*Dokumentation erstellt im Juli 2026 für die Master-Bewerbung Medientechnik.*
*Projekt: Midi_Analysator — github.com/vamperl001/Midi_Analysator*
