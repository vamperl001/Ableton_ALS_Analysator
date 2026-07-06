# MIDI Analyse — Halbes Jahr Musikunterricht

**Timing-Analyse von MIDI-Klavierdaten aus dem Ableton Live Ökosystem**

Ein webbasiertes Analyse-Tool, das MIDI-Noten aus Ableton Live Projekten (.als, .mid, .band) extrahiert und mit über 20 Metriken das rhythmische und musikalische Profil eines Klavierschülers über 6 Monate Unterricht vermisst.

> **Status:** Produktiv | **Backend:** Python FastAPI + Supabase PostgreSQL | **Frontend:** React + TypeScript + Vite | **Laufzeit:** Docker

---

## Über das Projekt

Dieses Projekt entstand aus der konkreten Fragestellung: *Lässt sich der Fortschritt eines Klavierschülers in den ersten sechs Monaten Unterricht objektiv anhand von MIDI-Daten messen?*

Der Schüler spielte täglich auf einem digitalen Piano (Yamaha), das MIDI-Daten an Ableton Live sendete. Aus über 40 Sessions wurden rund 200.000 MIDI-Noten analysiert.

### Analysen

| Metrik | Beschreibung |
|---|---|
| **Timing Drift** | Abweichung jeder Note vom nächstgelegenen Grid-Raster in ms |
| **Swing Factor** | Verhältnis der Achtel-Offbeats zum Grid |
| **Tempo / BPM** | Geschätztes Tempo aus Notenabständen |
| **Drift Histogram** | Verteilung der Drift-Werte über alle Noten |
| **Velocity Spread** | Anschlagsdynamik (laut/leise) über die Zeit |
| **Polyphony** | Gleichzeitige Noten (Griffgröße) |
| **Focus Score** | Gewichteter Qualitätsindex aus Drift, Velocity, Polyphonie |
| **Sliding Tempo** | Tempo-Entwicklung innerhalb einer Session |
| **Style Classification** | Automatische Kategorisierung (melodisch/rhythmisch/polyphon) |
| **Pedal Analysis** | Nutzung des Sustain-Pedals |
| **Teacher/Student Split** | Gegenüberstellung von Lehrer- und Schülereinspielungen |
| **Kalenderansicht** | Tägliche Drift-Entwicklung als Heatmap |
| **Progression Chart** | Metrik-Entwicklung über alle Sessions |
| **Session Comparison** | Side-by-Side Vergleich zweier Sessions |

---

## Architektur

```
┌─────────────────────────────────────────┐
│              Browser (SPA)               │
│  React + TypeScript + Recharts + Framer │
└──────────────────┬──────────────────────┘
                   │ HTTP REST
┌──────────────────▼──────────────────────┐
│         Python FastAPI Backend           │
│  ┌──────────┐  ┌────────────────────┐   │
│  │ API      │  │ Axinio-Proxy       │   │
│  │ Sessions │  │ (host.docker:8081) │   │
│  └────┬─────┘  └────────────────────┘   │
└───────┼──────────────────────────────────┘
        │
┌───────▼──────────────────────────────────┐
│      Supabase PostgreSQL (oder SQLite)    │
│         Connection Pooler (pgbouncer)      │
└───────────────────────────────────────────┘
```

### Container (Docker)

- Single-Container-Architektur: Python FastAPI serviert sowohl die REST-API als auch das gebaute React-Frontend (statische Dateien)
- Kein nginx — FastAPI übernimmt Static-File-Serving und Routing
- Port 80 (Container) → Port 8090 (Host)
- Axinio Proxy: `/api/axinio/*` → `host.docker.internal:8081`

---

## Datenstruktur (PostgreSQL)

Jede Session wird als ein Datensatz in `sessions` gespeichert mit:
- **Metadaten:** Dateiname, Datum, Tempo, BPM, Notenanzahl
- **Analysedaten als JSON-Felder:** Velocity Spread, Polyphonie, Sliding Tempo, Pedalanalyse
- **Noten:** Alle 200k+ MIDI-Events als serialisiertes JSON-Array (lazy-loaded)

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    file_name TEXT UNIQUE NOT NULL,
    session_date TEXT,
    tempo REAL, estimated_bpm REAL,
    notes_count INTEGER,
    avg_velocity REAL, avg_drift_ms REAL, avg_swing REAL,
    estimated_key TEXT,
    style_category TEXT, structure_category TEXT,
    focus_score REAL,
    notes_json TEXT,             -- Lazy-loaded (kann >50MB sein)
    teacher_student_json TEXT,
    velocity_spread_json TEXT,
    polyphony_json TEXT,
    sliding_tempo_json TEXT,
    pedal_analysis_json TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Dark Theme

Die gesamte UI verwendet ein einheitliches dunkles Farbschema, definiert in `src/theme.ts`:

- **Hintergrund:** slate-950 / slate-900
- **Text:** slate-100 / slate-200 / slate-400
- **Border:** slate-700 / slate-600
- **Akzente:** indigo, emerald, violet, amber, rose
- **Chart-Farben:** auf dark abgestimmte Gradienten und Grid-Linien

---

## Lizenz

Projektarbeit, eingereicht im Rahmen einer Master-Bewerbung Medientechnik.
