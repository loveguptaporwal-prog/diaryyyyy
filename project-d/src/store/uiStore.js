import { create } from 'zustand';

// Ensure caret-hidden is cleared from DOM and storage
try {
  localStorage.removeItem('project-d-cursor-hidden');
  if (typeof document !== 'undefined') {
    document.body.classList.remove('caret-hidden');
  }
} catch {}

export const useUI = create((set, get) => ({
  mode: 'read',
  activePageId: null,
  selectedBlockId: null,
  savedStatus: 'saved',
  toast: null,
  hasShownWriteHint: false,
  activeEditor: null,
  activeEditorPageId: null,
  lastSelection: null,

  setMode: (mode) => set({ mode, selectedBlockId: null }),
  setActivePage: (id) => set({ activePageId: id }),
  setSelectedBlock: (id) => set({ selectedBlockId: id }),
  setSavedStatus: (s) => set({ savedStatus: s }),
  markWriteHintShown: () => set({ hasShownWriteHint: true }),
  setActiveEditor: (editor, pageId = null) => set({ activeEditor: editor, activeEditorPageId: pageId }),
  setLastSelection: (selection) => set({ lastSelection: selection }),

  showToast: (toast) => {
    set({ toast });
    setTimeout(() => {
      set((state) => (state.toast === toast ? { toast: null } : state));
    }, 3200);
  },
}));
