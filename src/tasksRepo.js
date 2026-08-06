'use strict';

const STATUSES = Object.freeze(['todo', 'in-progress', 'complete']);

const SORT_COLUMNS = Object.freeze({
  topic: 't.name',
  status: 'tasks.status',
  dueDate: 'tasks.due_date',
});

function nowIso() {
  return new Date().toISOString();
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function findOrCreateTopic(db, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Topic is required');

  const existing = db.prepare('SELECT id FROM topics WHERE name = ?').get(trimmed);
  if (existing) return existing.id;

  const result = db.prepare('INSERT INTO topics (name) VALUES (?)').run(trimmed);
  return result.lastInsertRowid;
}

function listTopics(db) {
  return db.prepare('SELECT id, name FROM topics ORDER BY name ASC').all();
}

function attachOverdue(task) {
  const isOverdue = !task.archived && task.status !== 'complete' && task.dueDate < todayDateOnly();
  return { ...task, overdue: isOverdue };
}

function rowToTask(row) {
  return attachOverdue({
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    topic: row.topic_name,
    topicId: row.topic_id,
    status: row.status,
    archived: !!row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function createTask(db, { title, description = '', dueDate, topic }) {
  if (!title || !String(title).trim()) throw new Error('Title is required');
  if (!dueDate) throw new Error('Due date is required');

  const topicId = findOrCreateTopic(db, topic);
  const ts = nowIso();

  const result = db
    .prepare(
      `INSERT INTO tasks (title, description, due_date, topic_id, status, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'todo', 0, ?, ?)`
    )
    .run(String(title).trim(), description, dueDate, topicId, ts, ts);

  return getTaskById(db, result.lastInsertRowid);
}

function getTaskById(db, id) {
  const row = db
    .prepare(
      `SELECT tasks.*, t.name AS topic_name
       FROM tasks JOIN topics t ON t.id = tasks.topic_id
       WHERE tasks.id = ?`
    )
    .get(id);
  return row ? rowToTask(row) : null;
}

function editTask(db, id, { title, description, dueDate, topic, status }) {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) throw new Error(`Task ${id} not found`);

  if (status !== undefined && !STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const topicId = topic !== undefined ? findOrCreateTopic(db, topic) : existing.topic_id;

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, due_date = ?, topic_id = ?, status = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    title !== undefined ? String(title).trim() : existing.title,
    description !== undefined ? description : existing.description,
    dueDate !== undefined ? dueDate : existing.due_date,
    topicId,
    status !== undefined ? status : existing.status,
    nowIso(),
    id
  );

  return getTaskById(db, id);
}

function archiveTask(db, id) {
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!existing) throw new Error(`Task ${id} not found`);

  db.prepare('UPDATE tasks SET archived = 1, updated_at = ? WHERE id = ?').run(nowIso(), id);
  return getTaskById(db, id);
}

function listTasks(db, { sortBy = 'dueDate', includeArchived = false } = {}) {
  const column = SORT_COLUMNS[sortBy] || SORT_COLUMNS.dueDate;
  const archivedClause = includeArchived ? '' : 'WHERE tasks.archived = 0';

  const rows = db
    .prepare(
      `SELECT tasks.*, t.name AS topic_name
       FROM tasks JOIN topics t ON t.id = tasks.topic_id
       ${archivedClause}
       ORDER BY ${column} ASC, tasks.due_date ASC`
    )
    .all();

  return rows.map(rowToTask);
}

module.exports = {
  STATUSES,
  createTask,
  editTask,
  archiveTask,
  getTaskById,
  listTasks,
  listTopics,
};
