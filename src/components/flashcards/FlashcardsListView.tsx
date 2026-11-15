import React, { useState, useMemo } from 'react';
import type { Flashcard } from '../../types';
import { Plus, Pencil, Trash2, X, ChevronDown, Check, ArrowUpDown, BookOpen } from 'lucide-react';
import { gameAudio } from './games/gameAudio';
import { cleanConceptDefinition, cleanConceptTerm } from './flashcardSanitizer';
import { FormattedText } from '../FormattedText';
import { useTheme } from '../../services/themeService';

interface FlashcardsListViewProps {
  cards: Flashcard[];
  onAddCard: (term: string, definition: string) => void;
  onEditCard: (cardId: string, term: string, definition: string) => void;
  onDeleteCard: (cardId: string) => void;
}

type SortOrder = 'alpha-asc' | 'alpha-desc' | 'original';
type DisplayMode = 'all' | 'hide-defs' | 'hide-terms';

const getCardTerm = (c: Flashcard): string => cleanConceptTerm(c.term || (c as any).frontText || '');
const getCardDef = (c: Flashcard): string => cleanConceptDefinition(c.definition || (c as any).backText || '');

export const FlashcardsListView: React.FC<FlashcardsListViewProps> = ({
  cards,
  onAddCard,
  onEditCard,
  onDeleteCard,
}) => {
  const { theme } = useTheme();
  const [sortOrder, setSortOrder] = useState<SortOrder>('alpha-asc');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);

  // Form states
  const [formTerm, setFormTerm] = useState('');
  const [formDef, setFormDef] = useState('');

  // Sorted cards
  const sortedCards = useMemo(() => {
    const list = [...cards];
    if (sortOrder === 'alpha-asc') {
      return list.sort((a, b) => getCardTerm(a).localeCompare(getCardTerm(b), 'es', { sensitivity: 'base' }));
    } else if (sortOrder === 'alpha-desc') {
      return list.sort((a, b) => getCardTerm(b).localeCompare(getCardTerm(a), 'es', { sensitivity: 'base' }));
    }
    return list;
  }, [cards, sortOrder]);

  const openAddModal = () => {
    gameAudio.playTap();
    setFormTerm('');
    setFormDef('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (card: Flashcard, e: React.MouseEvent) => {
    e.stopPropagation();
    gameAudio.playTap();
    setEditingCard(card);
    setFormTerm(getCardTerm(card));
    setFormDef(getCardDef(card));
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTerm.trim() || !formDef.trim()) return;
    gameAudio.playSuccess();
    onAddCard(formTerm.trim(), formDef.trim());
    setIsAddModalOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard || !formTerm.trim() || !formDef.trim()) return;
    gameAudio.playSuccess();
    onEditCard(editingCard.id, formTerm.trim(), formDef.trim());
    setEditingCard(null);
  };

  const handleDelete = () => {
    if (!editingCard) return;
    gameAudio.playTap();
    onDeleteCard(editingCard.id);
    setEditingCard(null);
  };

  return (
    <div className={`w-full max-w-5xl mx-auto py-2 px-2 sm:px-4 animate-fadeIn ${
      theme === 'kitty' ? 'text-pink-950' : theme === 'light' ? 'text-slate-900' : 'text-slate-100'
    }`}>
      {/* Subheader */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          {/* Tarjetas count title */}
          <h2 className={`text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums mb-3 ${
            theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-900 font-black' : 'text-white'
          }`}>
            {cards.length} tarjetas de memoria
          </h2>

          {/* + Agregar button */}
          <button
            type="button"
            onClick={openAddModal}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-[0.98] duration-150 cursor-pointer shadow-sm ${
              theme === 'kitty'
                ? 'bg-white hover:bg-pink-50 border border-pink-300 text-pink-700 hover:text-pink-900 shadow-xs'
                : theme === 'light'
                ? 'bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 hover:text-slate-900 shadow-xs'
                : 'bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.18] text-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Agregar</span>
          </button>
        </div>

        {/* Dropdowns on the right */}
        <div className="flex items-center gap-3 self-start sm:self-center">
          {/* Dropdown 1: Alfabético */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSortMenu(!showSortMenu);
                setShowDisplayMenu(false);
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-sm ${
                theme === 'kitty'
                  ? 'bg-white hover:bg-pink-50 border border-pink-200 text-pink-900 shadow-xs'
                  : theme === 'light'
                  ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 shadow-xs'
                  : 'bg-[#20173d] hover:bg-[#2c2054] border border-white/[0.12] text-slate-200'
              }`}
            >
              <ArrowUpDown className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`} />
              <span>
                {sortOrder === 'alpha-asc' ? 'Alfabético' : sortOrder === 'alpha-desc' ? 'Alfabético (Z-A)' : 'Original'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`} />
            </button>

            {showSortMenu && (
              <div className={`absolute right-0 mt-1.5 w-44 rounded-2xl shadow-2xl py-1.5 z-40 animate-fadeIn border ${
                theme === 'kitty'
                  ? 'bg-white border-pink-200 text-pink-950 shadow-pink-200/50'
                  : theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
                  : 'bg-[#1b1236] border-white/[0.15] text-slate-200'
              }`}>
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('alpha-asc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    theme === 'kitty'
                      ? 'text-pink-950 hover:bg-pink-100/60'
                      : theme === 'light'
                      ? 'text-slate-800 hover:bg-slate-100'
                      : 'text-slate-200 hover:bg-purple-600/30'
                  }`}
                >
                  <span>Alfabético (A-Z)</span>
                  {sortOrder === 'alpha-asc' && <Check className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-purple-400'}`} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('alpha-desc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    theme === 'kitty'
                      ? 'text-pink-950 hover:bg-pink-100/60'
                      : theme === 'light'
                      ? 'text-slate-800 hover:bg-slate-100'
                      : 'text-slate-200 hover:bg-purple-600/30'
                  }`}
                >
                  <span>Alfabético (Z-A)</span>
                  {sortOrder === 'alpha-desc' && <Check className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-purple-400'}`} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('original');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    theme === 'kitty'
                      ? 'text-pink-950 hover:bg-pink-100/60'
                      : theme === 'light'
                      ? 'text-slate-800 hover:bg-slate-100'
                      : 'text-slate-200 hover:bg-purple-600/30'
                  }`}
                >
                  <span>Orden Original</span>
                  {sortOrder === 'original' && <Check className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-purple-400'}`} />}
                </button>
              </div>
            )}
          </div>

          {/* Dropdown 2: Definiciones */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowDisplayMenu(!showDisplayMenu);
                setShowSortMenu(false);
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-sm ${
                theme === 'kitty'
                  ? 'bg-white hover:bg-pink-50 border border-pink-200 text-pink-900 shadow-xs'
                  : theme === 'light'
                  ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 shadow-xs'
                  : 'bg-[#20173d] hover:bg-[#2c2054] border border-white/[0.12] text-slate-200'
              }`}
            >
              <BookOpen className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`} />
              <span>
                {displayMode === 'all' ? 'Definiciones' : displayMode === 'hide-defs' ? 'Solo Términos' : 'Solo Definiciones'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`} />
            </button>

            {showDisplayMenu && (
              <div className={`absolute right-0 mt-1.5 w-48 rounded-2xl shadow-2xl py-1.5 z-40 animate-fadeIn border ${
                theme === 'kitty'
                  ? 'bg-white border-pink-200 text-pink-950 shadow-pink-200/50'
                  : theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
                  : 'bg-[#1b1236] border-white/[0.15] text-slate-200'
              }`}>
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode('all');
                    setShowDisplayMenu(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    theme === 'kitty'
                      ? 'text-pink-950 hover:bg-pink-100/60'
                      : theme === 'light'
                      ? 'text-slate-800 hover:bg-slate-100'
                      : 'text-slate-200 hover:bg-purple-600/30'
                  }`}
                >
                  <span>Ver Término y Definición</span>
                  {displayMode === 'all' && <Check className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-purple-400'}`} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode('hide-defs');
                    setShowDisplayMenu(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    theme === 'kitty'
                      ? 'text-pink-950 hover:bg-pink-100/60'
                      : theme === 'light'
                      ? 'text-slate-800 hover:bg-slate-100'
                      : 'text-slate-200 hover:bg-purple-600/30'
                  }`}
                >
                  <span>Solo Términos</span>
                  {displayMode === 'hide-defs' && <Check className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-purple-400'}`} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode('hide-terms');
                    setShowDisplayMenu(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    theme === 'kitty'
                      ? 'text-pink-950 hover:bg-pink-100/60'
                      : theme === 'light'
                      ? 'text-slate-800 hover:bg-slate-100'
                      : 'text-slate-200 hover:bg-purple-600/30'
                  }`}
                >
                  <span>Solo Definiciones</span>
                  {displayMode === 'hide-terms' && <Check className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-purple-400'}`} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards List */}
      <div className="space-y-3.5">
        {sortedCards.map(card => {
          const term = getCardTerm(card);
          const def = getCardDef(card);

          return (
            <div
              key={card.id}
              className={`p-4 sm:p-5 rounded-2xl border transition-transform active:scale-[0.99] duration-150 flex items-center justify-between gap-4 shadow-md group ${
                theme === 'kitty'
                  ? 'bg-white hover:bg-pink-50/40 border-pink-200 hover:border-pink-300 text-pink-950 shadow-[0_4px_16px_rgba(236,72,153,0.08)]'
                  : theme === 'light'
                  ? 'bg-white hover:bg-slate-50/80 border-slate-200 hover:border-slate-300 text-slate-900 shadow-sm'
                  : 'bg-[#140e2b]/90 hover:bg-[#1a1238] border-white/[0.1] hover:border-purple-400/40 text-slate-100'
              }`}
              style={{
                boxShadow:
                  theme === 'kitty'
                    ? '0 4px 16px rgba(236, 72, 153, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                    : theme === 'light'
                    ? '0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                    : '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              }}
            >
              {/* Content left */}
              <div className="flex-1 text-sm sm:text-base leading-relaxed">
                {displayMode === 'all' && (
                  <div>
                    <strong className={`font-bold ${
                      theme === 'kitty' ? 'text-pink-900 font-extrabold' : theme === 'light' ? 'text-slate-950 font-bold' : 'text-[#fecdd3]'
                    }`}>
                      <FormattedText text={term} inlineOnly />
                    </strong>
                    <span className={`mx-2 font-normal ${
                      theme === 'kitty' ? 'text-pink-300' : theme === 'light' ? 'text-slate-300' : 'text-slate-400'
                    }`}>|</span>
                    <span className={`font-normal ${
                      theme === 'kitty' ? 'text-pink-950/90 font-medium' : theme === 'light' ? 'text-slate-700' : 'text-slate-300'
                    }`}>
                      <FormattedText text={def} inlineOnly />
                    </span>
                  </div>
                )}

                {displayMode === 'hide-defs' && (
                  <div>
                    <strong className={`font-bold ${
                      theme === 'kitty' ? 'text-pink-900 font-extrabold' : theme === 'light' ? 'text-slate-950 font-bold' : 'text-[#fecdd3]'
                    }`}>
                      <FormattedText text={term} inlineOnly />
                    </strong>
                  </div>
                )}

                {displayMode === 'hide-terms' && (
                  <div>
                    <span className={`font-normal ${
                      theme === 'kitty' ? 'text-pink-950/90 font-medium' : theme === 'light' ? 'text-slate-700' : 'text-slate-300'
                    }`}>
                      <FormattedText text={def} inlineOnly />
                    </span>
                  </div>
                )}
              </div>

              {/* Edit Pencil Icon on right */}
              <button
                type="button"
                title="Editar tarjeta"
                onClick={(e) => openEditModal(card, e)}
                className={`p-2 rounded-xl transition-colors cursor-pointer flex-shrink-0 ${
                  theme === 'kitty'
                    ? 'text-pink-400 hover:text-pink-700 hover:bg-pink-100/60'
                    : theme === 'light'
                    ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.1]'
                }`}
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal: Agregar Tarjeta */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-lg max-h-[90dvh] overflow-y-auto p-6 sm:p-8 rounded-3xl border shadow-2xl ${
            theme === 'kitty'
              ? 'bg-white border-pink-200 text-pink-950 shadow-pink-200/50'
              : theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
              : 'bg-[#140e2b] border-white/[0.12] text-white'
          }`}>
            <div className={`flex items-center justify-between mb-6 pb-3 border-b ${
              theme === 'kitty' ? 'border-pink-200/70' : theme === 'light' ? 'border-slate-200' : 'border-white/[0.08]'
            }`}>
              <h3 className={`text-xl font-bold tracking-tight ${
                theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-900 font-bold' : 'text-white'
              }`}>
                Agregar Tarjeta de Memoria
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className={`p-1.5 rounded-xl transition-colors ${
                  theme === 'kitty'
                    ? 'text-pink-400 hover:text-pink-700 hover:bg-pink-100/60'
                    : theme === 'light'
                    ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.1]'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${
                  theme === 'kitty' ? 'text-pink-700' : theme === 'light' ? 'text-slate-600' : 'text-slate-300'
                }`}>
                  Término o Concepto
                </label>
                <input
                  type="text"
                  required
                  value={formTerm}
                  onChange={e => setFormTerm(e.target.value)}
                  placeholder="Ej. Anticuerpo anticardiolipina (aCL)"
                  className={`w-full rounded-xl px-4 py-2.5 text-base md:text-sm outline-none transition-colors border ${
                    theme === 'kitty'
                      ? 'bg-pink-50/50 border-pink-200 focus:border-pink-400 text-pink-950 placeholder-pink-400'
                      : theme === 'light'
                      ? 'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400'
                      : 'bg-[#0d081e] border-white/[0.12] focus:border-purple-400 text-white placeholder-slate-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${
                  theme === 'kitty' ? 'text-pink-700' : theme === 'light' ? 'text-slate-600' : 'text-slate-300'
                }`}>
                  Definición o Explicación
                </label>
                <textarea
                  rows={4}
                  required
                  value={formDef}
                  onChange={e => setFormDef(e.target.value)}
                  placeholder="Ej. Tipo de anticuerpo antifosfolípido dirigido contra la cardiolipina..."
                  className={`w-full rounded-xl px-4 py-2.5 text-base md:text-sm outline-none transition-colors resize-none border ${
                    theme === 'kitty'
                      ? 'bg-pink-50/50 border-pink-200 focus:border-pink-400 text-pink-950 placeholder-pink-400'
                      : theme === 'light'
                      ? 'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400'
                      : 'bg-[#0d081e] border-white/[0.12] focus:border-purple-400 text-white placeholder-slate-500'
                  }`}
                />
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                theme === 'kitty' ? 'border-pink-200/70' : theme === 'light' ? 'border-slate-200' : 'border-white/[0.08]'
              }`}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    theme === 'kitty'
                      ? 'bg-pink-100/70 hover:bg-pink-200 text-pink-700'
                      : theme === 'light'
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-300'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all cursor-pointer ${
                    theme === 'kitty'
                      ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/30'
                      : theme === 'light'
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                  }`}
                >
                  Guardar Tarjeta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Tarjeta */}
      {editingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-lg max-h-[90dvh] overflow-y-auto p-6 sm:p-8 rounded-3xl border shadow-2xl ${
            theme === 'kitty'
              ? 'bg-white border-pink-200 text-pink-950 shadow-pink-200/50'
              : theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
              : 'bg-[#140e2b] border-white/[0.12] text-white'
          }`}>
            <div className={`flex items-center justify-between mb-6 pb-3 border-b ${
              theme === 'kitty' ? 'border-pink-200/70' : theme === 'light' ? 'border-slate-200' : 'border-white/[0.08]'
            }`}>
              <h3 className={`text-xl font-bold tracking-tight ${
                theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-900 font-bold' : 'text-white'
              }`}>
                Editar Tarjeta de Memoria
              </h3>
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className={`p-1.5 rounded-xl transition-colors ${
                  theme === 'kitty'
                    ? 'text-pink-400 hover:text-pink-700 hover:bg-pink-100/60'
                    : theme === 'light'
                    ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.1]'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${
                  theme === 'kitty' ? 'text-pink-700' : theme === 'light' ? 'text-slate-600' : 'text-slate-300'
                }`}>
                  Término o Concepto
                </label>
                <input
                  type="text"
                  required
                  value={formTerm}
                  onChange={e => setFormTerm(e.target.value)}
                  className={`w-full rounded-xl px-4 py-2.5 text-base md:text-sm outline-none transition-colors border ${
                    theme === 'kitty'
                      ? 'bg-pink-50/50 border-pink-200 focus:border-pink-400 text-pink-950'
                      : theme === 'light'
                      ? 'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-900'
                      : 'bg-[#0d081e] border-white/[0.12] focus:border-purple-400 text-white'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${
                  theme === 'kitty' ? 'text-pink-700' : theme === 'light' ? 'text-slate-600' : 'text-slate-300'
                }`}>
                  Definición o Explicación
                </label>
                <textarea
                  rows={4}
                  required
                  value={formDef}
                  onChange={e => setFormDef(e.target.value)}
                  className={`w-full rounded-xl px-4 py-2.5 text-base md:text-sm outline-none transition-colors resize-none border ${
                    theme === 'kitty'
                      ? 'bg-pink-50/50 border-pink-200 focus:border-pink-400 text-pink-950'
                      : theme === 'light'
                      ? 'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-900'
                      : 'bg-[#0d081e] border-white/[0.12] focus:border-purple-400 text-white'
                  }`}
                />
              </div>

              <div className={`flex items-center justify-between pt-4 border-t ${
                theme === 'kitty' ? 'border-pink-200/70' : theme === 'light' ? 'border-slate-200' : 'border-white/[0.08]'
              }`}>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-500 dark:text-rose-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingCard(null)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      theme === 'kitty'
                        ? 'bg-pink-100/70 hover:bg-pink-200 text-pink-700'
                        : theme === 'light'
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-300'
                    }`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className={`px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all cursor-pointer ${
                      theme === 'kitty'
                        ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/30'
                        : theme === 'light'
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                    }`}
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
