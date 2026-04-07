import { useState, useEffect, RefObject } from 'react';

interface Position {
  x: number;
  y: number;
}

export function useTextSelection(popoverRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<{ text: string; position: Position } | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleMouseUp = (e: MouseEvent) => {
      // Ignore clicks inside the popover
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }

      timeoutId = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() || '';

        // Check if there is text and it contains Chinese characters OR is long enough for English
        // The backend handles ZH <-> EN, so we just need a valid selection.
        if (text.length >= 2) {
          const range = sel!.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          setSelection({
            text,
            position: {
              x: rect.left + rect.width / 2,
              y: rect.top + window.scrollY
            }
          });
        } else {
          setSelection(null);
        }
      }, 300);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Ignore clicks inside the popover
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }
      clearTimeout(timeoutId);
      
      // Clear selection if clicking outside
      const sel = window.getSelection();
      if (!sel?.toString().trim()) {
         setSelection(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection(null);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeoutId);
    };
  }, [popoverRef]);

  return { selection, clearSelection: () => setSelection(null) };
}
