/*
 * GraceBooks shared receipt annotator.
 *
 * A small, framework-free component for drawing labelled highlight boxes on
 * top of a receipt image, shared by expenses.html and
 * liquidation-reimbursements.html so the ~300 lines of canvas/overlay code
 * are not triplicated (see CLAUDE.md - this is a deliberate, documented
 * exception to "no shared JS beyond auth.js").
 *
 * This file must never import or reference Firebase - the calling page owns
 * all persistence and passes annotations in/out via plain objects.
 *
 * Public API: window.GraceBooksAnnotator.open({...}) and
 * window.GraceBooksAnnotator.isAnnotatableUrl(name, url).
 * See PLAN.md PART 0 for the full contract.
 */
(function () {
  'use strict';

  var COLORS = ['#f1c40f', '#2ecc71', '#3498db', '#e74c3c', '#9b59b6'];
  var STYLE_ID = 'gb-annot-styles';
  var STRAY_CLICK_THRESHOLD = 0.003;
  var MIN_BOX_SIZE = 0.01;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      // Explicit top/right/bottom/left rather than the `inset` shorthand:
      // this ships inside an Android Capacitor WebView (see android/,
      // capacitor.config.json) which can be older than Chrome 87.
      '.gb-annot-overlay { position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: rgba(0,0,0,0.65); z-index: 5000;',
      '  display: flex; align-items: center; justify-content: center; padding: 16px; font-family: Arial, sans-serif; }',
      '.gb-annot-modal { background: #fff; border-radius: 10px; width: 100%; max-width: 780px; max-height: 94vh;',
      '  display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.35); }',
      '.gb-annot-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;',
      '  padding: 16px 18px; border-bottom: 1px solid #eee; }',
      '.gb-annot-title { margin: 0; font-size: 16px; color: #8B0000; font-weight: bold; }',
      '.gb-annot-subtitle { margin-top: 4px; font-size: 12px; color: #667; }',
      '.gb-annot-close { background: none; border: none; font-size: 22px; line-height: 1; cursor: pointer; color: #777; padding: 2px 4px; }',
      '.gb-annot-body { padding: 14px 18px; overflow-y: auto; flex: 1; }',
      '.gb-annot-stage-wrap { position: relative; background: #f4f6f7; border: 1px solid #eee; border-radius: 8px;',
      '  min-height: 200px; display: flex; align-items: center; justify-content: center; }',
      '.gb-annot-loading { padding: 40px 10px; color: #8a99a5; font-size: 13px; }',
      '.gb-annot-stage { position: relative; display: inline-block; max-width: 100%; line-height: 0; touch-action: none; }',
      '.gb-annot-stage.gb-annot-editable { cursor: crosshair; }',
      '.gb-annot-img { display: block; max-width: 100%; max-height: 65vh; width: auto; height: auto; user-select: none; -webkit-user-drag: none; }',
      '.gb-annot-boxes { position: absolute; top: 0; right: 0; bottom: 0; left: 0; }',
      '.gb-annot-boxes.gb-annot-hidden-boxes { display: none; }',
      '.gb-annot-box { position: absolute; border: 2px solid; box-sizing: border-box; pointer-events: none; }',
      '.gb-annot-box .gb-annot-badge { position: absolute; top: -2px; left: -2px; transform: translate(-50%, -50%);',
      '  min-width: 18px; height: 18px; padding: 0 4px; border-radius: 50%; color: #fff; font-size: 11px; font-weight: bold;',
      '  display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }',
      '@keyframes gb-annot-pulse-anim { 0%, 100% { outline: 3px solid transparent; } 50% { outline: 3px solid rgba(255,255,255,0.9); } }',
      '.gb-annot-box.gb-annot-pulse { animation: gb-annot-pulse-anim 0.6s ease-in-out 2; }',
      '.gb-annot-preview-box { position: absolute; border: 2px dashed #333; background: rgba(0,0,0,0.08); pointer-events: none; display: none; }',
      '.gb-annot-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 10px; }',
      '.gb-annot-swatches { display: flex; gap: 6px; align-items: center; }',
      '.gb-annot-swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }',
      '.gb-annot-swatch.gb-annot-swatch-active { border-color: #333; }',
      '.gb-annot-link-btn, .gb-annot-toggle-btn { background: #eaf2f8; color: #1a5276; border: none; border-radius: 6px;',
      '  padding: 6px 10px; font-size: 12px; font-weight: bold; cursor: pointer; text-decoration: none; }',
      '.gb-annot-hint { font-size: 11px; color: #8a99a5; margin-top: 6px; }',
      '.gb-annot-legend { margin-top: 14px; }',
      '.gb-annot-legend-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;',
      '  color: #8B0000; margin-bottom: 6px; }',
      '.gb-annot-legend-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px;',
      '  margin-bottom: 4px; background: #f7f9fb; cursor: pointer; }',
      '.gb-annot-legend-num { min-width: 20px; height: 20px; border-radius: 50%; color: #fff; font-size: 11px; font-weight: bold;',
      '  display: flex; align-items: center; justify-content: center; flex-shrink: 0; }',
      '.gb-annot-legend-label { flex: 1; font-size: 12px; color: #333; }',
      '.gb-annot-legend-row input.gb-annot-legend-input { flex: 1; padding: 6px 8px; border: 1px solid #ccd6dd; border-radius: 5px; font-size: 12px; }',
      '.gb-annot-legend-del { background: #f9ebeb; color: #a93226; border: none; border-radius: 5px; width: 24px; height: 24px;',
      '  cursor: pointer; font-size: 13px; flex-shrink: 0; }',
      '.gb-annot-legend-empty { font-size: 12px; color: #8a99a5; font-style: italic; }',
      '.gb-annot-footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 18px;',
      '  border-top: 1px solid #eee; }',
      '.gb-annot-error { color: #a93226; font-size: 12px; margin-right: auto; }',
      '.gb-annot-btn { border: none; border-radius: 7px; padding: 10px 16px; font-weight: bold; font-size: 13px; cursor: pointer; }',
      '.gb-annot-btn-primary { background: #8B0000; color: #fff; }',
      '.gb-annot-btn-secondary { background: #7d8b94; color: #fff; }',
      '.gb-annot-btn:disabled { background: #aaa; cursor: not-allowed; }',
      '.gb-annot-pdf-note { font-size: 12px; color: #8a99a5; margin-top: 8px; }',
      '.gb-annot-lock-badge { font-size: 11px; font-weight: bold; color: #7d6608; background: #fcf3cf;',
      '  border: 1px solid #f7dc6f; border-radius: 10px; padding: 2px 8px; vertical-align: middle; margin-left: 6px; }',
      '.gb-annot-locked-note { font-size: 12px; color: #7d6608; background: #fcf3cf; border: 1px solid #f7dc6f;',
      '  border-radius: 6px; padding: 8px 10px; margin-top: 10px; }',
      '.gb-annot-btn-lock { background: #7d6608; color: #fff; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'annot-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function hexToRgba(hex, alpha) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return 'rgba(0,0,0,' + alpha + ')';
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function clampFraction(value) {
    return Math.max(0, Math.min(1, value));
  }

  // Turns two drag corners (fractions 0..1) into a clamped, minimum-size
  // annotation rect, or null if the drag was a stray click (no real box).
  function finalizeDrawnBox(x0, y0, x1, y1) {
    var x = Math.min(x0, x1);
    var y = Math.min(y0, y1);
    var w = Math.abs(x1 - x0);
    var h = Math.abs(y1 - y0);
    if (w < STRAY_CLICK_THRESHOLD && h < STRAY_CLICK_THRESHOLD) return null;
    w = Math.max(w, MIN_BOX_SIZE);
    h = Math.max(h, MIN_BOX_SIZE);
    x = clampFraction(Math.min(x, 1 - w));
    y = clampFraction(Math.min(y, 1 - h));
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    return { x: x, y: y, w: w, h: h };
  }

  // Re-clamps a persisted annotation the same way, in case it was ever
  // stored slightly out of bounds by an older version of this component.
  function normalizeAnnotation(a) {
    var x = clampFraction(Number(a.x) || 0);
    var y = clampFraction(Number(a.y) || 0);
    var w = Math.max(MIN_BOX_SIZE, Math.min(Number(a.w) || 0, 1));
    var h = Math.max(MIN_BOX_SIZE, Math.min(Number(a.h) || 0, 1));
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    return {
      id: a.id || generateId(),
      x: x, y: y, w: w, h: h,
      label: a.label || '',
      color: COLORS.indexOf(a.color) !== -1 ? a.color : COLORS[0],
      createdAt: a.createdAt || new Date().toISOString()
    };
  }

  function isAnnotatableUrl(name, url) {
    var candidate = (name || url || '').toLowerCase().split('?')[0];
    return !/\.pdf$/.test(candidate);
  }

  function open(opts) {
    opts = opts || {};
    ensureStyles();

    // Close any previously-open annotator instance before starting a new one.
    var existing = document.querySelector('.gb-annot-overlay');
    if (existing) existing.remove();

    var state = {
      title: opts.title || 'Receipt',
      imageUrl: opts.imageUrl || '',
      fileName: opts.fileName || '',
      subtitle: opts.subtitle || '',
      annotations: (opts.annotations || []).map(normalizeAnnotation),
      // canEdit is the caller's permission; locked is the saved state of
      // these particular highlights; editable is the resulting live mode.
      // Locking exists so finished highlights can be reviewed without a
      // stray drag altering evidence - a viewer with edit rights must
      // deliberately unlock first.
      canEdit: !!opts.editable,
      locked: !!opts.locked,
      editable: !!opts.editable && !opts.locked,
      onSave: typeof opts.onSave === 'function' ? opts.onSave : null,
      activeColor: COLORS[0],
      highlightsVisible: true,
      imageLoaded: false,
      saving: false
    };

    var overlay = document.createElement('div');
    overlay.className = 'gb-annot-overlay';

    var modal = document.createElement('div');
    modal.className = 'gb-annot-modal';
    overlay.appendChild(modal);

    // ---- Header ----
    var header = document.createElement('div');
    header.className = 'gb-annot-header';
    header.innerHTML =
      '<div>' +
        '<h3 class="gb-annot-title">' + escapeHtml(state.title) +
          (state.locked ? ' <span class="gb-annot-lock-badge">\uD83D\uDD12 Locked</span>' : '') + '</h3>' +
        (state.subtitle ? '<div class="gb-annot-subtitle">' + escapeHtml(state.subtitle) + '</div>' : '') +
      '</div>' +
      '<button type="button" class="gb-annot-close" aria-label="Close">&times;</button>';
    modal.appendChild(header);
    header.querySelector('.gb-annot-close').addEventListener('click', function () { requestClose(); });

    // ---- Body ----
    var body = document.createElement('div');
    body.className = 'gb-annot-body';
    modal.appendChild(body);

    var stageWrap = document.createElement('div');
    stageWrap.className = 'gb-annot-stage-wrap';
    body.appendChild(stageWrap);

    var loadingEl = document.createElement('div');
    loadingEl.className = 'gb-annot-loading';
    loadingEl.textContent = 'Loading receipt…';
    stageWrap.appendChild(loadingEl);

    var stage = document.createElement('div');
    stage.className = 'gb-annot-stage' + (state.editable ? ' gb-annot-editable' : '');
    stage.style.display = 'none';
    stageWrap.appendChild(stage);

    var img = document.createElement('img');
    img.className = 'gb-annot-img';
    img.alt = state.title;
    stage.appendChild(img);

    var boxesLayer = document.createElement('div');
    boxesLayer.className = 'gb-annot-boxes';
    stage.appendChild(boxesLayer);

    var previewBox = document.createElement('div');
    previewBox.className = 'gb-annot-preview-box';
    stage.appendChild(previewBox);

    var toolbar = document.createElement('div');
    toolbar.className = 'gb-annot-toolbar';
    body.appendChild(toolbar);

    if (state.editable) {
      var swatches = document.createElement('div');
      swatches.className = 'gb-annot-swatches';
      COLORS.forEach(function (color) {
        var sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'gb-annot-swatch' + (color === state.activeColor ? ' gb-annot-swatch-active' : '');
        sw.style.background = color;
        sw.title = 'Highlight color';
        sw.addEventListener('click', function () {
          state.activeColor = color;
          swatches.querySelectorAll('.gb-annot-swatch').forEach(function (el) { el.classList.remove('gb-annot-swatch-active'); });
          sw.classList.add('gb-annot-swatch-active');
        });
        swatches.appendChild(sw);
      });
      toolbar.appendChild(swatches);
    }

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'gb-annot-toggle-btn';
    toggleBtn.textContent = 'Hide Highlights';
    toggleBtn.addEventListener('click', function () {
      state.highlightsVisible = !state.highlightsVisible;
      toggleBtn.textContent = state.highlightsVisible ? 'Hide Highlights' : 'Show Highlights';
      boxesLayer.classList.toggle('gb-annot-hidden-boxes', !state.highlightsVisible);
    });
    toolbar.appendChild(toggleBtn);

    if (state.imageUrl) {
      var openOriginal = document.createElement('a');
      openOriginal.className = 'gb-annot-link-btn';
      openOriginal.textContent = 'Open Original in New Tab';
      openOriginal.href = state.imageUrl;
      openOriginal.target = '_blank';
      openOriginal.rel = 'noopener noreferrer';
      toolbar.appendChild(openOriginal);
    }

    if (state.editable) {
      var hint = document.createElement('div');
      hint.className = 'gb-annot-hint';
      hint.textContent = 'Drag on the receipt to draw a highlight box, then label it below.';
      body.appendChild(hint);
    }

    if (state.locked) {
      var lockedNote = document.createElement('div');
      lockedNote.className = 'gb-annot-locked-note';
      lockedNote.textContent = state.canEdit
        ? 'These highlights are locked. Unlock below to change them.'
        : 'These highlights are locked and final.';
      body.appendChild(lockedNote);
    }

    var legendWrap = document.createElement('div');
    legendWrap.className = 'gb-annot-legend';
    body.appendChild(legendWrap);

    // ---- Footer ----
    var footer = document.createElement('div');
    footer.className = 'gb-annot-footer';
    modal.appendChild(footer);

    var errorEl = document.createElement('div');
    errorEl.className = 'gb-annot-error';
    footer.appendChild(errorEl);

    var saveBtn = null;
    var lockBtn = null;
    var unlockBtn = null;
    if (state.editable) {
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'gb-annot-btn gb-annot-btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () { requestClose(); });
      footer.appendChild(cancelBtn);

      saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'gb-annot-btn gb-annot-btn-primary';
      saveBtn.textContent = 'Save Highlights';
      saveBtn.addEventListener('click', function () { handleSave(false); });
      footer.appendChild(saveBtn);

      lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'gb-annot-btn gb-annot-btn-lock';
      lockBtn.textContent = '\uD83D\uDD12 Save & Lock';
      lockBtn.title = 'Save these highlights and lock them against further edits';
      lockBtn.addEventListener('click', function () { handleSave(true); });
      footer.appendChild(lockBtn);
    } else if (state.canEdit && state.locked) {
      var closeLockedBtn = document.createElement('button');
      closeLockedBtn.type = 'button';
      closeLockedBtn.className = 'gb-annot-btn gb-annot-btn-secondary';
      closeLockedBtn.textContent = 'Close';
      closeLockedBtn.addEventListener('click', function () { close(); });
      footer.appendChild(closeLockedBtn);

      unlockBtn = document.createElement('button');
      unlockBtn.type = 'button';
      unlockBtn.className = 'gb-annot-btn gb-annot-btn-primary';
      unlockBtn.textContent = '\uD83D\uDD13 Unlock to Edit';
      unlockBtn.addEventListener('click', handleUnlock);
      footer.appendChild(unlockBtn);
    } else {
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'gb-annot-btn gb-annot-btn-secondary';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', function () { close(); });
      footer.appendChild(closeBtn);
    }

    // ---- Rendering ----
    function renderBoxes() {
      boxesLayer.innerHTML = '';
      state.annotations.forEach(function (a, index) {
        var box = document.createElement('div');
        box.className = 'gb-annot-box';
        box.dataset.annotId = a.id;
        box.style.left = (a.x * 100) + '%';
        box.style.top = (a.y * 100) + '%';
        box.style.width = (a.w * 100) + '%';
        box.style.height = (a.h * 100) + '%';
        box.style.borderColor = a.color;
        box.style.background = hexToRgba(a.color, 0.22);
        var badge = document.createElement('span');
        badge.className = 'gb-annot-badge';
        badge.style.background = a.color;
        badge.textContent = String(index + 1);
        box.appendChild(badge);
        boxesLayer.appendChild(box);
      });
      boxesLayer.classList.toggle('gb-annot-hidden-boxes', !state.highlightsVisible);
    }

    function pulseBox(id) {
      var box = boxesLayer.querySelector('[data-annot-id="' + cssEscape(id) + '"]');
      if (!box) return;
      box.classList.remove('gb-annot-pulse');
      // Force reflow so the animation can restart if already pulsing.
      void box.offsetWidth;
      box.classList.add('gb-annot-pulse');
    }

    function cssEscape(value) {
      return String(value).replace(/["\\]/g, '\\$&');
    }

    function renderLegend() {
      legendWrap.innerHTML = '';
      var titleEl = document.createElement('div');
      titleEl.className = 'gb-annot-legend-title';
      titleEl.textContent = 'Highlights (' + state.annotations.length + ')';
      legendWrap.appendChild(titleEl);

      if (!state.annotations.length) {
        var empty = document.createElement('div');
        empty.className = 'gb-annot-legend-empty';
        empty.textContent = state.editable
          ? 'No highlights yet — drag on the receipt above to add one.'
          : 'No highlights on this receipt.';
        legendWrap.appendChild(empty);
        return;
      }

      state.annotations.forEach(function (a, index) {
        var row = document.createElement('div');
        row.className = 'gb-annot-legend-row';
        row.dataset.annotId = a.id;

        var num = document.createElement('span');
        num.className = 'gb-annot-legend-num';
        num.style.background = a.color;
        num.textContent = String(index + 1);
        row.appendChild(num);

        if (state.editable) {
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'gb-annot-legend-input';
          input.placeholder = 'Describe this highlight…';
          input.value = a.label || '';
          input.addEventListener('click', function (e) { e.stopPropagation(); });
          input.addEventListener('input', function () { a.label = input.value; });
          row.appendChild(input);

          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'gb-annot-legend-del';
          del.textContent = '\u2715';
          del.title = 'Delete highlight';
          del.addEventListener('click', function (e) {
            e.stopPropagation();
            state.annotations = state.annotations.filter(function (item) { return item.id !== a.id; });
            renderBoxes();
            renderLegend();
          });
          row.appendChild(del);
        } else {
          var label = document.createElement('span');
          label.className = 'gb-annot-legend-label';
          label.textContent = a.label || '(no label)';
          row.appendChild(label);
        }

        row.addEventListener('mouseenter', function () { pulseBox(a.id); });
        row.addEventListener('click', function () { pulseBox(a.id); });
        legendWrap.appendChild(row);
      });
    }

    // ---- Drawing (mouse + touch) ----
    var dragStart = null;

    function fractionFromPoint(clientX, clientY) {
      var rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: 0, y: 0 };
      return {
        x: clampFraction((clientX - rect.left) / rect.width),
        y: clampFraction((clientY - rect.top) / rect.height)
      };
    }

    function showPreview(a, b) {
      var rect = finalizeDrawnBox(a.x, a.y, b.x, b.y) || { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      previewBox.style.display = 'block';
      previewBox.style.left = (rect.x * 100) + '%';
      previewBox.style.top = (rect.y * 100) + '%';
      previewBox.style.width = (rect.w * 100) + '%';
      previewBox.style.height = (rect.h * 100) + '%';
    }

    function endDrag(point) {
      if (!dragStart) return;
      previewBox.style.display = 'none';
      var rect = finalizeDrawnBox(dragStart.x, dragStart.y, point.x, point.y);
      dragStart = null;
      if (!rect) return; // stray click, drop silently
      var annotation = {
        id: generateId(),
        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
        label: '',
        color: state.activeColor,
        createdAt: new Date().toISOString()
      };
      state.annotations.push(annotation);
      renderBoxes();
      renderLegend();
      var newInput = legendWrap.querySelector('[data-annot-id="' + cssEscape(annotation.id) + '"] input');
      if (newInput) newInput.focus();
    }

    function onMouseDown(e) {
      if (!state.editable || !state.imageLoaded) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      dragStart = fractionFromPoint(e.clientX, e.clientY);
      showPreview(dragStart, dragStart);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
    function onMouseMove(e) {
      if (!dragStart) return;
      showPreview(dragStart, fractionFromPoint(e.clientX, e.clientY));
    }
    function onMouseUp(e) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!dragStart) return;
      endDrag(fractionFromPoint(e.clientX, e.clientY));
    }

    function onTouchStart(e) {
      if (!state.editable || !state.imageLoaded) return;
      if (!e.touches || !e.touches.length) return;
      e.preventDefault();
      var t = e.touches[0];
      dragStart = fractionFromPoint(t.clientX, t.clientY);
      showPreview(dragStart, dragStart);
    }
    function onTouchMove(e) {
      if (!dragStart) return;
      if (!e.touches || !e.touches.length) return;
      e.preventDefault();
      var t = e.touches[0];
      showPreview(dragStart, fractionFromPoint(t.clientX, t.clientY));
    }
    function onTouchEnd(e) {
      if (!dragStart) return;
      e.preventDefault();
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      var point = t ? fractionFromPoint(t.clientX, t.clientY) : dragStart;
      endDrag(point);
    }

    if (state.editable) {
      stage.addEventListener('mousedown', onMouseDown);
      stage.addEventListener('touchstart', onTouchStart, { passive: false });
      stage.addEventListener('touchmove', onTouchMove, { passive: false });
      stage.addEventListener('touchend', onTouchEnd, { passive: false });
      stage.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    // ---- Save ----
    function cleanedAnnotations() {
      var cleaned = [];
      state.annotations.forEach(function (a) {
        var rect = finalizeDrawnBox(a.x, a.y, a.x + a.w, a.y + a.h);
        if (!rect) return;
        cleaned.push({
          id: a.id,
          x: rect.x, y: rect.y, w: rect.w, h: rect.h,
          label: a.label || '',
          color: a.color,
          createdAt: a.createdAt || new Date().toISOString()
        });
      });
      return cleaned;
    }

    // lockAfter is passed through to the caller as the second onSave
    // argument, so persisting the highlights and persisting their locked
    // state are always one write - they can never drift apart.
    function handleSave(lockAfter) {
      if (state.saving || !state.onSave) return;
      var cleaned = cleanedAnnotations();
      state.saving = true;
      errorEl.textContent = '';
      if (saveBtn) saveBtn.disabled = true;
      if (lockBtn) lockBtn.disabled = true;
      var busyBtn = lockAfter ? lockBtn : saveBtn;
      var busyLabel = busyBtn ? busyBtn.textContent : '';
      if (busyBtn) busyBtn.textContent = 'Saving…';
      Promise.resolve()
        .then(function () { return state.onSave(cleaned, !!lockAfter); })
        .then(function () {
          close();
        })
        .catch(function (error) {
          state.saving = false;
          if (saveBtn) saveBtn.disabled = false;
          if (lockBtn) lockBtn.disabled = false;
          if (busyBtn) busyBtn.textContent = busyLabel;
          errorEl.textContent = (error && error.message) ? error.message : 'Unable to save highlights. Please try again.';
        });
    }

    // Unlocking persists the unlock immediately (highlights unchanged) and
    // reopens in edit mode, so the modal never sits in a half-locked state
    // where the buttons and the saved record disagree.
    function handleUnlock() {
      if (state.saving || !state.onSave) return;
      state.saving = true;
      errorEl.textContent = '';
      unlockBtn.disabled = true;
      unlockBtn.textContent = 'Unlocking…';
      var cleaned = cleanedAnnotations();
      Promise.resolve()
        .then(function () { return state.onSave(cleaned, false); })
        .then(function () {
          close();
          var reopened = {};
          for (var k in opts) { if (Object.prototype.hasOwnProperty.call(opts, k)) reopened[k] = opts[k]; }
          reopened.annotations = cleaned;
          reopened.locked = false;
          open(reopened);
        })
        .catch(function (error) {
          state.saving = false;
          unlockBtn.disabled = false;
          unlockBtn.textContent = '\uD83D\uDD13 Unlock to Edit';
          errorEl.textContent = (error && error.message) ? error.message : 'Unable to unlock highlights. Please try again.';
        });
    }

    // ---- Close handling ----
    // Snapshot of the starting annotations (post-normalize) so Escape/×/
    // Cancel can tell whether the user actually changed anything before
    // discarding it - a stray Escape shouldn't silently throw away several
    // freshly-drawn, freshly-labelled boxes.
    function snapshotAnnotations(list) {
      return JSON.stringify(list.map(function (a) {
        return { x: a.x, y: a.y, w: a.w, h: a.h, label: a.label || '', color: a.color };
      }));
    }
    var initialSnapshot = snapshotAnnotations(state.annotations);

    function isDirty() {
      return state.editable && snapshotAnnotations(state.annotations) !== initialSnapshot;
    }

    function confirmDiscardIfDirty() {
      return !isDirty() || confirm('Discard unsaved highlights?');
    }

    function requestClose() {
      if (!confirmDiscardIfDirty()) return;
      close();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') requestClose();
    }

    function onBackdropClick(e) {
      if (e.target === overlay && !state.editable) close();
    }

    function close() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      overlay.remove();
    }

    document.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('mousedown', onBackdropClick);

    // ---- Image load ----
    img.addEventListener('load', function () {
      state.imageLoaded = true;
      loadingEl.style.display = 'none';
      stage.style.display = 'inline-block';
      renderBoxes();
      renderLegend();
    });
    img.addEventListener('error', function () {
      loadingEl.textContent = 'Unable to load this receipt image.';
    });
    img.src = state.imageUrl;

    // Render legend immediately (annotations may exist before image loads).
    renderLegend();

    document.body.appendChild(overlay);
  }

  window.GraceBooksAnnotator = {
    open: open,
    isAnnotatableUrl: isAnnotatableUrl
  };
})();
