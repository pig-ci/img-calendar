'use strict';

/*
 * 解析 RRULE、產生易讀描述，並展開支援的重複事件日期。
 * parseRRule：解析 RRULE 鍵值；無內部函式依賴。
 * describe：產生重複規則描述；依賴 parseRRule。
 * addDays、addMonths、addYears：日期遞增工具；無內部函式依賴。
 * addWeeks：按週遞增日期；依賴 addDays。
 * isoDate：格式化日期鍵；依賴 pad。
 * pad：補齊日期欄位數字；由 isoDate 呼叫；無內部函式依賴。
 * expand：展開日期範圍內的事件實例；依賴 parseRRule、addDays、addWeeks、addMonths、addYears、isoDate。
 */
const Recurrence = (() => {
  const DAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function parseRRule(rrule) {
    if (!rrule) return null;
    const parts = {};
    rrule.split(';').forEach(p => {
      const [k, v] = p.split('=');
      parts[k.trim()] = v ? v.trim() : '';
    });
    return parts;
  }

  function describe(rrule) {
    const rule = parseRRule(rrule);
    if (!rule || !rule.FREQ) return '自訂重複';

    const frequencies = {
      SECONDLY: ['每秒', '秒'],
      MINUTELY: ['每分鐘', '分鐘'],
      HOURLY: ['每小時', '小時'],
      DAILY: ['每天', '天'],
      WEEKLY: ['每週', '週'],
      MONTHLY: ['每月', '個月'],
      YEARLY: ['每年', '年'],
    };
    const frequency = frequencies[rule.FREQ];
    if (!frequency) return '自訂重複';

    const parsedInterval = parseInt(rule.INTERVAL || '1', 10);
    const interval = Number.isInteger(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1;
    let description = interval === 1
      ? frequency[0]
      : `每隔 ${interval} ${frequency[1]}`;
    const details = [];

    if (rule.BYDAY) {
      const dayNames = { SU: '週日', MO: '週一', TU: '週二', WE: '週三', TH: '週四', FR: '週五', SA: '週六' };
      const days = rule.BYDAY.split(',')
        .map(day => dayNames[day.trim().slice(-2)])
        .filter(Boolean);
      if (days.length) description += `（${days.join('、')}）`;
    }
    if (rule.BYMONTHDAY) details.push(`每月 ${rule.BYMONTHDAY.split(',').join('、')} 日`);
    if (rule.COUNT) details.push(`共 ${rule.COUNT} 次`);
    if (rule.UNTIL) {
      const date = rule.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
      if (date) details.push(`至 ${date[1]} 年 ${Number(date[2])} 月 ${Number(date[3])} 日`);
    }

    return [description, ...details].join('，');
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }
  function addWeeks(date, n) { return addDays(date, n * 7); }
  function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
  }
  function addYears(date, n) {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() + n);
    return d;
  }

  function isoDate(d) {
    const pad = value => String(value).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /**
   * 將重複事件展開為 [rangeStart, rangeEnd] 範圍內的各次事件。
   * 每次事件皆以 { ...event, start, end } 的陣列元素形式回傳。
   */
  function expand(event, rangeStart, rangeEnd) {
    if (!event.recurrence) return [event];

    const rule = parseRRule(event.recurrence);
    if (!rule || !rule.FREQ) return [event];

    const freq = rule.FREQ;
    const interval = parseInt(rule.INTERVAL || '1', 10);
    const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
    const until = rule.UNTIL ? new Date(rule.UNTIL.replace(/(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3')) : null;
    const byDay = rule.BYDAY ? rule.BYDAY.split(',').map(d => DAY_MAP[d.trim()]).filter(d => d !== undefined) : null;

    const origStart = new Date(event.start);
    const origEnd = new Date(event.end);
    const duration = origEnd - origStart;

    const results = [];
    let current = new Date(origStart);
    let occCount = 0;
    const MAX_OCC = 500;

    while (true) {
      if (count !== null && occCount >= count) break;
      if (until && current > until) break;
      if (current > rangeEnd) break;
      if (occCount > MAX_OCC) break;

      if (current >= rangeStart && current <= rangeEnd) {
        const occEnd = new Date(current.getTime() + duration);
        results.push({
          ...event,
          id: event.id + '_' + isoDate(current),
          _masterId: event.id,
          _isOccurrence: true,
          start: current.toISOString(),
          end: occEnd.toISOString(),
        });
      }

      occCount++;
      if (freq === 'DAILY') {
        current = addDays(current, interval);
      } else if (freq === 'WEEKLY') {
        if (byDay && byDay.length > 0) {
          const sortedDays = [...byDay].sort((a, b) => a - b);
          const curDow = current.getDay();
          // 找出本週內下一個符合條件的星期幾
          const nextInWeek = sortedDays.find(d => d > curDow);
          if (nextInWeek !== undefined) {
            current = addDays(current, nextInWeek - curDow);
          } else {
            // 本週的 BYDAY 日期已處理完畢，跳至下一個間隔週的第一個 BYDAY 日期
            const startOfCurWeek = new Date(current);
            startOfCurWeek.setDate(startOfCurWeek.getDate() - curDow);
            const startOfNextWeek = addWeeks(startOfCurWeek, interval);
            current = addDays(startOfNextWeek, sortedDays[0]);
          }
        } else {
          current = addWeeks(current, interval);
        }
      } else if (freq === 'MONTHLY') {
        current = addMonths(current, interval);
      } else if (freq === 'YEARLY') {
        current = addYears(current, interval);
      } else {
        break;
      }
    }

    return results.length ? results : [];
  }

  return { expand, parseRRule, describe };
})();
