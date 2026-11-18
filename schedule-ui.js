/* Individual schedules are effective from today; older days keep their schedule. */
const scheduleDialog = document.getElementById('schedule-dialog');
const scheduleForm = document.getElementById('schedule-form');
const scheduleMessage = document.getElementById('schedule-message');
const scheduleDayButtons = [...scheduleForm.querySelectorAll('[data-schedule-day]')];
let scheduleEmployeeId = null;
let scheduleSaving = false;

function selectScheduleDay(day) {
  scheduleDayButtons.forEach(button => {
    const selected = button.dataset.scheduleDay === day;
    button.setAttribute('aria-pressed', String(selected));
    document.getElementById(button.getAttribute('aria-controls')).classList.toggle('hidden', !selected);
  });
}

scheduleDayButtons.forEach(button => {
  button.addEventListener('click', () => selectScheduleDay(button.dataset.scheduleDay));
});

document.querySelector('#emp-table tbody').addEventListener('click', event => {
  const button = event.target.closest('.schedule-btn');
  if (!button || !adminOpen) return;
  const employee = employeesCache.find(e => e.id === button.dataset.id);
  if (!employee) return;
  scheduleEmployeeId = employee.id;
  document.getElementById('schedule-employee-name').textContent = employee.name;
  const { weekdays, sunday } = Attendance.weeklyScheduleFor(employee, fmtDate(new Date()));
  scheduleForm.elements.start.value = weekdays?.start || '';
  scheduleForm.elements.end.value = weekdays?.end || '';
  scheduleForm.elements.sundayStart.value = sunday?.start || '';
  scheduleForm.elements.sundayEnd.value = sunday?.end || '';
  scheduleMessage.textContent = '';
  selectScheduleDay('weekdays');
  scheduleDialog.showModal();
});
document.getElementById('schedule-cancel').addEventListener('click', () => {
  if (!scheduleSaving) scheduleDialog.close();
});
scheduleDialog.addEventListener('cancel', event => { if (scheduleSaving) event.preventDefault(); });
scheduleForm.addEventListener('submit', event => {
  event.preventDefault();
  const { start, end, sundayStart, sundayEnd } = scheduleForm.elements;
  const weekdays = start.value || end.value ? { start: start.value, end: end.value } : null;
  const sunday = sundayStart.value || sundayEnd.value ? { start: sundayStart.value, end: sundayEnd.value } : null;
  saveEmployeeSchedule(weekdays, sunday);
});
document.getElementById('schedule-clear').addEventListener('click', () => saveEmployeeSchedule(null, null));
async function saveEmployeeSchedule(weekdays, sunday) {
  if (!adminOpen || scheduleSaving || !scheduleEmployeeId) return;
  for (const [day, shift] of [['weekdays', weekdays], ['sunday', sunday]]) {
    if (!shift) continue;
    const start = Attendance.minutes(shift.start);
    const end = Attendance.minutes(shift.end);
    if (start === null || end === null || start === end) {
      selectScheduleDay(day);
      scheduleMessage.textContent = 'Укажите разные времена начала и окончания смены.';
      return;
    }
  }
  scheduleSaving = true;
  const controls = scheduleForm.querySelectorAll('button, input');
  controls.forEach(control => control.disabled = true);
  scheduleMessage.textContent = 'Сохраняем график…';
  const effectiveFrom = fmtDate(new Date());
  const employeeRef = db.collection('employees').doc(scheduleEmployeeId);
  try {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(employeeRef);
      if (!snapshot.exists) throw new Error('Сотрудник уже удалён.');
      const history = snapshot.data().scheduleHistory || [];
      const scheduleHistory = history.filter(item => item.effectiveFrom !== effectiveFrom);
      scheduleHistory.push({ effectiveFrom, start: weekdays?.start ?? null, end: weekdays?.end ?? null, sunday });
      transaction.update(employeeRef, { scheduleHistory });
    });
    scheduleDialog.close();
  } catch (error) {
    scheduleMessage.textContent = 'Не удалось сохранить график. Попробуйте ещё раз.';
  } finally {
    scheduleSaving = false;
    controls.forEach(control => control.disabled = false);
  }
}
