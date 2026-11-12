const menuToggle = document.querySelector('.menu-toggle');
const menuPanel = document.querySelector('#site-menu');

function setMenuOpen(open) {
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  menuPanel.hidden = !open;
}

menuToggle.addEventListener('click', () => {
  setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
});

menuPanel.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    setMenuOpen(false);
    menuToggle.focus();
  }
});

document.addEventListener('pointerdown', (event) => {
  if (menuToggle.getAttribute('aria-expanded') !== 'true') return;
  if (menuPanel.contains(event.target) || menuToggle.contains(event.target)) return;
  setMenuOpen(false);
});


const storesViewport = document.querySelector('[data-stores-viewport]');
if (storesViewport) {
  const storesSection = storesViewport.closest('.stores');
  const storesButtons = [...storesSection.querySelectorAll('[data-stores-direction]')];
  const updateStoresButtons = () => {
    const maxScroll = storesViewport.scrollWidth - storesViewport.clientWidth;
    storesButtons.forEach((button) => {
      const direction = Number(button.dataset.storesDirection);
      button.disabled = maxScroll <= 2 || (direction < 0 ? storesViewport.scrollLeft <= 2 : storesViewport.scrollLeft >= maxScroll - 2);
    });
  };
  storesButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const firstCard = storesViewport.querySelector('.store-card');
      const gap = Number.parseFloat(getComputedStyle(storesViewport.querySelector('.stores__track')).gap) || 0;
      storesViewport.scrollBy({ left: Number(button.dataset.storesDirection) * ((firstCard?.getBoundingClientRect().width || 280) + gap), behavior: 'smooth' });
    });
  });
  storesViewport.addEventListener('scroll', updateStoresButtons, { passive: true });
  window.addEventListener('resize', updateStoresButtons);
  updateStoresButtons();

  let dragStartX = 0;
  let dragStartScroll = 0;
  storesViewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    dragStartX = event.clientX;
    dragStartScroll = storesViewport.scrollLeft;
    storesViewport.setPointerCapture(event.pointerId);
  });
  storesViewport.addEventListener('pointermove', (event) => {
    if (!storesViewport.hasPointerCapture(event.pointerId)) return;
    storesViewport.scrollLeft = dragStartScroll - (event.clientX - dragStartX);
  });
}

const copyAddressButton = document.querySelector('#copy-address');
if (copyAddressButton) {
  const addressToCopy = 'Санкт-Петербург, Варшавская улица, 3, корпус 1';
  const copyStatus = document.querySelector('#copy-address-status');
  copyAddressButton.addEventListener('click', async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(addressToCopy);
      } else {
        const temporaryField = document.createElement('textarea');
        temporaryField.value = addressToCopy;
        temporaryField.setAttribute('readonly', '');
        temporaryField.style.position = 'fixed';
        temporaryField.style.opacity = '0';
        document.body.append(temporaryField);
        temporaryField.select();
        const copied = document.execCommand('copy');
        temporaryField.remove();
        if (!copied) throw new Error('Clipboard unavailable');
      }
      copyStatus.textContent = 'Адрес скопирован';
    } catch {
      copyStatus.textContent = 'Не удалось скопировать адрес';
    }
  });
}
(() => {
  const page = document.querySelector('[data-scheme]');
  if (!page) return;

  const panel = page.querySelector('[data-map-panel]');
  const viewport = page.querySelector('[data-map-viewport]');
  const canvas = page.querySelector('[data-map-canvas]');
  const tabs = [...page.querySelectorAll('[data-floor]')];
  const corpusButtons = [...page.querySelectorAll('[data-corpus]')];
  const focusButtons = [...page.querySelectorAll('[data-map-focus]')];
  const download = page.querySelector('[data-plan-download]');
  const downloadLabel = page.querySelector('[data-download-label]');
  const floorChip = page.querySelector('[data-floor-chip]');
  const status = page.querySelector('[data-map-status]');
  const homeButtons = [...page.querySelectorAll('[data-map-home], [data-map-reset]')];
  const zoomButtons = [...page.querySelectorAll('[data-map-zoom]')];
  const fullscreenButton = page.querySelector('[data-map-fullscreen]');
  const board = page.querySelector('.scheme-board');

  const floors = {
    1: '/assets/floor-1.svg',
    2: '/assets/floor-2.svg',
    3: '/assets/floor-3.svg',
    4: '/assets/floor-4.svg'
  };
  const corpusViews = {
    4: [0, 360, 3012, 1962],
    3: [512, 360, 3012, 1962],
    2: [1024, 360, 3012, 1962],
    1: [1024, 0, 3012, 1962]
  };
  const markerNames = { entry: 'Входы', stairs: 'Лестницы', lift: 'Лифты', escalator: 'Эскалаторы', wc: 'Санузлы' };
  let floor = 1;
  let root = null;
  let infrastructure = null;
  let baseBox = [0, 0, 4036, 2629.65];
  let viewBox = [...baseBox];
  let activeCorpus = 'all';
  let currentMarker = null;
  let pointerStart = null;
  let pinchStart = null;
  const activePointers = new Map();
  const markerOffsets = Object.create(null);

  const writeBox = (box) => {
    if (!root) return;
    viewBox = box.map(Number);
    root.setAttribute('viewBox', viewBox.map((value) => Number(value.toFixed(2))).join(' '));
    viewport.classList.toggle('is-zoomed', viewBox[2] < baseBox[2] - 1);
    updateStatus();
  };

  const constrainBox = (box) => {
    const width = Math.min(baseBox[2], Math.max(baseBox[2] / 12, box[2]));
    const height = width * baseBox[3] / baseBox[2];
    const x = Math.min(baseBox[0] + baseBox[2] - width, Math.max(baseBox[0], box[0]));
    const y = Math.min(baseBox[1] + baseBox[3] - height, Math.max(baseBox[1], box[1]));
    return [x, y, width, height];
  };

  const updateStatus = () => {
    if (!status) return;
    const zoom = Math.round(baseBox[2] / viewBox[2] * 100);
    const place = activeCorpus === 'all' ? 'Все корпуса' : 'Корпус ' + activeCorpus;
    status.textContent = floor + ' этаж · ' + place + ' · ' + zoom + '%';
    floorChip.textContent = floor + ' этаж';
  };

  const setCorpusButtons = (value) => {
    activeCorpus = value;
    corpusButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.corpus === value)));
    const oldHighlight = root?.querySelector('#scheme-corpus-highlight');
    if (oldHighlight) oldHighlight.remove();
    if (root && value !== 'all') {
      const bounds = {
        4: [121, 828, 1084, 1631],
        3: [1205, 828, 790, 1631],
        2: [1995, 828, 1076, 1631],
        1: [3071, 124, 868, 2335]
      }[value];
      if (bounds && infrastructure) {
        const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        overlay.setAttribute('id', 'scheme-corpus-highlight');
        overlay.setAttribute('class', 'scheme-corpus-highlight');
        overlay.setAttribute('x', bounds[0]);
        overlay.setAttribute('y', bounds[1]);
        overlay.setAttribute('width', bounds[2]);
        overlay.setAttribute('height', bounds[3]);
        root.insertBefore(overlay, infrastructure);
      }
    }
  };

  const selectCorpus = (value) => {
    setCorpusButtons(value);
    currentMarker?.classList.remove('is-current');
    currentMarker = null;
    focusButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
    writeBox(value === 'all' ? [...baseBox] : constrainBox(corpusViews[value] || [...baseBox]));
  };

  const focusMarker = (marker) => {
    if (!root || !marker) return;
    currentMarker?.classList.remove('is-current');
    currentMarker = marker;
    marker.classList.add('is-current');
    const bounds = marker.getBBox();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const width = baseBox[2] / 4.2;
    const height = width * baseBox[3] / baseBox[2];
    setCorpusButtons('all');
    writeBox(constrainBox([centerX - width / 2, centerY - height / 2, width, height]));
    focusButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mapFocus === marker.dataset.mapCategory)));
  };

  const focusNextMarker = (category) => {
    if (!infrastructure) return;
    const markers = [...infrastructure.querySelectorAll('[data-map-marker="' + category + '"]')];
    if (!markers.length) return;
    let index = markerOffsets[category] || 0;
    if (currentMarker && currentMarker.dataset.mapCategory === category) {
      index = (markers.indexOf(currentMarker) + 1) % markers.length;
    }
    markerOffsets[category] = (index + 1) % markers.length;
    focusMarker(markers[index]);
  };

  const updateLegend = () => {
    focusButtons.forEach((button) => {
      const count = infrastructure ? infrastructure.querySelectorAll('[data-map-marker="' + button.dataset.mapFocus + '"]').length : 0;
      button.disabled = count === 0;
      button.setAttribute('aria-label', markerNames[button.dataset.mapFocus] + (count ? ', объектов на этаже: ' + count : ', на этом этаже нет'));
      button.setAttribute('aria-pressed', String(currentMarker?.dataset.mapCategory === button.dataset.mapFocus));
    });
  };

  const loadFloor = async (nextFloor) => {
    floor = Number(nextFloor);
    activeCorpus = 'all';
    currentMarker = null;
    tabs.forEach((tab) => tab.setAttribute('aria-selected', String(Number(tab.dataset.floor) === floor)));
    panel.setAttribute('aria-labelledby', 'scheme-floor-' + floor);
    download.href = floors[floor];
    download.download = 'mebelny-kontinent-floor-' + floor + '.svg';
    downloadLabel.textContent = 'Скачать ' + floor + ' этаж';
    floorChip.textContent = floor + ' этаж';
    corpusButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.corpus === 'all')));
    focusButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));

    canvas.setAttribute('aria-busy', 'true');
    page.classList.add('is-loading-map');
    try {
      const response = await fetch(floors[floor]);
      if (!response.ok) throw new Error('План не загрузился');
      const text = await response.text();
      const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
      if (parsed.querySelector('parsererror')) throw new Error('Повреждён SVG план');
      const svg = parsed.documentElement;
      svg.querySelectorAll('script, foreignObject').forEach((node) => node.remove());
      svg.querySelectorAll('*').forEach((node) => {
        [...node.attributes].forEach((attribute) => {
          if (attribute.name.toLowerCase().startsWith('on')) node.removeAttribute(attribute.name);
        });
      });
      const imported = document.importNode(svg, true);
      imported.setAttribute('class', 'scheme-map-svg');
      imported.setAttribute('role', 'group');
      imported.setAttribute('aria-label', 'Схема ' + floor + ' этажа. Выберите обозначение, чтобы приблизить его.');
      imported.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      canvas.replaceChildren(imported);
      root = imported;
      const rawBox = (root.getAttribute('viewBox') || '0 0 4036 2629.65').trim().split(/[ ,]+/).map(Number);
      baseBox = rawBox.length === 4 && rawBox.every(Number.isFinite) ? rawBox : [0, 0, 4036, 2629.65];
      viewBox = [...baseBox];
      infrastructure = root.querySelector('#infrastructure-floor-' + floor);
      if (infrastructure) {
        [...infrastructure.children].forEach((marker) => {
          const match = marker.id.match(/^f\d+-(stairs|lift|escalator|wc|entry)-/);
          if (!match) return;
          const title = marker.querySelector('title')?.textContent?.trim() || markerNames[match[1]];
          marker.dataset.mapMarker = match[1];
          marker.dataset.mapCategory = match[1];
          marker.setAttribute('role', 'button');
          marker.setAttribute('tabindex', '0');
          marker.setAttribute('aria-label', title);
          marker.classList.add('scheme-map-marker');
        });
        infrastructure.addEventListener('click', (event) => {
          const marker = event.target.closest('[data-map-marker]');
          if (marker) focusMarker(marker);
        });
        infrastructure.addEventListener('keydown', (event) => {
          const marker = event.target.closest('[data-map-marker]');
          if (marker && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            focusMarker(marker);
          }
        });
      }
      setCorpusButtons('all');
      writeBox([...baseBox]);
      updateLegend();
    } catch (error) {
      canvas.innerHTML = '<p class="scheme-map__error">Не удалось открыть план. Его можно сохранить по ссылке «Скачать».</p>';
      root = null;
      infrastructure = null;
      updateLegend();
    } finally {
      canvas.setAttribute('aria-busy', 'false');
      page.classList.remove('is-loading-map');
    }
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => loadFloor(tab.dataset.floor));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      tabs[next].focus();
      loadFloor(tabs[next].dataset.floor);
    });
  });

  corpusButtons.forEach((button) => button.addEventListener('click', () => selectCorpus(button.dataset.corpus)));
  focusButtons.forEach((button) => button.addEventListener('click', () => focusNextMarker(button.dataset.mapFocus)));
  homeButtons.forEach((button) => button.addEventListener('click', () => {
    currentMarker?.classList.remove('is-current');
    currentMarker = null;
    focusButtons.forEach((item) => item.setAttribute('aria-pressed', 'false'));
    setCorpusButtons('all');
    writeBox([...baseBox]);
    viewport.focus({ preventScroll: true });
  }));
  zoomButtons.forEach((button) => button.addEventListener('click', () => {
    if (!root) return;
    const factor = button.dataset.mapZoom === 'in' ? 0.82 : 1.22;
    const width = Math.min(baseBox[2], Math.max(baseBox[2] / 12, viewBox[2] * factor));
    const height = width * baseBox[3] / baseBox[2];
    writeBox(constrainBox([viewBox[0] + (viewBox[2] - width) / 2, viewBox[1] + (viewBox[3] - height) / 2, width, height]));
  }));

  viewport.addEventListener('wheel', (event) => {
    if (!root) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const factor = event.deltaY < 0 ? 0.88 : 1.14;
    const width = Math.min(baseBox[2], Math.max(baseBox[2] / 12, viewBox[2] * factor));
    const height = width * baseBox[3] / baseBox[2];
    const anchorX = viewBox[0] + viewBox[2] * px;
    const anchorY = viewBox[1] + viewBox[3] * py;
    writeBox(constrainBox([anchorX - width * px, anchorY - height * py, width, height]));
  }, { passive: false });

  viewport.addEventListener('pointerdown', (event) => {
    if (!root || event.button !== 0 || event.target.closest('[data-map-marker]')) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);
    if (activePointers.size > 1) {
      pointerStart = null;
      const points = [...activePointers.values()];
      const rect = viewport.getBoundingClientRect();
      const middleX = (points[0].x + points[1].x) / 2;
      const middleY = (points[0].y + points[1].y) / 2;
      pinchStart = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        box: [...viewBox],
        px: (middleX - rect.left) / rect.width,
        py: (middleY - rect.top) / rect.height
      };
    } else {
      pointerStart = { x: event.clientX, y: event.clientY, box: [...viewBox], id: event.pointerId };
      viewport.classList.add('is-dragging');
    }
  });
  viewport.addEventListener('pointermove', (event) => {
    if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchStart && activePointers.size > 1) {
      const points = [...activePointers.values()];
      const distance = Math.max(10, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      const width = Math.min(baseBox[2], Math.max(baseBox[2] / 12, pinchStart.box[2] * pinchStart.distance / distance));
      const height = width * baseBox[3] / baseBox[2];
      const anchorX = pinchStart.box[0] + pinchStart.box[2] * pinchStart.px;
      const anchorY = pinchStart.box[1] + pinchStart.box[3] * pinchStart.py;
      writeBox(constrainBox([anchorX - width * pinchStart.px, anchorY - height * pinchStart.py, width, height]));
      return;
    }
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const rect = viewport.getBoundingClientRect();
    const dx = (event.clientX - pointerStart.x) / rect.width * pointerStart.box[2];
    const dy = (event.clientY - pointerStart.y) / rect.height * pointerStart.box[3];
    writeBox(constrainBox([pointerStart.box[0] - dx, pointerStart.box[1] - dy, pointerStart.box[2], pointerStart.box[3]]));
  });
  const endDrag = (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinchStart = null;
    if (activePointers.size === 1) {
      const remaining = [...activePointers.entries()][0];
      pointerStart = { id: remaining[0], x: remaining[1].x, y: remaining[1].y, box: [...viewBox] };
    } else {
      pointerStart = null;
      viewport.classList.remove('is-dragging');
    }
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  viewport.addEventListener('keydown', (event) => {
    if (!root) return;
    if (event.key === 'Home') {
      event.preventDefault();
      selectCorpus('all');
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomButtons.find((button) => button.dataset.mapZoom === 'in').click();
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomButtons.find((button) => button.dataset.mapZoom === 'out').click();
      return;
    }
    const shifts = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (shifts[event.key]) {
      event.preventDefault();
      const step = viewBox[2] * 0.08;
      writeBox(constrainBox([viewBox[0] + shifts[event.key][0] * step, viewBox[1] + shifts[event.key][1] * step, viewBox[2], viewBox[3]]));
    }
  });

  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === board) await document.exitFullscreen();
      else await board.requestFullscreen();
    } catch {
      board.classList.toggle('is-expanded');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const expanded = document.fullscreenElement === board;
    fullscreenButton.setAttribute('aria-pressed', String(expanded));
    fullscreenButton.setAttribute('aria-label', expanded ? 'Свернуть схему' : 'Развернуть схему на весь экран');
  });

  loadFloor(1);
})();
