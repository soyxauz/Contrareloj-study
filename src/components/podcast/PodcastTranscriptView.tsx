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
  segmentTimes?: string[];
}

export const PodcastTranscriptView: React.FC<PodcastTranscriptViewProps> = ({
  dialogue,
  currentLineIndex,
  onSelectLine,
  segmentTimes,
}) => {
  return (
    <div className="bg-[#0e0b16]/95 border border-white/[0.08] rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-3 sm:space-y-4 shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-white/[0.06]">
        <h3 className="font-bold text-white text-sm sm:text-base">Transcripción Completa del Episodio</h3>
        <span className="text-xs text-zinc-400 font-semibold tabular-nums">{dialogue.length} intervenciones</span>
      </div>

      <div className="space-y-2.5 sm:space-y-3">
        {dialogue.map((item, idx) => (
          <div
            key={idx}
            onClick={() => onSelectLine(idx)}
            className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer active:scale-[0.99] ${
              currentLineIndex === idx
                ? 'border-white/30 bg-white/[0.06] shadow-sm'
                : 'border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05]'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs text-zinc-200">{item.speaker}</span>
              <span className="text-[10px] sm:text-[11px] text-zinc-500 font-mono tabular-nums">
                {segmentTimes?.[idx] || item.time}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
