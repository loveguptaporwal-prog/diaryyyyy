// src/utils/formatPage.js
export function autoFormatPageBlocks(blocks = []) {
  if (!blocks || blocks.length === 0) return blocks;

  const mediaBlocks = blocks.filter((b) => b.type === 'photo' || b.type === 'video');
  const textBlocks = blocks.filter((b) => b.type === 'text');
  const otherBlocks = blocks.filter((b) => b.type !== 'photo' && b.type !== 'video' && b.type !== 'text');

  if (mediaBlocks.length === 0) {
    // If no media, all text blocks can span the full comfortable reading width
    const formattedText = textBlocks.map((b) => ({
      ...b,
      x: 84,
      width: 604,
    }));
    return [...formattedText, ...otherBlocks];
  }

  const updatedTextBlocks = textBlocks.map((textBlock) => {
    const textY = textBlock.y ?? textBlock.top ?? 260;
    const textH = Math.max(textBlock.height || 110, 60);

    // Check if this text block vertically overlaps with any media block
    let leftSideOccupied = false;
    let rightSideOccupied = false;
    let fullWidthOccupied = false;
    let lowestOccupiedBottom = textY;

    for (const media of mediaBlocks) {
      const mediaY = media.y ?? media.top ?? 260;
      const mediaH = media.h ?? media.height ?? 230;
      const mediaW = media.w ?? media.width ?? 300;
      const mediaX = media.x ?? 84;

      const vOverlap = textY < mediaY + mediaH && textY + textH > mediaY;
      if (vOverlap) {
        lowestOccupiedBottom = Math.max(lowestOccupiedBottom, mediaY + mediaH + 18);
        if (mediaW >= 500) {
          fullWidthOccupied = true;
        } else if (mediaX < 260) {
          leftSideOccupied = true;
        } else {
          rightSideOccupied = true;
        }
      }
    }

    if (fullWidthOccupied) {
      // Push below the full-width media
      return {
        ...textBlock,
        x: 84,
        y: lowestOccupiedBottom,
        top: lowestOccupiedBottom,
        width: 604,
      };
    } else if (leftSideOccupied && !rightSideOccupied) {
      // Media is on left, wrap text to right column
      return {
        ...textBlock,
        x: 394,
        width: 310,
      };
    } else if (rightSideOccupied && !leftSideOccupied) {
      // Media is on right, wrap text to left column
      return {
        ...textBlock,
        x: 64,
        width: 310,
      };
    } else if (leftSideOccupied && rightSideOccupied) {
      // Both columns occupied at this Y, push below both
      return {
        ...textBlock,
        x: 84,
        y: lowestOccupiedBottom,
        top: lowestOccupiedBottom,
        width: 604,
      };
    }

    // No vertical overlap with media
    return {
      ...textBlock,
      x: 84,
      width: 604,
    };
  });

  return [...updatedTextBlocks, ...mediaBlocks, ...otherBlocks];
}
