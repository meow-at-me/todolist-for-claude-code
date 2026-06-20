(function () {
  const vscode = acquireVsCodeApi();
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const newInput = document.getElementById('newInput');
  const sortSelect = document.getElementById('sortSelect');
  const sortLabel = document.getElementById('sortLabel');

  // English defaults; overridden by the 'strings' message from the extension
  // according to the VS Code display language.
  let STRINGS = {
    prioNone: '—',
    prioHigh: 'High',
    prioMed: 'Medium',
    prioLow: 'Low',
    catAdd: '+ category',
    catPlaceholder: 'category',
    tipDrag: 'Drag to reorder',
    tipEditText: 'Double-click to edit',
    tipEditCat: 'Click to edit category',
    tipDelete: 'Delete',
    tipPriority: 'Priority',
    sortLabel: 'Sort',
    sortManual: 'Manual',
    sortPriority: 'Priority',
    sortCategory: 'Category',
    sectionDone: 'Done',
  };

  // Persisted view state (survives reloads). 'manual' | 'priority' | 'category'
  const SORT_MODES = ['manual', 'priority', 'category'];
  const PRIORITY_RANK = { high: 0, med: 1, low: 2, none: 3 };
  let sortMode = (vscode.getState() && vscode.getState().sortMode) || 'manual';
  if (!SORT_MODES.includes(sortMode)) {
    sortMode = 'manual';
  }

  const PRIORITY_VALUES = ['none', 'high', 'med', 'low'];
  function prioLabel(value) {
    return {
      none: STRINGS.prioNone,
      high: STRINGS.prioHigh,
      med: STRINGS.prioMed,
      low: STRINGS.prioLow,
    }[value] || value;
  }

  let items = [];
  let dragId = null;

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg && msg.type === 'state') {
      items = Array.isArray(msg.items) ? msg.items : [];
      render();
    } else if (msg && msg.type === 'colors') {
      applyColors(msg.colors || {});
    } else if (msg && msg.type === 'strings') {
      STRINGS = Object.assign(STRINGS, msg.strings || {});
      buildSortUI();
      render();
    }
  });

  function buildSortUI() {
    sortLabel.textContent = STRINGS.sortLabel;
    const labels = {
      manual: STRINGS.sortManual,
      priority: STRINGS.sortPriority,
      category: STRINGS.sortCategory,
    };
    sortSelect.innerHTML = '';
    for (const mode of SORT_MODES) {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = labels[mode];
      if (mode === sortMode) {
        opt.selected = true;
      }
      sortSelect.appendChild(opt);
    }
  }

  sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value;
    vscode.setState(Object.assign({}, vscode.getState(), { sortMode }));
    render();
  });

  function sortedItems() {
    if (sortMode === 'manual') {
      return items;
    }
    // Stable sort over a copy, keyed by index to preserve original order on ties.
    return items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        let cmp = 0;
        if (sortMode === 'priority') {
          cmp = (PRIORITY_RANK[a.item.priority] ?? 3) - (PRIORITY_RANK[b.item.priority] ?? 3);
        } else if (sortMode === 'category') {
          const ca = a.item.category || '￿'; // uncategorized sorts last
          const cb = b.item.category || '￿';
          cmp = ca.localeCompare(cb);
        }
        return cmp !== 0 ? cmp : a.index - b.index;
      })
      .map((x) => x.item);
  }

  function applyColors(colors) {
    const root = document.documentElement;
    const set = (varName, value) => {
      if (value && String(value).trim()) {
        root.style.setProperty(varName, String(value).trim());
      } else {
        root.style.removeProperty(varName);
      }
    };
    set('--todo-high', colors.high);
    set('--todo-med', colors.med);
    set('--todo-low', colors.low);
    set('--todo-done-opacity', colors.done);
  }

  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = newInput.value.trim();
      if (text) {
        vscode.postMessage({ type: 'add', text });
        newInput.value = '';
      }
    }
  });

  function render() {
    listEl.innerHTML = '';
    emptyEl.hidden = items.length > 0;

    const sorted = sortedItems();
    const open = sorted.filter((i) => !i.done);
    const done = sorted.filter((i) => i.done);

    for (const item of open) {
      listEl.appendChild(renderItem(item));
    }
    if (open.length && done.length) {
      listEl.appendChild(renderDivider());
    }
    for (const item of done) {
      listEl.appendChild(renderItem(item));
    }
  }

  function renderDivider() {
    const li = document.createElement('li');
    li.className = 'divider';
    const span = document.createElement('span');
    span.textContent = STRINGS.sectionDone;
    li.appendChild(span);
    return li;
  }

  function renderItem(item) {
    const li = document.createElement('li');
    li.className = 'todo-item priority-' + (item.priority || 'none');
    if (item.done) {
      li.classList.add('done');
    }
    const manual = sortMode === 'manual';
    li.draggable = manual;
    li.dataset.id = item.id;

    // Drag handle (only meaningful in manual sort mode)
    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.textContent = '⋮⋮';
    if (manual) {
      handle.title = STRINGS.tipDrag;
    } else {
      handle.classList.add('handle-disabled');
    }
    li.appendChild(handle);

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'check';
    checkbox.checked = !!item.done;
    checkbox.addEventListener('change', () => {
      vscode.postMessage({ type: 'toggle', id: item.id });
    });
    li.appendChild(checkbox);

    // Main content (text + category)
    const main = document.createElement('div');
    main.className = 'main';

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = item.text;
    text.title = STRINGS.tipEditText;
    text.addEventListener('dblclick', () => startEdit(li, item, text));
    main.appendChild(text);

    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = item.category ? '@' + item.category : STRINGS.catAdd;
    if (!item.category) {
      cat.classList.add('cat-empty');
    }
    cat.title = STRINGS.tipEditCat;
    cat.addEventListener('click', () => startEditCategory(item, cat));
    main.appendChild(cat);

    li.appendChild(main);

    // Priority selector
    const prio = document.createElement('select');
    prio.className = 'prio';
    prio.title = STRINGS.tipPriority;
    for (const value of PRIORITY_VALUES) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = prioLabel(value);
      if ((item.priority || 'none') === value) {
        opt.selected = true;
      }
      prio.appendChild(opt);
    }
    prio.addEventListener('change', () => {
      vscode.postMessage({ type: 'setPriority', id: item.id, priority: prio.value });
    });
    li.appendChild(prio);

    // Delete button
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = STRINGS.tipDelete;
    del.addEventListener('click', () => {
      vscode.postMessage({ type: 'delete', id: item.id });
    });
    li.appendChild(del);

    // Drag & drop reordering
    li.addEventListener('dragstart', (e) => {
      dragId = item.id;
      li.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
      }
    });
    li.addEventListener('dragend', () => {
      dragId = null;
      li.classList.remove('dragging');
      document.querySelectorAll('.drop-before, .drop-after').forEach((el) => {
        el.classList.remove('drop-before', 'drop-after');
      });
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragId || dragId === item.id) {
        return;
      }
      const rect = li.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      li.classList.toggle('drop-before', before);
      li.classList.toggle('drop-after', !before);
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drop-before', 'drop-after');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragId || dragId === item.id) {
        return;
      }
      const rect = li.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      reorder(dragId, item.id, before);
    });

    return li;
  }

  function startEdit(li, item, textEl) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input';
    input.value = item.text;
    textEl.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) {
        return;
      }
      committed = true;
      const value = input.value.trim();
      if (value && value !== item.text) {
        vscode.postMessage({ type: 'edit', id: item.id, text: value });
      } else {
        render();
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        render();
      }
    });
    input.addEventListener('blur', commit);
  }

  function startEditCategory(item, catEl) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input cat-input';
    input.value = item.category || '';
    input.placeholder = STRINGS.catPlaceholder;
    catEl.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) {
        return;
      }
      committed = true;
      vscode.postMessage({ type: 'setCategory', id: item.id, category: input.value.trim() });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        render();
      }
    });
    input.addEventListener('blur', commit);
  }

  function reorder(sourceId, targetId, before) {
    // Build the new order from what's actually displayed (excludes the divider).
    const order = Array.from(listEl.querySelectorAll('.todo-item'))
      .map((li) => li.dataset.id)
      .filter((id) => id !== sourceId);
    const targetIdx = order.indexOf(targetId);
    const insertAt = before ? targetIdx : targetIdx + 1;
    order.splice(insertAt, 0, sourceId);
    vscode.postMessage({ type: 'reorder', order });
  }

  // Initial paint with default strings; refreshed when 'strings' arrives.
  buildSortUI();

  // Ask the extension for the initial state.
  vscode.postMessage({ type: 'ready' });
})();
