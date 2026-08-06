'use strict';

const state = {
  tasks: [],
  topics: [],
  sortBy: 'dueDate',
  showArchived: false,
  editingId: null,
};

const els = {
  sortSelect: document.getElementById('sort-select'),
  showArchived: document.getElementById('show-archived'),
  newTaskBtn: document.getElementById('new-task-btn'),
  formPanel: document.getElementById('task-form-panel'),
  formTitle: document.getElementById('form-title'),
  form: document.getElementById('task-form'),
  taskId: document.getElementById('task-id'),
  fieldTitle: document.getElementById('field-title'),
  fieldDescription: document.getElementById('field-description'),
  fieldDueDate: document.getElementById('field-due-date'),
  fieldTopic: document.getElementById('field-topic'),
  topicOptions: document.getElementById('topic-options'),
  statusField: document.getElementById('status-field'),
  fieldStatus: document.getElementById('field-status'),
  submitBtn: document.getElementById('form-submit-btn'),
  cancelBtn: document.getElementById('form-cancel-btn'),
  taskList: document.getElementById('task-list'),
  emptyState: document.getElementById('empty-state'),
};

const STATUS_LABELS = {
  todo: 'Todo',
  'in-progress': 'In-Progress',
  complete: 'Complete',
};

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${y}-${m}-${d}`;
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function loadTopics() {
  state.topics = await api('/api/topics');
  els.topicOptions.innerHTML = state.topics
    .map((t) => `<option value="${escapeHtml(t.name)}"></option>`)
    .join('');
}

async function loadTasks() {
  const params = new URLSearchParams({
    sort: state.sortBy,
    archived: String(state.showArchived),
  });
  state.tasks = await api(`/api/tasks?${params.toString()}`);
  renderTasks();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderTasks() {
  if (state.tasks.length === 0) {
    els.taskList.innerHTML = '';
    els.emptyState.hidden = false;
    return;
  }
  els.emptyState.hidden = true;

  els.taskList.innerHTML = state.tasks
    .map((task) => {
      const rowClasses = ['task-row'];
      if (task.archived) rowClasses.push('is-archived');
      if (task.overdue) rowClasses.push('is-overdue');

      return `
        <tr class="${rowClasses.join(' ')}" data-id="${task.id}">
          <td>
            <select class="status-select" data-status="${task.status}" ${task.archived ? 'disabled' : ''} data-action="status">
              ${Object.entries(STATUS_LABELS)
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${value === task.status ? 'selected' : ''}>${label}</option>`
                )
                .join('')}
            </select>
          </td>
          <td>
            <p class="task-title">${escapeHtml(task.title)}</p>
            ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}
          </td>
          <td><span class="topic-tag">${escapeHtml(task.topic)}</span></td>
          <td>
            <div class="due-cell">
              <span>${formatDate(task.dueDate)}</span>
              ${task.overdue ? '<span class="overdue-stamp">OVERDUE</span>' : ''}
            </div>
          </td>
          <td>
            <div class="row-actions">
              ${
                task.archived
                  ? '<span class="topic-tag">Archived</span>'
                  : `<button class="btn-text" data-action="edit">Edit</button>
                     <button class="btn-text" data-action="archive">Archive</button>`
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function openForm(task) {
  state.editingId = task ? task.id : null;
  els.formTitle.textContent = task ? 'Edit task' : 'New task';
  els.submitBtn.textContent = task ? 'Save changes' : 'Save task';
  els.statusField.hidden = !task;

  els.taskId.value = task ? task.id : '';
  els.fieldTitle.value = task ? task.title : '';
  els.fieldDescription.value = task ? task.description : '';
  els.fieldDueDate.value = task ? task.dueDate : '';
  els.fieldTopic.value = task ? task.topic : '';
  els.fieldStatus.value = task ? task.status : 'todo';

  els.formPanel.hidden = false;
  els.fieldTitle.focus();
}

function closeForm() {
  els.formPanel.hidden = true;
  state.editingId = null;
  els.form.reset();
}

async function handleSubmit(evt) {
  evt.preventDefault();

  const payload = {
    title: els.fieldTitle.value.trim(),
    description: els.fieldDescription.value.trim(),
    dueDate: els.fieldDueDate.value,
    topic: els.fieldTopic.value.trim(),
  };

  try {
    if (state.editingId) {
      payload.status = els.fieldStatus.value;
      await api(`/api/tasks/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    closeForm();
    await Promise.all([loadTopics(), loadTasks()]);
  } catch (err) {
    alert(err.message);
  }
}

async function handleTableClick(evt) {
  const btn = evt.target.closest('button[data-action]');
  if (!btn) return;

  const row = evt.target.closest('tr[data-id]');
  const id = Number(row.dataset.id);
  const task = state.tasks.find((t) => t.id === id);

  if (btn.dataset.action === 'edit') {
    openForm(task);
  } else if (btn.dataset.action === 'archive') {
    if (!confirm(`Archive "${task.title}"? It will no longer appear in the default list, but is never deleted.`)) return;
    await api(`/api/tasks/${id}/archive`, { method: 'POST' });
    await loadTasks();
  }
}

async function handleStatusChange(evt) {
  const select = evt.target.closest('select[data-action="status"]');
  if (!select) return;

  const row = evt.target.closest('tr[data-id]');
  const id = Number(row.dataset.id);
  const task = state.tasks.find((t) => t.id === id);

  try {
    await api(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...task, status: select.value }),
    });
    await loadTasks();
  } catch (err) {
    alert(err.message);
  }
}

els.newTaskBtn.addEventListener('click', () => openForm(null));
els.cancelBtn.addEventListener('click', closeForm);
els.form.addEventListener('submit', handleSubmit);
els.sortSelect.addEventListener('change', () => {
  state.sortBy = els.sortSelect.value;
  loadTasks();
});
els.showArchived.addEventListener('change', () => {
  state.showArchived = els.showArchived.checked;
  loadTasks();
});
els.taskList.addEventListener('click', handleTableClick);
els.taskList.addEventListener('change', handleStatusChange);

(async function init() {
  await Promise.all([loadTopics(), loadTasks()]);
})();
