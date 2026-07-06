/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const pythonScriptText = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ableton Live .als MIDI Timing & Drift Analyzer (Januar - Juni)
--------------------------------------------------------------
Dieses Skript entpackt Ableton Live (*.als)-Dateien, extrahiert 
die MIDI-Noten-Events, analysiert deren Mikrotiming-Abweichungen (Drift & Swing)
und exportiert die Daten in eine SQLite-Datenbank sowie monatliche CSVs.
Zusätzlich werden wissenschaftliche Visualisierungen der Ergebnisse generiert.

Autor: Erfahrener Data Scientist / Python Entwickler
Datum: Juni 2026
Lizenz: Apache-2.0
"""

import os
import re
import gzip
import sqlite3
import csv
import glob
from datetime import datetime
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Tuple

# Versuche matplotlib und numpy für professionelle Visualisierungen zu laden
try:
    import matplotlib.pyplot as plt
    import numpy as np
    HAS_PLOT_LIBS = True
except ImportError:
    HAS_PLOT_LIBS = False
    print("[HINWEIS] 'matplotlib' und 'numpy' sind nicht installiert.")
    print("Führen Sie 'pip install matplotlib numpy' aus, um fantastische Grafiken zu erstellen!\\n")


def calculate_timing_drift(time_beats: float, nearest_grid: float, tempo: float) -> Tuple[float, float]:
    """
    Berechnet die präzise Timing-Drift eines Noten-Events relativ zur idealen quantisierten Grid-Sollzeit.
    
    Mathematischer Ansatz:
    1. Berechnet die Abweichung in Beats: offset_beats = tatsächliche_Zeit - Soll_Grid_Position
    2. Konvertiert die Beat-Abweichung basierend auf dem Projekttempo (BPM) in Millisekunden (ms):
       Milisekunden pro Beat = 60.000 / Tempo (BPM)
       Abweichung in ms = offset_beats * ms_per_beat
       
    Fehlervorzeichen:
    - Negativ (-): Note wurde 'Früh' eingespielt (Ahead of the beat)
    - Positiv (+): Note wurde 'Spät' eingespielt (Laid-back / Behind the beat)
    """
    offset_beats = time_beats - nearest_grid
    ms_per_beat = (60000.0 / tempo) if tempo > 0 else 500.0
    offset_ms = offset_beats * ms_per_beat
    return offset_beats, offset_ms


def calculate_swing_metrics(notes_list: List[Dict[str, Any]], target_grid: float = 0.25) -> Dict[str, Any]:
    """
    Berechnet mathematische Metriken zur Quantifizierung des Swing-Faktors.
    
    1. Metrik A: MPC Swing-Faktor (%)
       Misst das relative Timing von Offbeat-Noten (z.B. ungeraded 16tel bei Positionen 0.25, 0.75, etc.)
       im Verhältnis zu ihrer nominalen 16tel-Note. Ein gerades Timing entspricht exakt 50%.
       Swing % = (Tatsächlicher Beat-Offset innerhalb des Zählzeitschritts / Gesamtschrittgröße) * 100
       
    2. Metrik B: Inter-Onset-Interval (IOI) Verhältnis (Gerade / Ungerade Tupel)
       Quantifiziert das Verhältnis des zeitlichen Abstands aufeinanderfolgender ungerader und gerader Schritte.
       Formel: Verhältnis = vorderes_Segment (Onbeat bis Offbeat) / hinteres_Segment (Offbeat bis Onbeat)
       - Bei Straight-Grooves (50% Swing): Die Intervalle sind 1:1, das Verhältnis ist exakt 1.00.
       - Bei MPC-Swing (54% Swing): vorderes Segment = 0.27 Beats, hinteres = 0.23 Beats. Verhältnis = 0.27/0.23 ≈ 1.17.
       - Bei triolischem Swing (66.7% Swing): vorderes Segment = 0.333 Beats, hinteres = 0.167 Beats. Verhältnis = 2.00 (2:1).
    """
    offbeat_notes = [n for n in notes_list if abs((n["nearest_grid"] % 0.5) - 0.25) < 0.001]
    
    swing_factor = 50.0
    ioi_ratio = 1.0
    swing_style = "Gerade / Straight (50%)"
    
    if offbeat_notes:
        # Swing-Prozentsatz der Offbeats berechnen
        total_swing = sum(((n["time_beats"] % 0.5) / 0.5) * 100 for n in offbeat_notes)
        swing_factor = total_swing / len(offbeat_notes)
        if not (30 < swing_factor < 80):  # Plausibilitätsbereich
            swing_factor = 50.0
            
        # Segment-Verhältnisse berechnen (Dauer vorderes Segment zu hinterem Segment)
        segment_ratios = []
        for n in offbeat_notes:
            prev_even_grid = (n["nearest_grid"] // 0.5) * 0.5
            vorderes_segment = n["time_beats"] - prev_even_grid
            hinteres_segment = (prev_even_grid + 0.5) - n["time_beats"]
            if hinteres_segment > 0.01:
                segment_ratios.append(vorderes_segment / hinteres_segment)
                
        if segment_ratios:
            ioi_ratio = sum(segment_ratios) / len(segment_ratios)

    # Kategorisierung des Swing-Stils für Metadaten
    if swing_factor <= 51.5:
        swing_style = "Straight / No Swing"
    elif 51.5 < swing_factor <= 54.5:
        swing_style = "Classic MPC Swing (~54%)"
    elif 54.5 < swing_factor <= 58.5:
        swing_style = "Medium Groove Swing (55%-58%)"
    elif 58.5 < swing_factor <= 63.0:
        swing_style = "Strong Shuffle Swing (59%-63%)"
    else:
        swing_style = "Hard Swing / Triolisch (64%+)"
        
    return {
        "swing_factor": swing_factor,
        "ioi_ratio": ioi_ratio,
        "swing_style": swing_style
    }


class AlsMidiAnalyzer:
    def __init__(self, db_path: str = "ableton_midi_timing.db", target_grid: float = 0.25):
        """
        Initialisiert den .als-Analyzer.
        :param db_path: Pfad zur SQLite-Datenbank.
        :param target_grid: Grid-Einheit in Beats. 
                            0.25 steht für ein 16tel-Noten-Grid (Standard).
        """
        self.db_path = db_path
        self.target_grid = target_grid
        self.note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        self._init_database()

    def _init_database(self):
        """Erstellt ein relationales, robustes Datenbankschema in SQLite."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 1. Tabelle für Sessions (Ableton Live GZIP XML-Dateien)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_name TEXT UNIQUE NOT NULL,
                    session_date TEXT NOT NULL,
                    tempo REAL NOT NULL,
                    notes_count INTEGER NOT NULL,
                    avg_velocity REAL,
                    avg_drift_ms REAL,
                    swing_factor REAL,
                    swing_ioi_ratio REAL,
                    swing_style TEXT
                )
            """)
            
            # 2. Detailtabelle für Notenevents (Key, Time, Duration, Velocity)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS midi_notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER,
                    track_name TEXT,
                    midi_key INTEGER NOT NULL,
                    note_name TEXT NOT NULL,
                    start_time_beats REAL NOT NULL,
                    nearest_grid_beats REAL NOT NULL,
                    offset_beats REAL NOT NULL,
                    offset_ms REAL NOT NULL,
                    duration_beats REAL NOT NULL,
                    velocity REAL NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
                )
            """)
            conn.commit()

    def get_note_name(self, key: int) -> str:
        """Konvertiert MIDI-Tastenfelder (z.B. 60) in klassische Notenwerte (z.B. C4)."""
        note_index = key % 12
        octave = (key // 12) - 1
        return f"{self.note_names[note_index]}{octave}"

    def parse_als_file(self, file_path: str) -> Dict[str, Any]:
        """
        Dekomprimiert die .als-Datei im Arbeitsspeicher, analysiert das XML 
        und extrahiert MIDI-Notereignisse und das Tempo.
        """
        file_name = os.path.basename(file_path)
        print(f"Verarbeite XML Struktur: {file_name} ...")
        
        # Datum bestimmen (Fallback auf Dateisystem-Mzeit)
        date_match = re.search(r"(\\d{4}-\\d{2}-\\d{2})", file_name)
        session_date = date_match.group(1) if date_match else datetime.fromtimestamp(os.path.getmtime(file_path)).strftime('%Y-%m-%d')
        
        # Gzip dekomprimieren
        try:
            with gzip.open(file_path, 'rb') as f:
                xml_content = f.read()
        except OSError:
            # Fallback falls bereits entpackt
            with open(file_path, 'rb') as f:
                xml_content = f.read()

        # XML Einlesen
        root = ET.fromstring(xml_content)
        
        # 1. Projekttempo auslesen
        tempo = 120.0
        tempo_manual = root.find(".//Tempo/Manual")
        if tempo_manual is not None and "Value" in tempo_manual.attrib:
            tempo = float(tempo_manual.attrib["Value"])
        else:
            tempo_val = root.find(".//Tempo/Val")
            if tempo_val is not None and "Value" in tempo_val.attrib:
                tempo = float(tempo_val.attrib["Value"])

        notes_list = []
        
        # 2. Spuren durchsuchen und MIDI-Noten extrahieren
        for track in root.findall(".//MidiTrack"):
            track_name_node = track.find(".//Name/EffectiveName")
            track_name = track_name_node.attrib.get("Value", "MIDI Track") if track_name_node is not None else "MIDI Track"
            
            # Alle MIDI Notenevents der Spur parsen
            for note_event in track.findall(".//MidiNoteEvent"):
                # Unterstützung für Ableton 11 & älter (Attribute) und Ableton 12+ (Kindelemente mit Value)
                key_node = note_event.find("Key")
                time_node = note_event.find("Time")
                dur_node = note_event.find("Duration")
                vel_node = note_event.find("Velocity")
                
                key_val = note_event.get("Key") or (key_node.get("Value") if key_node is not None else None)
                time_val = note_event.get("Time") or (time_node.get("Value") if time_node is not None else None)
                dur_val = note_event.get("Duration") or (dur_node.get("Value") if dur_node is not None else None)
                vel_val = note_event.get("Velocity") or (vel_node.get("Value") if vel_node is not None else None)
                
                if key_val is not None and time_val is not None:
                    key = int(key_val)
                    time_beats = float(time_val)
                    duration_beats = float(dur_val) if dur_val is not None else 0.25
                    velocity = float(vel_val) if vel_val is not None else 100
                    
                    # Nächste Soll-Zeit berechnen
                    nearest_grid = round(time_beats / self.target_grid) * self.target_grid
                    
                    # 3. Timing-Drift via Funktion berechnen
                    offset_beats, offset_ms = calculate_timing_drift(time_beats, nearest_grid, tempo)
                    
                    notes_list.append({
                        "track_name": track_name,
                        "key": key,
                        "note_name": self.get_note_name(key),
                        "time_beats": time_beats,
                        "nearest_grid": nearest_grid,
                        "offset_beats": offset_beats,
                        "offset_ms": offset_ms,
                        "duration_beats": duration_beats,
                        "velocity": velocity
                    })

        # Allgemeiner Fallback
        if not notes_list:
            for note_event in root.findall(".//MidiNoteEvent"):
                key_node = note_event.find("Key")
                time_node = note_event.find("Time")
                dur_node = note_event.find("Duration")
                vel_node = note_event.find("Velocity")
                
                key_val = note_event.get("Key") or (key_node.get("Value") if key_node is not None else None)
                time_val = note_event.get("Time") or (time_node.get("Value") if time_node is not None else None)
                dur_val = note_event.get("Duration") or (dur_node.get("Value") if dur_node is not None else None)
                vel_val = note_event.get("Velocity") or (vel_node.get("Value") if vel_node is not None else None)
                
                if key_val is not None and time_val is not None:
                    key = int(key_val)
                    time_beats = float(time_val)
                    duration_beats = float(dur_val) if dur_val is not None else 0.25
                    velocity = float(vel_val) if vel_val is not None else 100
                    
                    nearest_grid = round(time_beats / self.target_grid) * self.target_grid
                    offset_beats, offset_ms = calculate_timing_drift(time_beats, nearest_grid, tempo)
                    
                    notes_list.append({
                        "track_name": "Hauptspur",
                        "key": key,
                        "note_name": self.get_note_name(key),
                        "time_beats": time_beats,
                        "nearest_grid": nearest_grid,
                        "offset_beats": offset_beats,
                        "offset_ms": offset_ms,
                        "duration_beats": duration_beats,
                        "velocity": velocity
                    })

        # Kennzahlen kalkulieren
        notes_count = len(notes_list)
        avg_velocity = sum(n["velocity"] for n in notes_list) / notes_count if notes_count > 0 else 0
        avg_drift_ms = sum(abs(n["offset_ms"]) for n in notes_list) / notes_count if notes_count > 0 else 0
        
        # 4. Swing Metriken via mathematische Funktion berechnen
        swing_metrics = calculate_swing_metrics(notes_list, self.target_grid)

        return {
            "file_name": file_name,
            "session_date": session_date,
            "tempo": tempo,
            "notes_count": notes_count,
            "avg_velocity": avg_velocity,
            "avg_drift_ms": avg_drift_ms,
            "swing_factor": swing_metrics["swing_factor"],
            "swing_ioi_ratio": swing_metrics["ioi_ratio"],
            "swing_style": swing_metrics["swing_style"],
            "notes": notes_list
        }

    def save_to_sqlite(self, session_data: Dict[str, Any]):
        """Sichert die extrahierten Parameter sauber relational in SQLite."""
        if not session_data["notes"]:
            print(f"  [WARNUNG] Keine MIDI Noten in {session_data['file_name']} extrahiert.")
            return

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            try:
                # Session einfügen
                cursor.execute("""
                    INSERT INTO sessions (
                        file_name, session_date, tempo, notes_count, 
                        avg_velocity, avg_drift_ms, swing_factor, swing_ioi_ratio, swing_style
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_data["file_name"],
                    session_data["session_date"],
                    session_data["tempo"],
                    session_data["notes_count"],
                    session_data["avg_velocity"],
                    session_data["avg_drift_ms"],
                    session_data["swing_factor"],
                    session_data["swing_ioi_ratio"],
                    session_data["swing_style"]
                ))
                session_id = cursor.lastrowid
                
                # MIDI Noten gebündelt einfügen
                notes_tuples = [
                    (
                        session_id,
                        n["track_name"],
                        n["key"],
                        n["note_name"],
                        n["time_beats"],
                        n["nearest_grid"],
                        n["offset_beats"],
                        n["offset_ms"],
                        n["duration_beats"],
                        n["velocity"]
                    )
                    for n in session_data["notes"]
                ]
                
                cursor.executemany("""
                    INSERT INTO midi_notes (
                        session_id, track_name, midi_key, note_name, 
                        start_time_beats, nearest_grid_beats, offset_beats, offset_ms, 
                        duration_beats, velocity
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, notes_tuples)
                
                conn.commit()
                print(f"  -> Erfolgreich in SQLite gespeichert (ID: {session_id}, {len(notes_tuples)} Noten befüllt).")
            except sqlite3.IntegrityError:
                print(f"  [ÜBERSPRUNGEN] Datei {session_data['file_name']} existiert bereits in der Datenbank.")

    def export_monthly_csv(self, output_dir: str = "monthly_exports"):
        """Gruppiert alle eingepflegten Daten nach Monat und legt hierfür CSV-Tabellen ab."""
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT s.session_date, s.file_name, s.tempo, n.track_name, n.midi_key, 
                       n.note_name, n.start_time_beats, n.nearest_grid_beats, 
                       n.offset_beats, n.offset_ms, n.duration_beats, n.velocity
                FROM midi_notes n
                JOIN sessions s ON n.session_id = s.id
                ORDER BY s.session_date ASC, s.file_name ASC, n.start_time_beats ASC
            """)
            notes = cursor.fetchall()
            
            grouped_notes = {}
            for note in notes:
                date_str = note["session_date"]
                year_month = date_str[:7] # Format YYYY-MM
                if year_month not in grouped_notes:
                    grouped_notes[year_month] = []
                grouped_notes[year_month].append(note)

            for ym, list_of_rows in grouped_notes.items():
                csv_file = os.path.join(output_dir, f"midi_timing_export_{ym}.csv")
                with open(csv_file, mode="w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow([
                        "Datum", "Datei_Name", "BPM", "Spur_Name", "MIDI_Tonhoehe",
                        "Note", "Startzeit_Beats", "Soll_Grid_Beats", "Abweichung_Beats", 
                        "Abweichung_ms", "Laenge_Beats", "Dynamic_Velocity"
                    ])
                    for row in list_of_rows:
                        writer.writerow([
                            row["session_date"], row["file_name"], row["tempo"], 
                            row["track_name"], row["midi_key"], row["note_name"], 
                            f"{row['start_time_beats']:.4f}", f"{row['nearest_grid_beats']:.2f}",
                            f"{row['offset_beats']:.4f}", f"{row['offset_ms']:.2f}", 
                            f"{row['duration_beats']:.3f}", int(row["velocity"])
                        ])
                print(f"[CSV-EXPORT] {ym}: {len(list_of_rows)} Notenschritte -> {csv_file}")

    def plot_visualizations(self, image_prefix: str = "ableton_timing_dashboard"):
        """Erzeugt ein anspruchsvolles 4-Subplot-Dashboard aus den Messergebnissen."""
        if not HAS_PLOT_LIBS:
            print("[WARNUNG] Visualisierungen können ohne matplotlib/numpy nicht gezeichnet werden.")
            return

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT offset_ms FROM midi_notes")
            offsets = [r[0] for r in cursor.fetchall()]
            
            cursor.execute("SELECT session_date, avg_drift_ms, tempo, swing_factor, swing_ioi_ratio FROM sessions ORDER BY session_date")
            sessions_data = cursor.fetchall()

        if not offsets or not sessions_data:
            print("[INFO] Keine Spieldaten für Abbildungen vorhanden.")
            return

        dates = [datetime.strptime(r[0], "%Y-%m-%d") for r in sessions_data]
        drifts = [r[1] for r in sessions_data]
        tempos = [r[2] for r in sessions_data]
        swings = [r[3] for r in sessions_data]
        ratios = [r[4] for r in sessions_data]

        plt.figure(figsize=(15, 10))
        plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')

        # Subplot 1: Drift-Histogramm
        plt.subplot(2, 2, 1)
        capped_offsets = [max(-120, min(120, o)) for o in offsets]
        plt.hist(capped_offsets, bins=50, color='#3b82f6', edgecolor='black', alpha=0.75)
        plt.axvline(0, color='red', linestyle='--', linewidth=1.5, label="Idealer Soll-Wert (0ms)")
        plt.title("Timing-Drift Fehler-Verteilung", fontsize=11, fontweight='bold', pad=10)
        plt.xlabel("Offset Abweichung (Millisekunden)", fontsize=9)
        plt.ylabel("Anzahl MIDI-Noten", fontsize=9)
        plt.legend(loc='upper right')
        
        median_drift = np.median(offsets)
        std_drift = np.std(offsets)
        plt.text(0.05, 0.75, f"Median: {median_drift:.2f} ms\\nStdDev: {std_drift:.2f} ms",
                 transform=plt.gca().transAxes, bbox=dict(facecolor='white', alpha=0.8, boxstyle='round,pad=0.5'))

        # Subplot 2: 6-Monats-Trend der Drift
        plt.subplot(2, 2, 2)
        plt.plot(dates, drifts, 'o-', color='#0f172a', linewidth=1.2, markersize=3.5, alpha=0.4, label="Session")
        if len(drifts) > 5:
            window = 7
            rolling_avg = np.convolve(drifts, np.ones(window)/window, mode='valid')
            plt.plot(dates[window-1:], rolling_avg, '-', color='#3b82f6', linewidth=2.5, label="7-Tage-Trend")
        plt.title("Trend der Microtiming-Drift-Entwicklung", fontsize=11, fontweight='bold', pad=10)
        plt.xlabel("Datum", fontsize=9)
        plt.ylabel("ø Drift-Abweichung (ms)", fontsize=9)
        plt.gcf().autofmt_xdate()
        plt.legend()

        # Subplot 3: Swing-Faktoren (MPC und IOI-Verhältnisse)
        plt.subplot(2, 2, 3)
        ax1 = plt.gca()
        ax1.scatter(dates, swings, color='#3b82f6', s=35, alpha=0.75, edgecolors='black', label="MPC Swing %")
        ax1.axhline(50, color='gray', linestyle=':', alpha=0.7)
        ax1.axhline(54, color='#f59e0b', linestyle='--', label="MPC 54% Classic")
        ax1.set_ylabel("Mittelwert Swing %", color='#3b82f6', fontsize=9)
        ax1.tick_params(axis='y', labelcolor='#3b82f6')
        
        ax2 = ax1.twinx()
        ax2.plot(dates, ratios, 'x-', color='#1e293b', alpha=0.35, markersize=4, label="IOI-Tupel Ratio")
        ax2.set_ylabel("Inter-Onset Ratio (Gerade/Ungerade)", color='#1e293b', fontsize=9)
        ax2.tick_params(axis='y', labelcolor='#1e293b')
        
        plt.title("Swing-Metriken (MPC % und Tupel-Verhältnisse)", fontsize=11, fontweight='bold', pad=10)
        ax1.legend(loc='upper left')

        # Subplot 4: BPM-Präferenz
        plt.subplot(2, 2, 4)
        plt.hist(tempos, bins=15, color='#1e293b', edgecolor='black', alpha=0.8)
        plt.title("Studiotempo-Präferenz (BPM Verteilung)", fontsize=11, fontweight='bold', pad=10)
        plt.xlabel("Beats Per Minute", fontsize=9)
        plt.ylabel("Sessions", fontsize=9)

        plt.tight_layout()
        plt.savefig(f"{image_prefix}.png", dpi=300)
        print(f"[DIAGRAMM] Grafik-Dashboard erfolgreich erstellt: '{image_prefix}.png'!")
        plt.close()


if __name__ == "__main__":
    print("=" * 75)
    print("   ABLETON LIVE *.ALS MIDI-TIMING-EXTRAKTOR & GROOVE-DIAGNOSE PIPELINE")
    print("=" * 75)
    
    # Ableton Projekt-Ordner definieren
    project_folder = "./ableton_projekte"
    
    if not os.path.exists(project_folder):
        os.makedirs(project_folder)
        print(f"[SETUP] Verzeichnis '{project_folder}' angelegt.")
        print(" -> Platzieren Sie hier Ihre täglichen .als Backupdateien zur Auswertung.")
        print(" -> Fallback: Suche nach .als Dateien im Rootverzeichnis...\\n")
        files = glob.glob("*.als") + glob.glob("**/*.als", recursive=True)
    else:
        files = glob.glob(os.path.join(project_folder, "*.als"))

    if not files:
        print("[!] Keine echten .als-Dateien im Verzeichnis gefunden.")
        print("Beispielhafte Simulation für ein halbes Jahr wird befüllt...\\n")
        
        analyzer = AlsMidiAnalyzer()
        import random
        for i in range(1, 150):
            date_str = f"2026-{random.choice(['01','02','03','04','05','06'])}-{random.randint(1,28):02d}"
            bpm = random.choice([95.0, 115.0, 122.0, 80.0, 128.0])
            count = random.randint(40, 150)
            avg_vel = random.randint(90, 105)
            avg_drift = random.uniform(8.0, 22.0)
            # Simuliere unterschiedliche Swing-Tupel
            swing_factor = random.choice([50.0, 54.0, 58.0, 60.0])
            swing_metrics = calculate_swing_metrics([{"time_beats": n * 0.25 + ((swing_factor - 50)/100)*0.5, "nearest_grid": n * 0.25} for n in range(count)])
            
            with sqlite3.connect(analyzer.db_path) as conn:
                cursor = conn.cursor()
                try:
                    cursor.execute("""
                        INSERT INTO sessions (
                            file_name, session_date, tempo, notes_count, 
                            avg_velocity, avg_drift_ms, swing_factor, swing_ioi_ratio, swing_style
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        f"Project_{date_str}_ActiveSession.als", 
                        date_str, 
                        bpm, 
                        count, 
                        avg_vel, 
                        avg_drift, 
                        swing_factor, 
                        swing_metrics["ioi_ratio"], 
                        swing_metrics["swing_style"]
                    ))
                    s_id = cursor.lastrowid
                    
                    # Synthetische Noten-Events erzeugen
                    notes = []
                    for n in range(count):
                        is_offbeat = n % 2 == 1
                        ideal = n * 0.25
                        offset = (random.random() - 0.5) * 0.04
                        time = ideal + (offset if not is_offbeat else offset + ((swing_factor - 50)/100)*0.5)
                        
                        note_drift_beats, note_drift_ms = calculate_timing_drift(time, ideal, bpm)
                        
                        notes.append((
                            s_id, 
                            random.choice(["Drums Track", "Akkorde Track", "Sub-Bass"]), 
                            random.randint(36, 72), 
                            "NoteName", 
                            time, 
                            ideal, 
                            note_drift_beats, 
                            note_drift_ms, 
                            0.2, 
                            random.randint(70, 115)
                        ))
                    cursor.executemany("""
                        INSERT INTO midi_notes (
                            session_id, track_name, midi_key, note_name, 
                            start_time_beats, nearest_grid_beats, offset_beats, offset_ms, 
                            duration_beats, velocity
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, notes)
                except sqlite3.IntegrityError:
                    continue
        print("[MOCK OK] Synthetische Datenbank 'ableton_midi_timing.db' erfolgreich angelegt!")
    else:
        print(f"Es wurden {len(files)} Ableton Live *.als Dateien ermittelt.")
        analyzer = AlsMidiAnalyzer()
        
        for f_path in files:
            try:
                data = analyzer.parse_als_file(f_path)
                analyzer.save_to_sqlite(data)
            except Exception as ex:
                print(f"  [FEHLER] Datei {f_path} konnte nicht verarbeitet werden: {ex}")

    # CSV Exporte erstellen
    print("\\nSchritt 2: Schreibe monatlich exportierte Tabellen in './monthly_exports' ...")
    analyzer.export_monthly_csv()

    # Dashboard Rendering
    print("\\nSchritt 3: Erstelle wissenschaftliche Grafiken via Matplotlib ...")
    analyzer.plot_visualizations("ableton_timing_dashboard")

    print("\\n" + "=" * 75)
    print("   TIMING ANALYSIS PIPELINE ERFOLGREICH ABGESCHLOSSEN!")
    print("   -> SQLite-Datenbank: 'ableton_midi_timing.db'")
    print("   -> Monatliche CSVs im Ordner: './monthly_exports'")
    print("   -> Dashboard-Grafik: './ableton_timing_dashboard.png'")
    print("=" * 75)
`;
