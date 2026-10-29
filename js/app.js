'use strict';

/*
 * 圖片日曆 — 最小可用版本（階段 6）
 *   + 暗色模式、自訂捲軸、自訂檔案按鈕、預覽圖可點擊
 *   + 燈箱點擊放大 2.5 倍；放大後可滾動／滾輪查看
 *   + 修復：移除圖片後預覽確實消失、不再開啟空白燈箱
 * 依賴：store.js、query.js、lib/recurrence.js（可選）
 */

import { Store } from './store.js';
import { Query } from './query.js';

const $ = id => document.getElementById(id);
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const THEME_KEY = 'photo-calendar-theme';
const THEME_TRANSITION_MS = 350;
const LIGHTBOX_ZOOM_FACTOR = 2.5;

let currentDate = new Date();
let eventsInRange = [];
let editingEventId = null;
let pendingImageBlob = null;
let currentEventHasImage = false;
let imageUrlCache = new Map();
let themeTransitionTimer = null;
let previewObjectUrl = null;

/* ========================= 啟動 ========================= */
(async () => {
  initTheme();
  await Store.open();
  $('weekdayRow').innerHTML = WEEKDAYS.map(d => `<div>${d}</div>`).join('');
  bindNav();
  bindDialog();
  await refresh();
})().catch(err => {
  console.warn('圖片日曆初始化失敗：', err);
  document.body.insertAdjacentHTML('beforeend',
    `<div style="position:fixed;bottom:16px;left:16px;background:#fee;color:#a00;padding:12px;border-radius:8px;font-size:13px">
      初始化失敗，請重新整理。詳見 console。
    </div>`);
});

/* ========================= 主題 ========================= */
function applyTheme(theme, { animate = true } = {}) {
  const root = document.documentElement;
  const changing = root.getAttribute('data-theme') !== theme;

  if (animate && changing) {
    root.classList.add('theme-transition');
    clearTimeout(themeTransitionTimer);
    themeTransitionTimer = setTimeout(() => {
      root.classList.remove('theme-transition');
    }, THEME_TRANSITION_MS);
  }

  root.setAttribute('data-theme', theme);

  const btn = $('btnTheme');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? '切換為淺色模式' : '切換為深色模式');
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'), { animate: false });

  $('btnTheme')?.addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme');
    const next = curr === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}

/* ========================= 導覽 ========================= */
function bindNav() {
  $('btnPrev').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); refresh(); });
  $('btnNext').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); refresh(); });
  $('btnToday').addEventListener('click', () => { currentDate = new Date(); refresh(); });
}

/* ========================= 重繪 ========================= */
async function refresh() {
  updateNavTitle();
  const gridStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + 41);
  gridEnd.setHours(23, 59, 59, 999);

  eventsInRange = await Query.getEventsInRange(gridStart, gridEnd);
  await renderMonth(gridStart, gridEnd);
}

function updateNavTitle() {
  $('navTitle').textContent = `${currentDate.getFullYear()}年${MONTHS[currentDate.getMonth()]}`;
}

async function renderMonth(gridStart, gridEnd) {
  const grid = $('monthGrid');
  grid.innerHTML = '';

  const byDay = new Map();
  for (const ev of eventsInRange) {
    const key = dateKey(new Date(ev.start));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(ev);
  }

  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(cursor);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (cellDate.getMonth() !== currentDate.getMonth()) cell.classList.add('other-month');
    if (isToday(cellDate)) cell.classList.add('today');

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = cellDate.getDate();
    cell.appendChild(num);

    const dayEvents = byDay.get(dateKey(cellDate)) || [];
    for (const ev of dayEvents.slice(0, 3)) {
      cell.appendChild(await createEventChip(ev));
    }
    if (dayEvents.length > 3) {
      const more = document.createElement('div');
      more.style.fontSize = '10px';
      more.style.color = 'var(--text-muted)';
      more.textContent = `+${dayEvents.length - 3} 更多`;
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => openNewEvent(cellDate));
    grid.appendChild(cell);
    cursor.setDate(cursor.getDate() + 1);
  }
}

async function createEventChip(ev) {
  const chip = document.createElement('div');
  chip.className = 'event-chip';
  chip.title = ev.title || '未命名事件';

  if (ev.imageId) {
    const url = await getImageUrl(ev.imageId);
    if (url) {
      const img = document.createElement('img');
      img.className = 'chip-thumb';
      img.src = url;
      img.alt = '';
      chip.appendChild(img);
      img.addEventListener('click', async e => {
        e.stopPropagation();
        const full = await getImageUrl(ev.imageId);
        if (full) openLightbox(full);
      });
    }
  }

  const title = document.createElement('span');
  title.className = 'chip-title';
  title.textContent = ev.title || '未命名事件';
  chip.appendChild(title);

  chip.addEventListener('click', e => {
    e.stopPropagation();
    openEditEvent(ev.id);
  });

  return chip;
}

/* ========================= 事件對話框 ========================= */
function bindDialog() {
  const dlg = $('eventDialog');

  $('evAllDay').addEventListener('change', e => {
    $('timeFields').hidden = e.target.checked;
  });

  $('evImage').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    pendingImageBlob = await Store.makeThumbnail(file, 800);
    showImagePreview(URL.createObjectURL(pendingImageBlob), { isTemp: true });
    updateFileTriggerText();
  });

  // 移除圖片：清空 src + 隱藏預覽 + 釋放臨時 URL
  $('btnRemoveImage').addEventListener('click', () => {
    pendingImageBlob = null;
    $('evImage').value = '';
    $('imagePreviewImg').removeAttribute('src');
    $('imagePreview').hidden = true;
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    updateFileTriggerText();
  });

  // 點擊預覽圖放大：用 getAttribute 讀取，避免 src 為空時誤觸
  $('imagePreviewImg').addEventListener('click', () => {
    const src = $('imagePreviewImg').getAttribute('src');
    if (src) openLightbox(src);
  });

  $('btnCancelEvent').addEventListener('click', () => dlg.close());
  $('btnSaveEvent').addEventListener('click', e => {
    e.preventDefault();
    saveEvent();
  });
  $('btnDeleteEvent').addEventListener('click', () => {
    if (editingEventId) deleteEvent(editingEventId);
  });
  $('eventForm').addEventListener('submit', e => e.preventDefault());

  /* ---- 燈箱 ---- */
  $('btnCloseLightbox').addEventListener('click', closeLightbox);

  $('lightboxScroll').addEventListener('click', e => {
    if (e.target === $('lightboxScroll')) closeLightbox();
  });

  $('lightboxImg').addEventListener('click', e => {
    e.stopPropagation();
    toggleLightboxZoom();
  });

  $('lightbox').addEventListener('close', () => {
    resetLightboxZoom();
  });
}

function openNewEvent(date) {
  editingEventId = null;
  pendingImageBlob = null;
  currentEventHasImage = false;
  $('eventDialogTitle').textContent = '新增事件';
  $('btnDeleteEvent').hidden = true;
  $('eventForm').reset();
  $('evDate').value = dateKey(date);
  $('evAllDay').checked = true;
  $('timeFields').hidden = true;
  $('imagePreview').hidden = true;
  $('imagePreviewImg').removeAttribute('src');
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  updateFileTriggerText();
  $('eventDialog').showModal();
}

async function openEditEvent(id) {
  const ev = await Store.getEvent(id);
  if (!ev) return;
  editingEventId = id;
  pendingImageBlob = null;
  currentEventHasImage = !!ev.imageId;
  $('eventDialogTitle').textContent = '編輯事件';
  $('btnDeleteEvent').hidden = false;
  $('evTitle').value = ev.title || '';
  $('evDate').value = (ev.start || '').slice(0, 10);
  $('evAllDay').checked = !!ev.allDay;
  $('timeFields').hidden = !!ev.allDay;
  if (!ev.allDay) {
    $('evStartTime').value = timePart(ev.start);
    $('evEndTime').value = timePart(ev.end);
  }
  $('evDescription').value = ev.description || '';
  $('evImage').value = '';
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  if (ev.imageId) {
    const url = await getImageUrl(ev.imageId);
    showImagePreview(url);
  } else {
    // 無圖片：清掉舊 src 並隱藏，避免殘留
    $('imagePreviewImg').removeAttribute('src');
    $('imagePreview').hidden = true;
  }
  updateFileTriggerText();
  $('eventDialog').showModal();
}

function showImagePreview(url, { isTemp = false } = {}) {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  $('imagePreviewImg').src = url;
  $('imagePreview').hidden = false;
  if (isTemp) previewObjectUrl = url;
}

function updateFileTriggerText() {
  const text = $('fileTriggerText');
  if (!text) return;
  if (pendingImageBlob) {
    const file = $('evImage').files[0];
    text.textContent = file ? `已選擇：${file.name}` : '已選擇圖片';
  } else if (currentEventHasImage) {
    text.textContent = '更換圖片';
  } else {
    text.textContent = '選擇圖片';
  }
}

async function saveEvent() {
  const title = $('evTitle').value.trim();
  if (!title) { $('evTitle').focus(); return; }

  const dateStr = $('evDate').value;
  if (!dateStr) { $('evDate').focus(); return; }

  const allDay = $('evAllDay').checked;
  let start, end;
  if (allDay) {
    start = `${dateStr}T00:00:00`;
    end = `${dateStr}T23:59:59`;
  } else {
    const st = $('evStartTime').value || '09:00';
    const et = $('evEndTime').value || '10:00';
    if (et <= st) { alert('結束時間必須晚於開始時間'); return; }
    start = `${dateStr}T${st}:00`;
    end = `${dateStr}T${et}:00`;
  }

  const oldEv = editingEventId ? await Store.getEvent(editingEventId) : null;

  let imageId = oldEv?.imageId || null;
  if (pendingImageBlob) {
    imageId = await Store.saveImage(pendingImageBlob);
    if (oldEv?.imageId && oldEv.imageId !== imageId) {
      await Store.deleteImage(oldEv.imageId);
      revokeImageUrl(oldEv.imageId);
    }
  } else if (oldEv?.imageId && $('imagePreview').hidden) {
    await Store.deleteImage(oldEv.imageId);
    revokeImageUrl(oldEv.imageId);
    imageId = null;
  }

  const ev = {
    id: editingEventId || undefined,
    title,
    start,
    end,
    allDay,
    description: $('evDescription').value.trim(),
    imageId,
    recurrence: oldEv?.recurrence || '',
    created: oldEv?.created,
  };

  await Store.saveEvent(ev);
  $('eventDialog').close();
  await refresh();
}

async function deleteEvent(id) {
  const ev = await Store.getEvent(id);
  if (!ev) return;
  if (!confirm(`刪除「${ev.title || '未命名事件'}」？`)) return;
  if (ev.imageId) {
    await Store.deleteImage(ev.imageId);
    revokeImageUrl(ev.imageId);
  }
  await Store.deleteEvent(id);
  $('eventDialog').close();
  await refresh();
}

/* ========================= 燈箱 ========================= */
function openLightbox(url) {
  if (!url) return;   // 空 src 不開燈箱
  const img = $('lightboxImg');
  img.src = url;
  resetLightboxZoom();
  $('lightbox').showModal();
}

function closeLightbox() {
  $('lightbox').close();
}

function toggleLightboxZoom() {
  const img = $('lightboxImg');
  const scroll = $('lightboxScroll');

  if (img.classList.contains('zoomed')) {
    resetLightboxZoom();
    scroll.scrollTop = 0;
    scroll.scrollLeft = 0;
    return;
  }

  const fitW = img.clientWidth;
  const fitH = img.clientHeight;

  if (!fitW || !fitH) {
    img.addEventListener('load', () => toggleLightboxZoom(), { once: true });
    return;
  }

  img.classList.add('zoomed');
  img.style.width = Math.round(fitW * LIGHTBOX_ZOOM_FACTOR) + 'px';
  img.style.height = Math.round(fitH * LIGHTBOX_ZOOM_FACTOR) + 'px';
}

function resetLightboxZoom() {
  const img = $('lightboxImg');
  if (!img) return;
  img.classList.remove('zoomed');
  img.style.width = '';
  img.style.height = '';
}

/* ========================= 圖片 URL 快取 ========================= */
async function getImageUrl(imageId) {
  if (!imageId) return null;
  if (imageUrlCache.has(imageId)) return imageUrlCache.get(imageId);
  const blob = await Store.getImage(imageId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  imageUrlCache.set(imageId, url);
  return url;
}

function revokeImageUrl(imageId) {
  const url = imageUrlCache.get(imageId);
  if (url) {
    URL.revokeObjectURL(url);
    imageUrlCache.delete(imageId);
  }
}

/* ========================= 工具 ========================= */
function dateKey(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() &&
         d.getMonth() === t.getMonth() &&
         d.getDate() === t.getDate();
}

function timePart(iso) {
  const m = String(iso || '').match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '09:00';
}