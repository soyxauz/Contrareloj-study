import React from 'react';

export interface DialogueLine {
  speaker: string;
  time: string;
  text: string;
}

export interface PodcastTranscriptViewProps {
  dialogue: DialogueLine[];
  currentLineIndex: number;
  onSelectLine: (idx: number) => void;
}

export const PodcastTranscriptView: React.FC<PodcastTranscriptViewProps> = ({
  dialogue,
  currentLineIndex,
  onSelectLine,
}) => {
  return (
    <div className="bg-thea-surface border border-thea-border rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-3 sm:space-y-4 shadow-xl">
      <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-thea-border">
        <h3 className="font-bold text-white text-sm sm:text-base">Transcripción Completa del Episodio</h3>
        <span className="text-xs text-amber-400 font-semibold">{dialogue.length} intervenciones</span>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {dialogue.map((item, idx) => (
          <div
            key={idx}
            onClick={() => onSelectLine(idx)}
            className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer ${
              currentLineIndex === idx
                ? 'border-amber-500/50 bg-amber-500/10 shadow-md ring-1 ring-amber-500/30'
                : 'border-thea-border/60 bg-thea-surfaceLight/40 hover:bg-thea-surfaceLight'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs text-violet-300">{item.speaker}</span>
              <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono">{item.time}</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
