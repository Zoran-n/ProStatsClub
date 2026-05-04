import React from 'react';
import { Brain, TrendingUp, Target, AlertTriangle, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
import { AISummary, AIGoal, PredictionResult } from '../../utils/aiEngine';

interface AIPanelProps {
  summary?: AISummary;
  goals?: AIGoal[];
  prediction?: PredictionResult;
  compact?: boolean;
}

export function AIPanel({ summary, goals, prediction, compact }: AIPanelProps) {
  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* 🔮 PRÉDICTION PROCHAIN MATCH */}
      {prediction && (
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[rgba(var(--accent-rgb,0,212,255),0.03)] backdrop-blur-md">
          <div className="flex items-center gap-2 mb-3 text-[var(--accent)]">
            <Zap size={18} />
            <span className="font-bebas tracking-wider">PRÉDICTION PROCHAIN MATCH</span>
          </div>
          
          <div className="flex items-end gap-1 h-8 mb-4 overflow-hidden rounded-lg">
            <div style={{ width: `${prediction.win}%` }} className="h-full bg-[var(--green)] flex items-center justify-center text-[10px] font-bold text-black" title="Victoire">
              {prediction.win}%
            </div>
            <div style={{ width: `${prediction.draw}%` }} className="h-full bg-yellow-500 flex items-center justify-center text-[10px] font-bold text-black" title="Nul">
              {prediction.draw}%
            </div>
            <div style={{ width: `${prediction.loss}%` }} className="h-full bg-[var(--red)] flex items-center justify-center text-[10px] font-bold text-black" title="Défaite">
              {prediction.loss}%
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {prediction.factors.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>{f.label}</span>
                <span className="text-[var(--text)] font-medium">+{f.impact}% impact</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 📝 RÉSUMÉ NARRATIF */}
      {summary && (
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)] transition-all group">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <Brain size={18} />
              <span className="font-bebas tracking-wider">{summary.title.toUpperCase()}</span>
            </div>
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
              summary.sentiment === 'positive' ? 'bg-[var(--green)] text-black' : 
              summary.sentiment === 'negative' ? 'bg-[var(--red)] text-white' : 'bg-yellow-500 text-black'
            }`}>
              {summary.sentiment === 'positive' ? 'EXCELLENT' : summary.sentiment === 'negative' ? 'ALERTE' : 'NEUTRE'}
            </span>
          </div>
          
          <p className="text-sm text-[var(--text)] leading-relaxed mb-4 opacity-90 italic">
            "{summary.narrative}"
          </p>

          <div className="flex flex-wrap gap-2">
            {summary.keyPoints.map((pt, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[10px] text-[var(--text)]">
                {pt}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🎯 OBJECTIFS INTELLIGENTS */}
      {goals && goals.length > 0 && (
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center gap-2 mb-4 text-[var(--accent)]">
            <Target size={18} />
            <span className="font-bebas tracking-wider">OBJECTIFS ANALYTIQUES</span>
          </div>

          <div className="flex flex-col gap-3">
            {goals.map((g) => {
              const progress = Math.min((g.current / g.target) * 100, 100);
              return (
                <div key={g.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-[var(--text)]">{g.label}</span>
                    <span className={`text-[9px] px-1.5 rounded-full font-bold border ${
                      g.difficulty === 'hard' ? 'border-[var(--red)] text-[var(--red)]' : 
                      g.difficulty === 'easy' ? 'border-[var(--green)] text-[var(--green)]' : 'border-yellow-500 text-yellow-500'
                    }`}>
                      {g.difficulty.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="h-1.5 w-full bg-[var(--surface)] rounded-full overflow-hidden">
                    <div 
                      style={{ width: `${progress}%` }} 
                      className={`h-full transition-all duration-1000 ${
                        progress >= 100 ? 'bg-[var(--green)] shadow-[0_0_8px_var(--green)]' : 'bg-[var(--accent)]'
                      }`}
                    />
                  </div>
                  
                  <div className="flex justify-between text-[10px] text-[var(--muted)]">
                    <span>Actuel: {g.current}{g.type === 'defense' ? '%' : ''}</span>
                    <span>Cible: {g.target}{g.type === 'defense' ? '%' : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
