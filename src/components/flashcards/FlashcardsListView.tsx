import React, { useState, useMemo } from 'react';
import type { Flashcard } from '../../types';
import { Plus, Pencil, Trash2, X, ChevronDown, Check, ArrowUpDown, BookOpen } from 'lucide-react';
import { gameAudio } from './games/gameAudio';

interface FlashcardsListViewProps {
  cards: Flashcard[];
  onAddCard: (term: string, definition: string) => void;
  onEditCard: (cardId: string, term: string, definition: string) => void;
  onDeleteCard: (cardId: string) => void;
}

type SortOrder = 'alpha-asc' | 'alpha-desc' | 'original';
type DisplayMode = 'all' | 'hide-defs' | 'hide-terms';

const getCardTerm = (c: Flashcard): string => c.term || (c as any).frontText || '';
const getCardDef = (c: Flashcard): string => c.definition || (c as any).backText || '';

export const FlashcardsListView: React.FC<FlashcardsListViewProps> = ({
  cards,
  onAddCard,
  onEditCard,
  onDeleteCard,
}) => {
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
    <div className="w-full max-w-5xl mx-auto py-2 px-2 sm:px-4 animate-fadeIn text-slate-100">
      {/* Subheader matching Screenshot 1 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          {/* Tarjetas count title */}
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums mb-3">
            {cards.length} tarjetas de memoria
          </h2>

          {/* + Agregar button */}
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.18] text-xs font-bold text-white transition-transform active:scale-[0.98] duration-150 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar</span>
          </button>
        </div>

        {/* Dropdowns on the right matching Screenshot 1 */}
        <div className="flex items-center gap-3 self-start sm:self-center">
          {/* Dropdown 1: Alfabético */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSortMenu(!showSortMenu);
                setShowDisplayMenu(false);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#20173d] hover:bg-[#2c2054] border border-white/[0.12] text-xs font-semibold text-slate-200 transition-colors cursor-pointer shadow-sm"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {sortOrder === 'alpha-asc' ? 'Alfabético' : sortOrder === 'alpha-desc' ? 'Alfabético (Z-A)' : 'Original'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showSortMenu && (
              <div className="absolute right-0 mt-1.5 w-44 rounded-2xl bg-[#1b1236] border border-white/[0.15] shadow-2xl py-1.5 z-40 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('alpha-asc');
                    setShowSortMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-purple-600/30 flex items-center justify-between cursor-pointer"
                >
                  <span>Alfabético (A-Z)</span>
                  {sortOrder === 'alpha-asc' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('alpha-desc');
                    setShowSortMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-purple-600/30 flex items-center justify-between cursor-pointer"
                >
                  <span>Alfabético (Z-A)</span>
                  {sortOrder === 'alpha-desc' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('original');
                    setShowSortMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-purple-600/30 flex items-center justify-between cursor-pointer"
                >
                  <span>Orden Original</span>
                  {sortOrder === 'original' && <Check className="w-3.5 h-3.5 text-purple-400" />}
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
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#20173d] hover:bg-[#2c2054] border border-white/[0.12] text-xs font-semibold text-slate-200 transition-colors cursor-pointer shadow-sm"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {displayMode === 'all' ? 'Definiciones' : displayMode === 'hide-defs' ? 'Solo Términos' : 'Solo Definiciones'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showDisplayMenu && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-2xl bg-[#1b1236] border border-white/[0.15] shadow-2xl py-1.5 z-40 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode('all');
                    setShowDisplayMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-purple-600/30 flex items-center justify-between cursor-pointer"
                >
                  <span>Ver Término y Definición</span>
                  {displayMode === 'all' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode('hide-defs');
                    setShowDisplayMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-purple-600/30 flex items-center justify-between cursor-pointer"
                >
                  <span>Solo Términos</span>
                  {displayMode === 'hide-defs' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode('hide-terms');
                    setShowDisplayMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-purple-600/30 flex items-center justify-between cursor-pointer"
                >
                  <span>Solo Definiciones</span>
                  {displayMode === 'hide-terms' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards List matching Screenshot 1 */}
      <div className="space-y-3.5">
        {sortedCards.map(card => {
          const term = getCardTerm(card);
          const def = getCardDef(card);

          return (
            <div
              key={card.id}
              className="p-4 sm:p-5 rounded-2xl bg-[#140e2b]/90 hover:bg-[#1a1238] border border-white/[0.1] hover:border-purple-400/40 transition-transform active:scale-[0.99] duration-150 flex items-center justify-between gap-4 shadow-md group"
              style={{
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              }}
            >
              {/* Content left */}
              <div className="flex-1 text-sm sm:text-base leading-relaxed">
                {displayMode === 'all' && (
                  <p>
                    <strong className="text-white font-bold">{term}</strong>
                    <span className="text-slate-400 mx-2 font-normal">|</span>
                    <span className="text-slate-300 font-normal">{def}</span>
                  </p>
                )}

                {displayMode === 'hide-defs' && (
                  <p>
                    <strong className="text-white font-bold">{term}</strong>
                  </p>
                )}

                {displayMode === 'hide-terms' && (
                  <p>
                    <span className="text-slate-300 font-normal">{def}</span>
                  </p>
                )}
              </div>

              {/* Edit Pencil Icon on right */}
              <button
                type="button"
                title="Editar tarjeta"
                onClick={(e) => openEditModal(card, e)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer flex-shrink-0"
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
          <div className="w-full max-w-lg p-6 sm:p-8 rounded-3xl bg-[#140e2b] border border-white/[0.12] shadow-2xl">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/[0.08]">
              <h3 className="text-xl font-bold text-white tracking-tight">Agregar Tarjeta de Memoria</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Término o Concepto
                </label>
                <input
                  type="text"
                  required
                  value={formTerm}
                  onChange={e => setFormTerm(e.target.value)}
                  placeholder="Ej. Anticuerpo anticardiolipina (aCL)"
                  className="w-full bg-[#0d081e] border border-white/[0.12] focus:border-purple-400 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Definición o Explicación
                </label>
                <textarea
                  rows={4}
                  required
                  value={formDef}
                  onChange={e => setFormDef(e.target.value)}
                  placeholder="Ej. Tipo de anticuerpo antifosfolípido dirigido contra la cardiolipina..."
                  className="w-full bg-[#0d081e] border border-white/[0.12] focus:border-purple-400 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
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
          <div className="w-full max-w-lg p-6 sm:p-8 rounded-3xl bg-[#140e2b] border border-white/[0.12] shadow-2xl">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/[0.08]">
              <h3 className="text-xl font-bold text-white tracking-tight">Editar Tarjeta de Memoria</h3>
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Término o Concepto
                </label>
                <input
                  type="text"
                  required
                  value={formTerm}
                  onChange={e => setFormTerm(e.target.value)}
                  className="w-full bg-[#0d081e] border border-white/[0.12] focus:border-purple-400 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Definición o Explicación
                </label>
                <textarea
                  rows={4}
                  required
                  value={formDef}
                  onChange={e => setFormDef(e.target.value)}
                  className="w-full bg-[#0d081e] border border-white/[0.12] focus:border-purple-400 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-colors resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingCard(null)}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
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
