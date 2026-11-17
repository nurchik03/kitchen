/* Individual schedules are effective from today; older days keep their schedule. */
const scheduleDialog = document.getElementById('schedule-dialog');
const scheduleForm = document.getElementById('schedule-form');
let scheduleEmployeeId = null;
let scheduleSaving = false;
document.querySelector('#emp-table tbody').addEventListener('click', event => {
  const button = event.target.closest('.schedule-btn');
  if (!button || !adminOpen) return;
  const employee = employeesCache.find(e => e.id === button.dataset.id);
  if (!employee) return;
  scheduleEmployeeId = employee.id;
  document.getElementById('schedule-employee-name').textContent = employee.name;
  const current = Attendance.scheduleFor(employee, fmtDate(new Date()));
  scheduleForm.elements.start.value = current?.start || '';
  scheduleForm.elements.end.value = current?.end || '';
  document.getElementById('schedule-message').textContent = '';
  scheduleDialog.showModal();
});
document.getElementById('schedule-cancel').addEventListener('click', () => {
  if (!scheduleSaving) scheduleDialog.close();
});
scheduleDialog.addEventListener('cancel', event => { if (scheduleSaving) event.preventDefault(); });
scheduleForm.addEventListener('submit', event => {
  event.preventDefault();
  saveEmployeeSchedule(scheduleForm.elements.start.value, scheduleForm.elements.end.value);
});
document.getElementById('schedule-clear').addEventListener('click', () => saveEmployeeSchedule(null, null));
async function saveEmployeeSchedule(start, end) {
  if (!adminOpen || scheduleSaving || !scheduleEmployeeId) return;
  const message = document.getElementById('schedule-message');
  if (start !== null && (Attendance.minutes(start) === null || Attendance.minutes(end) === null || start === end)) {
    message.textContent = 'Укажите разные времена начала и окончания смены.';
    return;
  }
  scheduleSaving = true;
  scheduleForm.querySelectorAll('button').forEach(b => b.disabled = true);
  message.textContent = 'Сохраняем график…';
  const effectiveFrom = fmtDate(new Date());
  const employeeRef = db.collection('employees').doc(scheduleEmployeeId);
  try {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(employeeRef);
      if (!snapshot.exists) throw new Error('Сотрудник уже удалён.');
      const history = snapshot.data().scheduleHistory || [];
      const scheduleHistory = history.filter(item => item.effectiveFrom !== effectiveFrom);
      scheduleHistory.push({ effectiveFrom, start, end });
      transaction.update(employeeRef, { scheduleHistory });
    });
    scheduleDialog.close();
  } catch (error) {
    message.textContent = 'Не удалось сохранить график. Попробуйте ещё раз.';
  } finally {
    scheduleSaving = false;
    scheduleForm.querySelectorAll('button').forEach(b => b.disabled = false);
  }
}
