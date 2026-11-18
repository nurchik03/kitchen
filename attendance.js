/* Pure attendance calculations. Dates and times use the site's existing local clock. */
const Attendance = (() => {
  function minutes(time) {
    if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(time || '')) return null;
    const [h, m] = time.split(':').map(Number);
    return h < 24 && m < 60 ? h * 60 + m : null;
  }
  function validHours(shift) {
    if (!shift || minutes(shift.start) === null || minutes(shift.end) === null) return null;
    return { start: shift.start, end: shift.end };
  }
  function weeklyScheduleFor(employee, date) {
    const history = (employee?.scheduleHistory || []).filter(s => s.effectiveFrom <= date)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    const version = history[0];
    const weekdays = validHours(version);
    // Existing schedules used the same shift on Sundays until a separate Sunday is saved.
    const sunday = version?.sunday === undefined ? weekdays : validHours(version.sunday);
    return { weekdays, sunday, sundayOff: version?.sunday === null };
  }
  function dailySchedule(employee, date) {
    const day = new Date(`${date}T12:00:00`).getDay();
    if (day === 6) return { schedule: null, dayOff: true };
    const week = weeklyScheduleFor(employee, date);
    if (day === 0) return { schedule: week.sunday, dayOff: week.sundayOff };
    return { schedule: week.weekdays, dayOff: false };
  }
  function scheduleFor(employee, date) {
    return dailySchedule(employee, date).schedule;
  }
  function scheduledTime(date, time) {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute).getTime();
  }
  function buildRows(logs, employees) {
    const rows = [], pending = new Map();
    const ordered = logs.filter(l => Number.isFinite(l.ts) && ['in', 'out'].includes(l.type))
      .slice().sort((a, b) => a.ts - b.ts);
    for (const log of ordered) {
      if (log.type === 'in') {
        const row = { date: log.date, name: log.name, entry: log, exit: null };
        rows.push(row);
        pending.set(log.name, row);
      } else {
        const row = pending.get(log.name);
        if (row) { row.exit = log; pending.delete(log.name); }
        else rows.push({ date: log.date, name: log.name, entry: null, exit: log });
      }
    }
    const groups = new Map();
    for (const row of rows) {
      const key = JSON.stringify([row.date, row.name]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const employeeMap = new Map(employees.map(e => [e.name, e]));
    for (const group of groups.values()) {
      const firstEntry = group.find(r => r.entry);
      const last = group[group.length - 1];
      const { name, date } = group[0];
      const { schedule, dayOff } = dailySchedule(employeeMap.get(name), date);
      for (const row of group) {
        row.schedule = schedule;
        row.dayOff = dayOff;
        row.late = 0; row.early = 0;
        if (!row.schedule) continue;
        const start = scheduledTime(row.date, row.schedule.start);
        let end = scheduledTime(row.date, row.schedule.end);
        if (minutes(row.schedule.end) <= minutes(row.schedule.start)) {
          const next = new Date(end); next.setDate(next.getDate() + 1); end = next.getTime();
        }
        // Compare to the minute shown in the journal; 09:00:59 is still 09:00.
        if (row === firstEntry) row.late = Math.max(0, Math.floor(row.entry.ts / 60000) - Math.floor(start / 60000));
        if (row === last && row.exit) row.early = Math.max(0, Math.floor(end / 60000) - Math.floor(row.exit.ts / 60000));
      }
    }
    return rows.sort((a, b) => (b.entry || b.exit).ts - (a.entry || a.exit).ts);
  }
  function notes(row) {
    const notes = [];
    if (row.late) notes.push(`Опоздал на ${row.late} мин.`);
    if (row.early) notes.push(`Ранний уход на ${row.early} мин.`);
    if (!row.entry) notes.push('Нет отметки входа');
    if (!row.exit) notes.push('Выход не отмечен');
    if (row.dayOff) notes.push('Выходной');
    else if (!row.schedule) notes.push('График не задан');
    if (!notes.length) notes.push('По графику');
    return notes;
  }
  return { minutes, scheduleFor, weeklyScheduleFor, buildRows, notes };
})();
