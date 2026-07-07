# MIDI Analyse — Halbes Jahr Musikunterricht

**Metriken-gestützte Fortschrittsanalyse von 75+ Schlagzeug-Schülern im Einzelunterricht**

Ein webbasiertes Analyse-Tool, das MIDI-Noten aus Ableton Live Projekten (.als, .mid, .band) extrahiert und mit über 20 Metriken das rhythmische und musikalische Profil von **75+ Schlagzeug-Schülern** über ein **halbes Jahr** vermisst. Der Lehrer begleitet die Schüler am Klavier — daher enthält der Datensatz sowohl Schüler- als auch Lehrer-Daten.

> **Status:** Produktiv | **Backend:** Python FastAPI + SQLite | **Frontend:** React + TypeScript + Vite | **Laufzeit:** Docker

---

## Über das Projekt

**Erstentwurf:** Google AI Studio  
**Weiterentwicklung:** Eigenes Backend + React SPA

**Fragestellung:** *Lässt sich der Fortschritt von Schlagzeug-Schülern in den ersten sechs Monaten Unterricht objektiv anhand von MIDI-Daten messen?*

Die Aufnahmen entstanden in drei verschiedenen Räumen mit unterschiedlichen Keyboards:
- **Raum 1 (Hauptraum):** Casio Piano — ca. 3,5 Tage/Woche, der Großteil der Daten
- **Raum 2:** Yamaha Piano — sporadisch
- **Raum 3:** Casio Piano — sporadisch

Der Lehrer (Autor) spielt Klavierbegleitung zu den Schlagzeug-Übungen der Schüler. Daher enthalten die MIDI-Daten sowohl die **Lehrer-Noten (Klavier)** als auch die **Schüler-Noten (Schlagzeug)**.

### Datengrundlage
- **~75+ Schüler** (variable Teilnehmerzahl)
- **>1,3 Millionen MIDI-Noten**
- **~44 Sessions** á **6–9 Stunden**, unterteilt in 30/45-Minuten-Slots
- **Zeitraum:** Januar – Juni 2026
- **Aufnahme-Setup:** Ableton Live (MIDI-Aufnahme über Casio/Yamaha Digitalpianos)
- **Ca. 3 Fehltage** wegen ungelöstem .band-Import vom iPad

### Zukunftsplanung
Verknüpfung der MIDI-Daten mit:
- **Unterrichtsmitschnitten** (Audio/Video)
- **OneNote-Unterrichtsnotizen**
- **RAG-System** für individuelle Fortschrittsauswertung

---

## Analysen

| Metrik | Beschreibung |
|---|---|
| **Timing Drift** | Abweichung jeder Note vom nächstgelegenen Grid (1/16tel) in ms |
| **Swing Factor** | Verhältnis der Achtel-Offbeats zum Grid |
| **Tempo / BPM** | Geschätztes Tempo aus Notenabständen |
| **Drift Histogram** | Verteilung der Drift-Werte über alle Noten |
| **Velocity Spread** | Anschlagsdynamik (laut/leise) über die Zeit |
| **Polyphony** | Gleichzeitige Noten (Griffgröße, Mehrstimmigkeit) |
| **Focus Score** | Gewichteter Qualitätsindex aus Drift, Velocity, Polyphonie |
| **Sliding Tempo** | Tempo-Entwicklung innerhalb einer Session |
| **Style Classification** | Kategorisierung (melodisch/rhythmisch/polyphon/hybrid) |
| **Pedal Analysis** | Nutzung des Sustain-Pedals |
| **Teacher/Student Split** | k-means-Clustering (k=2) zur Trennung von Lehrer- und Schülernoten |
| **Skalen-Verteilung** | Tonarten (Dur/Moll/Pentatonisch) inkl. Percussion-Klassifikation |
| **Kalenderansicht** | Tägliche Drift-Entwicklung als Heatmap |
| **Progression Chart** | Metrik-Entwicklung über alle Sessions |
| **Session Comparison** | Side-by-Side Vergleich zweier Sessions |
| **Einzelschüler-Ansicht** | Fortschritt pro Schüler mit Lehrer/Schüler-Drift |

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
│         SQLite (lokal, /data/sessions.db) │
│   ~41 Sessions, >1,3 Mio Noten            │
└───────────────────────────────────────────┘
```

**Container (Docker):** Single-Container, Python FastAPI serviert API + React-SPA statische Dateien. Kein nginx.

---

## Datenhaltung

| Aspekt | Lösung |
|---|---|
| Datenbank | SQLite (Datei in Docker-Volume `/data/sessions.db`, ~539MB) |
| Backup | Docker-Volume `midi_data` |
| Cloud | Supabase-Code vorhanden, aber nicht aktiv |
| Lazy-Loading | `notes_json`, `sliding_tempo_json`, `pedal_analysis_json` werden nur bei Auswahl einer Session geladen |

---

## Entwicklungsetappen

1. **Prototyp** — Google AI Studio (erster Entwurf)
2. **Firebase** — Datenmodell + erste Metriken (zu teuer, 1MB-Limit)
3. **Eigenes Backend** — Python FastAPI + SQLite + Docker
4. **Supabase** — Testweise PostgreSQL-Migration (für Cloud-Deployment evaluiert)
5. **Aktuell:** Zurück auf SQLite — lokaler Docker-Server ist die richtige Infrastruktur

---

## Lizenz

Projektarbeit, eingereicht im Rahmen einer Master-Bewerbung Medientechnik.
