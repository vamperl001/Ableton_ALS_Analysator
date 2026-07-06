/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { AlsFileStats } from '../types';
import { TrendingUp, Award, Zap, Activity, Layers, Sliders, Sparkles } from 'lucide-react';
import { CustomResponsiveContainer } from './CustomResponsiveContainer';

interface ProgressionChartProps {
  loadedFiles: AlsFileStats[];
}

type MetricType = "drift" | "polyphony" | "velocitySpread" | "pedalAccuracy";

export const ProgressionChart: React.FC<ProgressionChartProps> = ({ loadedFiles }) => {
  const [activeMetric, setActiveMetric] = useState<MetricType>("drift");

  const chartData = useMemo(() => {
    return [...loadedFiles]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((session, index) => {
        const styleName = session.fileName.includes('[') 
          ? session.fileName.substring(session.fileName.indexOf('[') + 1, session.fileName.indexOf(']')) 
          : "Sitzung";
        return {
          idx: index + 1,
          date: session.date,
          displayDate: new Date(session.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }),
          drift: parseFloat(session.avgDriftMs.toFixed(2)),
          tempo: session.tempo,
          notesCount: session.notesCount,
          style: styleName,
          fileName: session.fileName,
          // Advanced metrics (using safe fallbacks if missing)
          polyphony: session.polyphony?.avgPolyphony || 1.1,
          velocitySpread: session.velocitySpread?.velocityStdDev || 8.5,
          pedalAccuracy: session.pedalAnalysis?.accuracyScore || 72
        };
      });
  }, [loadedFiles]);

  const stats = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 0, average: 0, improvement: 0 };
    
    const drifts = chartData.map(d => d.drift);
    const min = Math.min(...drifts);
    const max = Math.max(...drifts);
    const average = drifts.reduce((sum, d) => sum + d, 0) / drifts.length;
    
    // Improvement calculation comparing first 15% and last 15% of sessions
    let improvement = 0;
    if (drifts.length >= 2) {
      const split = Math.ceil(drifts.length / 2);
      const earlyHalf = drifts.slice(0, split);
      const lateHalf = drifts.slice(split);
      const earlyAvg = earlyHalf.reduce((s, x) => s + x, 0) / earlyHalf.length;
      const lateAvg = lateHalf.reduce((s, x) => s + x, 0) / lateHalf.length;
      improvement = earlyAvg - lateAvg; // positive value means lower drift (improvement!)
    }
    
    // Polyphony development (average of first 5 vs last 5 sessions)
    let polyphonyGrowth = 0;
    if (chartData.length >= 4) {
      const firstSess = chartData.slice(0, 3).map(d => d.polyphony);
      const lastSess = chartData.slice(-3).map(d => d.polyphony);
      const firstAvg = firstSess.reduce((s, x) => s + x, 0) / firstSess.length;
      const lastAvg = lastSess.reduce((s, x) => s + x, 0) / lastSess.length;
      polyphonyGrowth = lastAvg - firstAvg;
    }

    // Velocity Spread development (average of first 5 vs last 5 sessions)
    let velocitySpreadGrowth = 0;
    if (chartData.length >= 4) {
      const firstSess = chartData.slice(0, 3).map(d => d.velocitySpread);
      const lastSess = chartData.slice(-3).map(d => d.velocitySpread);
      const firstAvg = firstSess.reduce((s, x) => s + x, 0) / firstSess.length;
      const lastAvg = lastSess.reduce((s, x) => s + x, 0) / lastSess.length;
      velocitySpreadGrowth = lastAvg - firstAvg;
    }

    // Pedal accuracy improvement
    let pedalImprovement = 0;
    if (chartData.length >= 4) {
      const firstSess = chartData.slice(0, 3).map(d => d.pedalAccuracy);
      const lastSess = chartData.slice(-3).map(d => d.pedalAccuracy);
      const firstAvg = firstSess.reduce((s, x) => s + x, 0) / firstSess.length;
      const lastAvg = lastSess.reduce((s, x) => s + x, 0) / lastSess.length;
      pedalImprovement = lastAvg - firstAvg;
    }
    
    return { 
      min, 
      max, 
      average, 
      improvement,
      polyphonyGrowth,
      velocitySpreadGrowth,
      pedalImprovement
    };
  }, [chartData]);

  if (chartData.length === 0) {
    return null;
  }

  // Configurations for each metric
  const metricConfigs = {
    drift: {
      title: "📈 TIMING-DRIFT ENTWICKLUNG (KONTINUIERLICHE LERNKURVE)",
      description: "Hier siehst du, wie sich deine mittlere Timing-Ungenauigkeit über das Halbjahr entwickelt. Ein sinkender Drift-Wert signalisiert höhere Spiel-Präzision!",
      dataKey: "drift",
      unit: "ms",
      color: "#0f172a",
      label: "Timing Drift",
      referenceLines: [
        { y: 9, stroke: "#10b981", label: "Gold-Standard (<9ms)" },
        { y: 30, stroke: "#f43f5e", label: "Warnschwelle (>30ms)" }
      ]
    },
    polyphony: {
      title: "🎹 HARMONISCHE ENTWICKLUNG (CHORD-DICHTE / POLYPHONIE)",
      description: "Zeigt das Voranschreiten von einfachen Melodien (1-2 Tasten) hin zu komplexen, mehrstimmigen Akkorden (3-4 Tasten gleichzeitig). Musikalischer Reifegrad messbar gemacht!",
      dataKey: "polyphony",
      unit: " Noten",
      color: "#4f46e5",
      label: "Ø Polyphonie",
      referenceLines: [
        { y: 1.2, stroke: "#64748b", label: "Einfache Melodie" },
        { y: 2.8, stroke: "#8b5cf6", label: "Komplexe Akkorde" }
      ]
    },
    velocitySpread: {
      title: "🎛️ SPIELGEFÜHL-DYNAMIK (VELOCITY-SPREAD RANGE)",
      description: "Ein Anfänger drückt alle Tasten gleich fest (niedrige Varianz). Ein Fortgeschrittener differenziert sensibel zwischen leiser Begleitung links und lauter Melodie rechts (hohe Dynamik-Spreizung)!",
      dataKey: "velocitySpread",
      unit: " SD",
      color: "#ec4899",
      label: "Touch Spread",
      referenceLines: [
        { y: 6.0, stroke: "#f43f5e", label: "Eintöniger Anschlag" },
        { y: 14.0, stroke: "#10b981", label: "Feinfühliges Piano" }
      ]
    },
    pedalAccuracy: {
      title: "👣 SUSTAIN-PEDAL NUTZUNG (CC 64 LEGATO-TIMING)",
      description: "Klavierspielen lernt man auch mit dem Fuß. Analysiert die zeitliche Präzision beim Lösen und erneuten Treten des Pedals exakt zum Akkordwechsel (Legato-Pedalierung).",
      dataKey: "pedalAccuracy",
      unit: "%",
      color: "#06b6d4",
      label: "Pedal Präzision",
      referenceLines: [
        { y: 60, stroke: "#f43f5e", label: "Sloppy (Matschig)" },
        { y: 88, stroke: "#10b981", label: "Hervorragendes Legato" }
      ]
    }
  };

  const currentConfig = metricConfigs[activeMetric];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex flex-col" id="analyzer-progression-chart-card">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-xs font-bold tracking-widest text-slate-800 uppercase font-mono flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-900" />
            {currentConfig.title}
          </h3>
          <p className="text-xs text-slate-500 mt-1 italic font-serif">
            {currentConfig.description}
          </p>
        </div>

        {/* Dynamic Learning Insights badge depending on active tab */}
        {chartData.length >= 3 && (
          <div className="flex flex-wrap gap-2.5">
            {activeMetric === "drift" && stats.improvement > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] font-mono font-bold uppercase tracking-wider">
                <Award className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                Timing: +{stats.improvement.toFixed(1)} ms genauer!
              </div>
            )}
            {activeMetric === "polyphony" && stats.polyphonyGrowth > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-50 border border-indigo-100 text-indigo-800 text-[10px] font-mono font-bold uppercase tracking-wider">
                <Award className="w-3.5 h-3.5 text-indigo-600 animate-bounce" />
                Harmonie: +{stats.polyphonyGrowth.toFixed(2)} Noten dichter!
              </div>
            )}
            {activeMetric === "velocitySpread" && stats.velocitySpreadGrowth > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-pink-50 border border-pink-100 text-pink-800 text-[10px] font-mono font-bold uppercase tracking-wider">
                <Award className="w-3.5 h-3.5 text-pink-600 animate-bounce" />
                Gefühl: +{stats.velocitySpreadGrowth.toFixed(1)} SD feinfühliger!
              </div>
            )}
            {activeMetric === "pedalAccuracy" && stats.pedalImprovement > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-50 border border-cyan-100 text-cyan-800 text-[10px] font-mono font-bold uppercase tracking-wider">
                <Award className="w-3.5 h-3.5 text-cyan-600 animate-bounce" />
                Beinarbeit: +{stats.pedalImprovement.toFixed(0)}% präziser!
              </div>
            )}
            <div className="flex items-center gap-1 bg-slate-900 text-white px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider font-bold">
              Sessions: {chartData.length}
            </div>
          </div>
        )}
      </div>

      {/* Sub-Tab navigation buttons */}
      <div className="flex flex-wrap gap-2 mb-4 pb-2 border-b border-slate-100">
        <button
          onClick={() => setActiveMetric("drift")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200 border ${
            activeMetric === "drift"
              ? "bg-slate-900 border-slate-900 text-white shadow-sm"
              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Rhythmischer Drift (ms)
        </button>

        <button
          onClick={() => setActiveMetric("polyphony")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200 border ${
            activeMetric === "polyphony"
              ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Polyphonie & Akkorde (Ø)
        </button>

        <button
          onClick={() => setActiveMetric("velocitySpread")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200 border ${
            activeMetric === "velocitySpread"
              ? "bg-pink-600 border-pink-600 text-white shadow-sm"
              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Dynamik-Spreizung (SD)
        </button>

        <button
          onClick={() => setActiveMetric("pedalAccuracy")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200 border ${
            activeMetric === "pedalAccuracy"
              ? "bg-cyan-600 border-cyan-600 text-white shadow-sm"
              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Sustain-Pedal Legato (%)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch">
        {/* Left Side: interactive recharts line plot */}
        <div className="md:col-span-3 h-64 bg-slate-50/50 rounded border border-slate-200 p-2 relative flex flex-col justify-end">
          <CustomResponsiveContainer>
            {(width, height) => (
              <LineChart
                width={width}
                height={height}
                data={chartData}
                margin={{ top: 15, right: 15, left: -20, bottom: 5 }}
              >
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="displayDate" 
                  tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'monospace' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'monospace' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                  domain={[0, 'auto']}
                  unit={activeMetric === "drift" ? "ms" : activeMetric === "pedalAccuracy" ? "%" : ""}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d: any = payload[0].payload;
                      const val = d[currentConfig.dataKey];
                      
                      let customTip = "";
                      if (activeMetric === "drift") {
                        customTip = val < 9 ? 'Tight (Maschine) 👍' : val > 30 ? 'Hoher Driftwert! ⚠️' : 'Menschlicher Groove ✨';
                      } else if (activeMetric === "polyphony") {
                        customTip = val > 2.5 ? 'Komplexe Akkord-Akkumulation' : val > 1.5 ? 'Zweistimmige Harmonie' : 'Monophone Melodie';
                      } else if (activeMetric === "velocitySpread") {
                        customTip = val > 14 ? 'Meisterhaft dynamischer Anschlag 🎭' : val > 9 ? 'Sensibles Spielgefühl' : 'Gleichförmig starres Spiel';
                      } else if (activeMetric === "pedalAccuracy") {
                        customTip = val > 85 ? 'Perfektes Legato-Sustain! 🦶' : val > 65 ? 'Guter Pedal-Anschluss' : 'Verschwommenes/Matschiges Pedal ⚠️';
                      }

                      return (
                        <div className="bg-slate-900 text-white rounded p-3 shadow-xl border border-slate-800 font-mono text-[10px] max-w-xs space-y-1">
                          <div className="font-bold border-b border-slate-800 pb-1 text-slate-400">
                            {d.date} // Sitzung #{d.idx}
                          </div>
                          <div className="text-slate-200 truncate font-semibold">
                            File: <span className="text-white font-normal">{d.fileName}</span>
                          </div>
                          <div className="flex justify-between mt-1 text-indigo-300">
                            <span>Stilistik:</span>
                            <span className="text-white font-bold">{d.style}</span>
                          </div>
                          <div className="flex justify-between" style={{ color: currentConfig.color }}>
                            <span>{currentConfig.label}:</span>
                            <span className="text-white font-extrabold">{val.toFixed(2)}{currentConfig.unit}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Tempo / Noten:</span>
                            <span className="text-white">{d.tempo.toFixed(1)} BPM / {d.notesCount}n</span>
                          </div>
                          <div className="mt-1 pt-1 border-t border-slate-800 font-sans italic text-slate-300 text-right text-[9px]">
                            {customTip}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                
                {/* Render the standard target references for each tab */}
                {currentConfig.referenceLines.map((line, i) => (
                  <ReferenceLine 
                    key={i}
                    y={line.y} 
                    stroke={line.stroke} 
                    strokeDasharray="3 3" 
                    label={{ 
                      value: line.label, 
                      fill: line.stroke, 
                      position: i === 0 ? 'insideBottomRight' : 'insideTopRight', 
                      fontSize: 8, 
                      fontFamily: 'monospace' 
                    }} 
                  />
                ))}
                
                <Line
                  type="monotone"
                  dataKey={currentConfig.dataKey}
                  name={currentConfig.label}
                  stroke={currentConfig.color}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: currentConfig.color, strokeWidth: 1, stroke: '#ffffff' }}
                  activeDot={{ r: 6, fill: currentConfig.color, stroke: '#ffffff', strokeWidth: 2 }}
                  animationDuration={800}
                />
              </LineChart>
            )}
          </CustomResponsiveContainer>
        </div>

        {/* Right Side: Educational Progression Summary Cards */}
        <div className="flex flex-col justify-between gap-3 font-mono text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded p-4 flex-1 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">HALBJAHRES-LERNTREND</span>
              <span className="text-slate-800 font-bold block mt-1">
                {activeMetric === "drift" && "Präzisions-Gewinn"}
                {activeMetric === "polyphony" && "Stimmführungs-Komplexität"}
                {activeMetric === "velocitySpread" && "Anschlags-Feingefühl"}
                {activeMetric === "pedalAccuracy" && "Sustain-Perfektion"}
              </span>
              <p className="text-[10px] text-slate-500 mt-1 italic font-serif leading-relaxed">
                {activeMetric === "drift" && `Durchschnittlich weichst du im Verlauf der 6 Monate um ${stats.improvement > 0 ? stats.improvement.toFixed(1) : "0"} ms weniger vom mathematischen Raster ab.`}
                {activeMetric === "polyphony" && `Entwicklung von einfachen Einstimmigkeiten hin zu satten Akkorden. Dein harmonischer Fortschritt liegt bei +${stats.polyphonyGrowth > 0 ? stats.polyphonyGrowth.toFixed(2) : "0"} Tasten.`}
                {activeMetric === "velocitySpread" && `Dank des Trainings spielst du Noten nicht mehr starr mit gleichem Druck, sondern differenzierst die Dynamik um +${stats.velocitySpreadGrowth > 0 ? stats.velocitySpreadGrowth.toFixed(1) : "0"} dB Spreizung.`}
                {activeMetric === "pedalAccuracy" && `Dein Fuß koordiniert sich über das Halbjahr hinweg um +${stats.pedalImprovement > 0 ? stats.pedalImprovement.toFixed(0) : "0"}% genauer mit den Fingern.`}
              </p>
            </div>
            <div className="border-t border-slate-200 pt-2 mt-2 text-[10px] text-indigo-700 font-bold flex items-center gap-1">
              <span>🎯 Lernziel erreicht:</span>
              <span>
                {activeMetric === "drift" && "Drift unter 15 ms"}
                {activeMetric === "polyphony" && "Harmonien mit >2.5 Tasten"}
                {activeMetric === "velocitySpread" && "Dynamik-Spreizung >12"}
                {activeMetric === "pedalAccuracy" && "Pedal-Genauigkeit >85%"}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded p-4 flex-1 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">STATISTISCHER MITTELWERT</span>
              <span className="text-slate-800 font-bold block mt-1">Schnitt aller Sessions</span>
              <p className="text-[10px] text-slate-500 mt-1 italic font-serif leading-relaxed">
                Dein globaler Durchschnitt über alle eingespielten {chartData.length} Sitzungen hinweg.
              </p>
            </div>
            <div className="border-t border-slate-200 pt-2 mt-2 text-[10px] text-slate-600 flex justify-between">
              <span>Mittlerer Wert:</span>
              <span className="font-bold text-slate-800">
                {activeMetric === "drift" && `${stats.average.toFixed(1)} ms`}
                {activeMetric === "polyphony" && `${(chartData.reduce((s, x) => s + x.polyphony, 0) / chartData.length).toFixed(2)}`}
                {activeMetric === "velocitySpread" && `${(chartData.reduce((s, x) => s + x.velocitySpread, 0) / chartData.length).toFixed(1)}`}
                {activeMetric === "pedalAccuracy" && `${Math.round(chartData.reduce((s, x) => s + x.pedalAccuracy, 0) / chartData.length)}%`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
