import { create } from 'zustand';

export const useOverlay = create((set) => ({
  rects: {
    left: null,
    right: null,
  },
  setRect: (side, r) => {
    set((state) => {
      const prev = state.rects[side];
      if (
        prev &&
        Math.abs(prev.left - r.left) < 0.5 &&
        Math.abs(prev.top - r.top) < 0.5 &&
        Math.abs(prev.width - r.width) < 0.5 &&
        Math.abs(prev.height - r.height) < 0.5
      ) {
        return state;
      }
      return {
        rects: {
          ...state.rects,
          [side]: r,
        },
      };
    });
  },
}));
