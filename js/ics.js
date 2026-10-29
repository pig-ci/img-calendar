'use strict';

/*
 * iCalendar (ICS) 日期、文字與事件的匯入／匯出轉換。
 * pad：補齊日期時間數字；無內部函式依賴。
 * toICSDate：轉換 ICS 日期格式；依賴 pad。
 * escape、unescape：跳脫或還原 ICS 文字；無內部函式依賴。
 * foldLine：依 ICS 行長限制折行；無內部函式依賴。
 * exportICS：將事件序列化為 ICS；依賴 toICSDate、escape、foldLine。
 * parseICSDate：將 ICS 日期轉為應用程式日期字串；無內部函式依賴。
 * importICS：解析 ICS 並建立事件資料；依賴 parseICSDate、unescape。
 */
const ICS = (() => {
  function pad(n) { return String(n).padStart(2, '0'); }

  function toICSDate(iso, allDay) {
    if (allDay) {
      const date = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (date) return `${date[1]}${date[2]}${date[3]}`;
    }
    const d = new Date(iso);
    if (allDay) {
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    }
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T` +
           `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }

  function escape(s) {
    return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function foldLine(line) {
    const max = 75;
    if (line.length <= max) return line;
    let result = '';
    while (line.length > max) {
      result += line.slice(0, max) + '\r\n ';
      line = line.slice(max);
    }
    return result + line;
  }

  function exportICS(events) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Payas Days//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    for (const ev of events) {
      const dtstart = ev.allDay
        ? `DTSTART;VALUE=DATE:${toICSDate(ev.start, true)}`
        : `DTSTART:${toICSDate(ev.start, false)}`;
      const dtend = ev.allDay
        ? `DTEND;VALUE=DATE:${toICSDate(ev.end, true)}`
        : `DTEND:${toICSDate(ev.end, false)}`;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ev.id}@payas-days`);
      lines.push(`SUMMARY:${escape(ev.title)}`);
      lines.push(`X-PAYAS-TYPE:${escape(ev.type || 'important')}`);
      lines.push(dtstart);
      lines.push(dtend);
      if (ev.description) lines.push(`DESCRIPTION:${escape(ev.description)}`);
      if (ev.location) lines.push(`LOCATION:${escape(ev.location)}`);
      if (ev.recurrence) lines.push(`RRULE:${ev.recurrence}`);
      if (ev.created) lines.push(`CREATED:${toICSDate(ev.created, false)}`);
      if (ev.modified) lines.push(`LAST-MODIFIED:${toICSDate(ev.modified, false)}`);
      if (ev.attendees) {
        for (const a of ev.attendees) lines.push(`ATTENDEE:mailto:${a}`);
      }
      if (ev.reminders) {
        for (const mins of ev.reminders) {
          lines.push('BEGIN:VALARM');
          lines.push('ACTION:DISPLAY');
          lines.push(`DESCRIPTION:Reminder`);
          lines.push(`TRIGGER:-PT${mins}M`);
          lines.push('END:VALARM');
        }
      }
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n');
  }

  function parseICSDate(val) {
    // 日期時間格式：20260418T090000 或 20260418T090000Z
    // 日期格式：20260418
    const clean = val.replace(/Z$/, '');
    if (clean.includes('T')) {
      const m = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
    } else {
      const m = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00:00`;
    }
    return val;
  }

  function unescape(s) {
    return (s || '').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  }

  function importICS(text) {
    // 展開摺疊的行（續行以空格或定位字元開頭）
    const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = unfolded.split('\n');

    const events = [];
    let current = null;
    let inAlarm = false;

    for (const rawLine of lines) {
      const colonIdx = rawLine.indexOf(':');
      if (colonIdx < 0) continue;
      const prop = rawLine.slice(0, colonIdx).toUpperCase();
      const val = rawLine.slice(colonIdx + 1).trim();

      // 處理參數（例如 DTSTART;VALUE=DATE:...）
      const propBase = prop.split(';')[0];
      const propRaw = rawLine.slice(0, colonIdx);

      if (propBase === 'BEGIN' && val === 'VEVENT') { current = { reminders: [], attendees: [] }; inAlarm = false; }
      else if (propBase === 'BEGIN' && val === 'VALARM') { inAlarm = true; }
      else if (propBase === 'END' && val === 'VALARM') { inAlarm = false; }
      else if (propBase === 'END' && val === 'VEVENT') {
        if (current) {
          events.push(current);
          current = null;
        }
      }
      else if (current && !inAlarm) {
        switch (propBase) {
          case 'UID': current.id = val.replace('@payas-days', '') || ('import-' + Date.now()); break;
          case 'SUMMARY': current.title = unescape(val); break;
          case 'X-PAYAS-TYPE': current.type = unescape(val); break;
          case 'DESCRIPTION': current.description = unescape(val); break;
          case 'LOCATION': current.location = unescape(val); break;
          case 'DTSTART': {
            current.allDay = propRaw.toUpperCase().includes('VALUE=DATE') && !val.includes('T');
            current.start = parseICSDate(val);
            break;
          }
          case 'DTEND': current.end = parseICSDate(val); break;
          case 'RRULE': current.recurrence = val; break;
          case 'CREATED': current.created = parseICSDate(val); break;
          case 'LAST-MODIFIED': current.modified = parseICSDate(val); break;
          case 'ATTENDEE': {
            const email = val.replace(/^mailto:/i, '');
            if (email) current.attendees.push(email);
            break;
          }
        }
      } else if (current && inAlarm && propBase === 'TRIGGER') {
        const m = val.match(/^-?PT(\d+)M$/i);
        if (m) current.reminders.push(parseInt(m[1], 10));
      }
    }

    return events.map(ev => ({
      color: 'blue',
      label: '',
      attachments: [],
      ...ev,
      id: ev.id || ('import-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)),
    }));
  }

  return { exportICS, importICS };
})();
