import React, { useState, useDeferredValue, useMemo, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Plus, User } from 'lucide-react';
import { Participant } from '../types';

interface ParticipantAutocompleteProps {
  participants: Participant[];
  selectedParticipantId: string;
  onSelect: (participantId: string) => void;
  onAddParticipant: (name: string) => Promise<Participant>;
  walletId?: string;
  placeholder?: string;
}

export function ParticipantAutocomplete({
  participants,
  selectedParticipantId,
  onSelect,
  onAddParticipant,
  walletId,
  placeholder = 'Buscar participante...'
}: ParticipantAutocompleteProps) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 0 });

  const selectedParticipant = participants.find(p => p.id === selectedParticipantId);

  useEffect(() => {
    if (!isOpen || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = 300;
    if (spaceBelow >= menuHeight) {
      setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setCoords({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!inputRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    return participants.filter(p => {
      if (!p.active) return false;
      if (walletId && p.walletId && p.walletId !== walletId) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.ticker || '').toLowerCase().includes(q);
    });
  }, [participants, deferredSearch, walletId]);

  const exactMatch = useMemo(() =>
    participants.some(p => p.name.toLowerCase() === deferredSearch.toLowerCase().trim()),
    [participants, deferredSearch]
  );

  const handleAdd = async () => {
    if (!deferredSearch.trim()) return;
    setIsAdding(true);
    try {
      const newP = await onAddParticipant(deferredSearch.trim());
      onSelect(newP.id);
      setSearch('');
      setIsOpen(false);
    } finally {
      setIsAdding(false);
    }
  };

  const initials = (name: string) => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div ref={inputRef} className="relative">
      <div
        className="flex items-center gap-2 w-full border border-slate-200 rounded-lg px-3 py-2 bg-white cursor-text text-sm"
        onClick={() => { setIsOpen(true); }}
      >
        {selectedParticipant && !isOpen ? (
          <span className="flex items-center gap-2 flex-1">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">
              {initials(selectedParticipant.name)}
            </span>
            <span className="truncate">{selectedParticipant.name}</span>
          </span>
        ) : (
          <input
            autoFocus={isOpen}
            className="flex-1 outline-none bg-transparent text-sm"
            placeholder={selectedParticipant ? selectedParticipant.name : placeholder}
            value={search}
            onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
          />
        )}
        <User size={14} className="text-slate-400 shrink-0" />
      </div>

      {isOpen && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, bottom: coords.bottom, left: coords.left, width: Math.max(coords.width, 280), zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
        >
          {deferredSearch.trim() && !exactMatch && (
            <button
              onClick={handleAdd}
              disabled={isAdding}
              className="w-full flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              <Plus size={14} />
              {isAdding ? 'Cadastrando...' : `Cadastrar Novo: "${deferredSearch}"`}
            </button>
          )}
          {filtered.length > 0 ? (
            <List
              height={Math.min(filtered.length * 56, 280)}
              itemCount={filtered.length}
              itemSize={56}
              width={Math.max(coords.width, 280)}
            >
              {({ index, style }: any) => {
                const p = filtered[index];
                return (
                  <button
                    key={p.id}
                    style={style}
                    className="w-full flex items-center gap-3 px-4 text-sm hover:bg-slate-50 text-left"
                    onClick={() => { onSelect(p.id); setSearch(''); setIsOpen(false); }}
                  >
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold shrink-0">
                      {initials(p.name)}
                    </span>
                    <span className="text-left leading-tight">{p.name}</span>
                  </button>
                );
              }}
            </List>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-400 text-center">
              {deferredSearch.trim() ? 'Nenhum participante encontrado.' : 'Nenhum participante cadastrado.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
