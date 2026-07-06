import React, { useState, useMemo } from 'react';
import { AlsFileStats, ScheduleEntry } from '../types';
import { User, Clock, Edit3, Save, RefreshCw } from 'lucide-react';

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function matchStudent(session: AlsFileStats, schedule: ScheduleEntry[]): string | null {
  for (const entry of schedule) {
    if (entry.weekday === session.weekday && entry.time === session.time) {
      return entry.studentName;
    }
  }
  return null;
}

interface Props {
  sessions: AlsFileStats[];
  schedule: ScheduleEntry[];
  onScheduleChange: (s: ScheduleEntry[]) => void;
}

export function StudentProgress({ sessions, schedule, onScheduleChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduleEntry[]>(() => [...schedule]);

  const studentGroups = useMemo(() => {
    const map = new Map<string, AlsFileStats[]>();
    for (const s of sessions) {
      const name = matchStudent(s, schedule);
      if (name) {
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(s);
      }
    }
    // Sort each student's sessions by date
    for (const [, arr] of map) {
      arr.sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [sessions, schedule]);

  const handleSave = () => {
    onScheduleChange(editSchedule);
    setEditing(false);
  };

  const addSlot = () => {
    setEditSchedule(prev => [...prev, { weekday: 1, time: '14:00', studentName: '', duration: 30 }]);
  };

  const removeSlot = (idx: number) => {
    setEditSchedule(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSlot = (idx: number, field: keyof ScheduleEntry, value: string | number) => {
    setEditSchedule(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <User className="w-4 h-4" />
          Schüler-Fortschritt (nach Stundenplan)
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/axinio/timetable');
                const data = await res.json();
                const entries_map = new Map();
                for (const e of data.entries) {
                  if (!e.date || !e.start || !e.students?.length) continue;
                  const dt = new Date(e.date);
                  const wd = dt.getDay() === 0 ? 6 : dt.getDay() - 1; // 0=Mo
                  const time_str = e.start.includes(' ') ? e.start.split(' ')[1].slice(0, 5) : e.start.slice(0, 5);
                  const key = wd + '|' + time_str;
                  if (!entries_map.has(key)) entries_map.set(key, { student: e.students[0], end: e.end });
                }
                const unique = [...new Set(Array.from(entries_map.values()).map(v => v.student))].sort();
                const anon = Object.fromEntries(unique.map((s, i) => [s, 'Schüler ' + (i + 1)]));
                const slots = Array.from(entries_map.entries()).sort().map(([k, v]) => {
                  const [wd, time_str] = k.split('|');
                  const end_str = v.end?.includes(' ') ? v.end.split(' ')[1].slice(0, 5) : '';
                  const [sh, sm] = time_str.split(':').map(Number);
                  const [eh, em] = end_str ? end_str.split(':').map(Number) : [sh, sm + 30];
                  return { weekday: Number(wd), time: time_str, studentName: anon[v.student], duration: (eh * 60 + em) - (sh * 60 + sm) };
                });
                onScheduleChange(slots);
              } catch (err) {
                alert('Axinio-Import fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
              }
            }}
            className="text-xs flex items-center gap-1 px-3 py-1.5 rounded bg-indigo-900/30 text-indigo-300 border border-indigo-800/50 hover:bg-indigo-900/50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Axinio importieren
          </button>
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            className="text-xs flex items-center gap-1 px-3 py-1.5 rounded bg-slate-700 border border-slate-600 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            {editing ? <Save className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
            {editing ? 'Speichern' : 'Stundenplan bearbeiten'}
          </button>
        </div>
      </div>

      {editing && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4 space-y-2">
          <div className="text-xs font-semibold text-slate-400 mb-2">Stundenplan</div>
          {editSchedule.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <select
                value={entry.weekday}
                onChange={e => updateSlot(i, 'weekday', parseInt(e.target.value))}
                className="border border-slate-600 rounded px-2 py-1 bg-slate-900 text-slate-200"
              >
                {WEEKDAYS.map((d, di) => <option key={di} value={di}>{d}</option>)}
              </select>
              <input
                type="time"
                value={entry.time}
                onChange={e => updateSlot(i, 'time', e.target.value)}
                className="border border-slate-600 rounded px-2 py-1 bg-slate-900 text-slate-200 w-24"
              />
              <input
                type="text"
                value={entry.studentName}
                onChange={e => updateSlot(i, 'studentName', e.target.value)}
                placeholder="Schüler Name"
                className="border border-slate-600 rounded px-2 py-1 bg-slate-900 text-slate-200 flex-1"
              />
              <select
                value={entry.duration}
                onChange={e => updateSlot(i, 'duration', parseInt(e.target.value))}
                className="border border-slate-600 rounded px-2 py-1 bg-slate-900 text-slate-200"
              >
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
              </select>
              <button
                onClick={() => removeSlot(i)}
                className="text-red-500 hover:text-red-700 px-1"
              >✕</button>
            </div>
          ))}
          <button
            onClick={addSlot}
            className="text-xs text-blue-400 hover:text-blue-300 mt-1"
          >+ Slot hinzufügen</button>
        </div>
      )}

      {studentGroups.size === 0 && !editing && (
        <div className="text-xs text-slate-400 italic p-4 text-center">
          Keine Schüler gefunden. Erstelle einen Stundenplan, um Sessions zuzuordnen.
        </div>
      )}

      {Array.from(studentGroups.entries()).map(([name, studentSessions]) => (
        <div key={name} className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4 space-y-3">
          <div className="text-sm font-bold text-slate-100">{name}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Notes over time */}
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1">Noten pro Session</div>
              <div className="h-24 flex items-end gap-1">
                {studentSessions.map((s, i) => {
                  const maxNotes = Math.max(...studentSessions.map(x => x.notesCount), 1);
                  const h = (s.notesCount / maxNotes) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full bg-blue-500 rounded-t" style={{ height: `${h}%`, minHeight: 2 }} />
                      <span className="text-[9px] text-slate-500 rotate-45 origin-left whitespace-nowrap">
                        {s.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Drift over time */}
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1">Drift (ms) Ø</div>
              <div className="h-24 flex items-end gap-1">
                {studentSessions.map((s, i) => {
                  const maxDrift = Math.max(...studentSessions.map(x => x.avgDriftMs), 1);
                  const h = (s.avgDriftMs / maxDrift) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full bg-amber-500 rounded-t" style={{ height: `${h}%`, minHeight: 2 }} />
                      <span className="text-[9px] text-slate-500 rotate-45 origin-left whitespace-nowrap">
                        {s.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* BPM over time */}
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1">BPM</div>
              <div className="h-24 flex items-end gap-1">
                {studentSessions.map((s, i) => {
                  const minBpm = Math.min(...studentSessions.map(x => x.estimatedBpm ?? x.tempo));
                  const maxBpm = Math.max(...studentSessions.map(x => x.estimatedBpm ?? x.tempo));
                  const range = Math.max(maxBpm - minBpm, 5);
                  const h = ((s.estimatedBpm ?? s.tempo) - minBpm) / range * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full bg-emerald-500 rounded-t" style={{ height: `${h}%`, minHeight: 2 }} />
                      <span className="text-[9px] text-slate-500 rotate-45 origin-left whitespace-nowrap">
                        {s.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Velocity over time */}
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1">Velocity Ø</div>
              <div className="h-24 flex items-end gap-1">
                {studentSessions.map((s, i) => {
                  const minVel = Math.min(...studentSessions.map(x => x.avgVelocity));
                  const maxVel = Math.max(...studentSessions.map(x => x.avgVelocity));
                  const range = Math.max(maxVel - minVel, 10);
                  const h = (s.avgVelocity - minVel) / range * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full bg-purple-500 rounded-t" style={{ height: `${h}%`, minHeight: 2 }} />
                      <span className="text-[9px] text-slate-500 rotate-45 origin-left whitespace-nowrap">
                        {s.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Focus Score over time */}
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1">Focus Score</div>
              <div className="h-24 flex items-end gap-1">
                {studentSessions.map((s, i) => {
                  const minScore = Math.min(...studentSessions.map(x => x.focusScore ?? 0));
                  const maxScore = Math.max(...studentSessions.map(x => x.focusScore ?? 0));
                  const range = Math.max(maxScore - minScore, 10);
                  const h = ((s.focusScore ?? 0) - minScore) / range * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full bg-rose-500 rounded-t" style={{ height: `${h}%`, minHeight: 2 }} />
                      <span className="text-[9px] text-slate-500 rotate-45 origin-left whitespace-nowrap">
                        {s.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Teacher/Student Split info - shows student-only drift */}
          {studentSessions.some(s => s.teacherStudentSplit && s.teacherStudentSplit.studentNoteCount > 0) && (
            <div className="text-[10px] text-slate-300 bg-amber-900/20 border border-amber-800/30 rounded p-2 flex flex-wrap gap-3">
              <span className="font-semibold">👤 Lehrer/Schüler:</span>
              <span>Lehrer-Drift Ø {(
                studentSessions
                  .filter(s => s.teacherStudentSplit)
                  .reduce((a, s) => a + s.teacherStudentSplit!.teacherAvgDriftMs, 0) /
                studentSessions.filter(s => s.teacherStudentSplit).length
              ).toFixed(1)} ms</span>
              <span>Schüler-Drift Ø {(
                studentSessions
                  .filter(s => s.teacherStudentSplit && s.teacherStudentSplit.studentNoteCount > 0)
                  .reduce((a, s) => a + s.teacherStudentSplit!.studentAvgDriftMs, 0) /
                Math.max(1, studentSessions.filter(s => s.teacherStudentSplit && s.teacherStudentSplit.studentNoteCount > 0).length)
              ).toFixed(1)} ms</span>
              <span>Schüler-Anteil Ø {(
                studentSessions
                  .filter(s => s.teacherStudentSplit)
                  .reduce((a, s) => a + (s.teacherStudentSplit!.studentNoteCount / Math.max(1, s.notesCount)) * 100, 0) /
                Math.max(1, studentSessions.filter(s => s.teacherStudentSplit).length)
              ).toFixed(0)}%</span>
            </div>
          )}

          {/* Summary stats */}
          <div className="text-xs text-slate-400 grid grid-cols-5 gap-2 pt-2 border-t border-slate-700/50">
            <div>{studentSessions.length} Sessions</div>
            <div>BPM Ø {(studentSessions.reduce((a, s) => a + (s.estimatedBpm ?? s.tempo), 0) / studentSessions.length).toFixed(1)}</div>
            <div>Drift Ø {(studentSessions.reduce((a, s) => a + s.avgDriftMs, 0) / studentSessions.length).toFixed(1)} ms</div>
            <div>Velocity Ø {Math.round(studentSessions.reduce((a, s) => a + s.avgVelocity, 0) / studentSessions.length)}</div>
            <div>Focus Ø {Math.round(studentSessions.reduce((a, s) => a + (s.focusScore ?? 0), 0) / studentSessions.length)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
