import { Extension } from '@tiptap/core';
import { LINE } from '../constants/pageLayout.js';

export const SIZES = [
  { id: 'small', label: 'Small', px: 21 },
  { id: 'normal', label: 'Normal', px: 26 },
  { id: 'large', label: 'Large', px: 32 },
  { id: 'title', label: 'Title', px: 42 },
];

export const ParagraphSize = Extension.create({
  name: 'paragraphSize',

  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        size: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-size'),
          renderHTML: (attributes) => {
            if (!attributes.size) return {};
            const px = SIZES.find((size) => size.id === attributes.size)?.px ?? 26;
            const rows = Math.max(1, Math.ceil((px * 1.3) / LINE));
            return {
              'data-size': attributes.size,
              style: `font-size:${px}px; line-height:${rows * LINE}px`,
            };
          },
        },
      },
    }];
  },

  addCommands() {
    return {
      setParagraphSize: (size) => ({ state, tr, dispatch }) => {
        const { selection } = state;
        let updated = false;
        const updateNode = (node, position) => {
          if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return;
          if (dispatch) {
            tr.setNodeMarkup(position, undefined, { ...node.attrs, size });
          }
          updated = true;
        };

        if (selection.empty) {
          updateNode(selection.$from.parent, selection.$from.before());
        } else {
          state.doc.nodesBetween(selection.from, selection.to, updateNode);
        }
        return updated;
      },
    };
  },
});
