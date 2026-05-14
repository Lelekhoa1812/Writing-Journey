(function () {
  const STORE_KEY = 'ielts-annotations';
  let pendingRange = null;
  let pendingNoteId = null;
  let annotationDisplay = null;

  // --- Storage ---
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
    catch { /* quota exceeded — silent fail */ }
  }

  function questionKey(display) {
    return display.textContent.trim().substring(0, 200);
  }

  // --- Range helpers ---
  function getSelectionRange(display) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!display.contains(range.commonAncestorContainer)) return null;
    return range;
  }

  function wrapRange(range, tag, attrs) {
    const wrapper = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') wrapper.className = v;
      else wrapper.setAttribute(k, v);
    });
    try {
      // Fast path: works when range doesn't span element boundaries
      range.surroundContents(wrapper);
    } catch {
      // Fallback: extract fragment and rewrap
      const frag = range.extractContents();
      wrapper.appendChild(frag);
      range.insertNode(wrapper);
    }
    window.getSelection()?.removeAllRanges();
    return wrapper;
  }

  // --- Note popup helpers ---
  function showPopup(popup, clientX, clientY) {
    popup.classList.remove('hidden');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popupW = 280;
    const popupH = 160;
    let left = clientX + 10;
    let top = clientY + 10;
    if (left + popupW > vw - 8) left = Math.max(8, vw - popupW - 8);
    if (top + popupH > vh - 8) top = Math.max(8, clientY - popupH - 10);
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  function hidePopup(popup) {
    popup.classList.add('hidden');
    pendingRange = null;
    pendingNoteId = null;
  }

  // --- Public API ---
  window.AnnotationSystem = {

    init(display, popup, popupText, popupSave, popupCancel, popupDelete) {
      annotationDisplay = display;

      // Keyboard shortcuts
      display.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
          e.preventDefault();
          this.applyHighlight(display);
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
          e.preventDefault();
          this.applyUnderline(display);
        }
      });

      // Right-click / context menu → note popup
      display.addEventListener('contextmenu', (e) => {
        const noteSpan = e.target.closest('[data-note-id]');
        const range = getSelectionRange(display);
        if (noteSpan || range) {
          e.preventDefault();
          if (noteSpan) {
            pendingNoteId = noteSpan.dataset.noteId;
            pendingRange = null;
            popupText.value = noteSpan.dataset.noteContent || '';
            popupDelete.classList.remove('hidden');
          } else {
            pendingRange = range.cloneRange();
            pendingNoteId = null;
            popupText.value = '';
            popupDelete.classList.add('hidden');
          }
          popup.querySelector('.note-popup-header span').textContent =
            pendingNoteId ? 'Edit Note' : 'Add Note';
          showPopup(popup, e.clientX, e.clientY);
          setTimeout(() => popupText.focus(), 50);
        }
      });

      // Double-click → note popup (Mac primary gesture; works everywhere)
      display.addEventListener('dblclick', (e) => {
        const noteSpan = e.target.closest('[data-note-id]');
        const range = getSelectionRange(display);
        if (noteSpan || range) {
          e.preventDefault();
          if (noteSpan) {
            pendingNoteId = noteSpan.dataset.noteId;
            pendingRange = null;
            popupText.value = noteSpan.dataset.noteContent || '';
            popupDelete.classList.remove('hidden');
          } else {
            pendingRange = range.cloneRange();
            pendingNoteId = null;
            popupText.value = '';
            popupDelete.classList.add('hidden');
          }
          popup.querySelector('.note-popup-header span').textContent =
            pendingNoteId ? 'Edit Note' : 'Add Note';
          showPopup(popup, e.clientX, e.clientY);
          setTimeout(() => popupText.focus(), 50);
        }
      });

      // Save note
      popupSave.addEventListener('click', () => {
        const noteText = popupText.value.trim();
        if (!noteText) { hidePopup(popup); return; }

        if (pendingNoteId) {
          // Update existing note span in place
          const span = display.querySelector(`[data-note-id="${pendingNoteId}"]`);
          if (span) span.dataset.noteContent = noteText;
        } else if (pendingRange) {
          const id = 'note-' + Date.now();
          wrapRange(pendingRange, 'span', {
            class: 'hl-note',
            'data-note-id': id,
            'data-note-content': noteText,
          });
        }
        this.saveAnnotations(display);
        hidePopup(popup);
      });

      // Cancel / close
      popupCancel.addEventListener('click', () => hidePopup(popup));

      // Delete note
      popupDelete.addEventListener('click', () => {
        if (!pendingNoteId) { hidePopup(popup); return; }
        const span = display.querySelector(`[data-note-id="${pendingNoteId}"]`);
        if (span) {
          const parent = span.parentNode;
          while (span.firstChild) parent.insertBefore(span.firstChild, span);
          parent.removeChild(span);
        }
        this.saveAnnotations(display);
        hidePopup(popup);
      });

      // Close when clicking outside
      document.addEventListener('mousedown', (e) => {
        if (!popup.classList.contains('hidden') &&
            !popup.contains(e.target) &&
            e.target !== display) {
          hidePopup(popup);
        }
      });

      // Enter key in note textarea saves
      popupText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          popupSave.click();
        }
      });
    },

    applyHighlight(display) {
      const range = getSelectionRange(display);
      if (!range) return;
      wrapRange(range, 'mark', { class: 'hl-orange' });
      this.saveAnnotations(display);
    },

    applyUnderline(display) {
      const range = getSelectionRange(display);
      if (!range) return;
      wrapRange(range, 'span', { class: 'hl-underline' });
      this.saveAnnotations(display);
    },

    saveAnnotations(display) {
      const key = questionKey(display);
      if (!key) return;
      const store = loadStore();
      store[key] = { html: display.innerHTML };
      saveStore(store);
    },

    loadAnnotations(display) {
      const key = questionKey(display);
      if (!key) return;
      const store = loadStore();
      if (store[key] && store[key].html) {
        display.innerHTML = store[key].html;
      }
    },
  };
})();
