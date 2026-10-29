'use strict';

/*
 * 範圍查詢：對有 recurrence 的事件呼叫 Recurrence.expand，
 * 其餘直接比對 start/end。lib/recurrence.js 若不存在則優雅降級。
 */

import { Store } from './store.js';

export const Query = (() => {
  let Recurrence = null;
  let recurrenceAttempted = false;

  async function loadRecurrence() {
    if (recurrenceAttempted) return Recurrence;
    recurrenceAttempted = true;
    try {
      const mod = await import('./lib/recurrence.js');
      Recurrence = mod.Recurrence || mod.default || null;
    } catch (e) {
      console.warn('[query.js] lib/recurrence.js 未載入，重複事件不會展開。', e);
      Recurrence = null;
    }
    return Recurrence;
  }

  async function getEventsInRange(rangeStart, rangeEnd) {
    const start = rangeStart instanceof Date ? rangeStart : new Date(rangeStart);
    const end = rangeEnd instanceof Date ? rangeEnd : new Date(rangeEnd);

    const all = await Store.getAllEvents();
    const recur = await loadRecurrence();
    const results = [];

    for (const ev of all) {
      if (!isValidEvent(ev)) continue;

      if (ev.recurrence && recur) {
        const expanded = recur.expand(ev, start, end);
        if (expanded.length) results.push(...expanded);
      } else {
        const s = new Date(ev.start);
        const e = new Date(ev.end);
        if (s <= end && e >= start) results.push(ev);
      }
    }

    return results.sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  function isValidEvent(ev) {
    const s = new Date(ev.start).getTime();
    const e = new Date(ev.end).getTime();
    return Number.isFinite(s) && Number.isFinite(e) && e >= s;
  }

  return { getEventsInRange };
})();