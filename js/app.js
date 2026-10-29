'use strict';

/*
 * 圖片日曆 — 最小可用版本（階段 6）
 * 依賴：store.js（IndexedDB + 圖片 Blob）、query.js（範圍查詢）、
 *       lib/recurrence.js（重複事件展開，可選）
 *
 * 本檔案只做 UI 與事件綁定，不直接碰 IndexedDB。
 */

import { Store } from './store.js';
import { Query } from './query.js';

const $ = id => document.getElementById(id);
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

let currentDate = new Date();
let eventsInRange = [];
let editingEventId = null;
let pendingImageBlob = null;   // 表單中尚未儲存的圖片
let imageUrlCache = new Map(); // imageId -> objectURL

/* ========================= 啟動 ========================= */
(async () => {
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
  gridEnd.setDate(gridEnd.getDate() + 41); // 6 週
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
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (cursor.getMonth() !== currentDate.getMonth()) cell.classList.add('other-month');
    if (isToday(cursor)) cell.classList.add('today');

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = cursor.getDate();
    cell.appendChild(num);

    const dayEvents = byDay.get(dateKey(cursor)) || [];
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
    const cellDate = new Date(cursor);   // ← 先快照
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

  // 有圖片的點縮圖開燈箱
  chip.querySelector('img')?.addEventListener('click', async e => {
    e.stopPropagation();
    const url = await getImageUrl(ev.imageId);
    if (url) openLightbox(url);
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
    showImagePreview(URL.createObjectURL(pendingImageBlob));
  });
  $('btnRemoveImage').addEventListener('click', () => {
    pendingImageBlob = null;
    $('evImage').value = '';
    $('imagePreview').hidden = true;
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

  // 燈箱
  $('btnCloseLightbox').addEventListener('click', () => $('lightbox').close());
  $('lightbox').addEventListener('click', e => {
    if (e.target === $('lightbox')) $('lightbox').close();
  });
}

function openNewEvent(date) {
  editingEventId = null;
  pendingImageBlob = null;
  $('eventDialogTitle').textContent = '新增事件';
  $('btnDeleteEvent').hidden = true;
  $('eventForm').reset();
  $('evDate').value = dateKey(date);
  $('evAllDay').checked = true;
  $('timeFields').hidden = true;
  $('imagePreview').hidden = true;
  $('eventDialog').showModal();
}

async function openEditEvent(id) {
  const ev = await Store.getEvent(id);
  if (!ev) return;
  editingEventId = id;
  pendingImageBlob = null;
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
  $('imagePreview').hidden = !ev.imageId;
  if (ev.imageId) {
    const url = await getImageUrl(ev.imageId);
    showImagePreview(url);
  }
  $('eventDialog').showModal();
}

function showImagePreview(url) {
  $('imagePreviewImg').src = url;
  $('imagePreview').hidden = false;
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
    // 使用者按了「移除圖片」
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
  $('lightboxImg').src = url;
  $('lightbox').showModal();
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