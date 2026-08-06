'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createDb } = require('../src/db');
const repo = require('../src/tasksRepo');

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

test('createTask persists all fields and defaults status to todo', () => {
  const db = createDb(':memory:');

  const task = repo.createTask(db, {
    title: 'Implement quicksort',
    description: 'Median-of-three pivot, in place',
    dueDate: futureDate(3),
    topic: 'Algorithms',
  });

  assert.equal(task.title, 'Implement quicksort');
  assert.equal(task.description, 'Median-of-three pivot, in place');
  assert.equal(task.topic, 'Algorithms');
  assert.equal(task.status, 'todo');
  assert.equal(task.archived, false);

  const reloaded = repo.getTaskById(db, task.id);
  assert.deepEqual(reloaded, task);
});

test('archiving a task removes it from the default list but never deletes it', () => {
  const db = createDb(':memory:');

  const task = repo.createTask(db, {
    title: 'Write lab report',
    dueDate: futureDate(5),
    topic: 'OS',
  });

  repo.archiveTask(db, task.id);

  const defaultList = repo.listTasks(db, { includeArchived: false });
  assert.equal(defaultList.find((t) => t.id === task.id), undefined);

  const withArchived = repo.listTasks(db, { includeArchived: true });
  const archivedTask = withArchived.find((t) => t.id === task.id);
  assert.ok(archivedTask, 'archived task must still be retrievable');
  assert.equal(archivedTask.archived, true);

  const stillFetchableDirectly = repo.getTaskById(db, task.id);
  assert.ok(stillFetchableDirectly, 'getTaskById must still find archived tasks');
});

test('overdue is derived from due date and status, not stored as a status', () => {
  const db = createDb(':memory:');

  const overdueTodo = repo.createTask(db, {
    title: 'Submit assignment 2',
    dueDate: '2000-01-01',
    topic: 'Databases',
  });

  const overdueButComplete = repo.createTask(db, {
    title: 'Submit assignment 1',
    dueDate: '2000-01-01',
    topic: 'Databases',
  });
  repo.editTask(db, overdueButComplete.id, { status: 'complete' });

  const notYetDue = repo.createTask(db, {
    title: 'Submit assignment 3',
    dueDate: futureDate(30),
    topic: 'Databases',
  });

  const [reloadedOverdue, reloadedComplete, reloadedFuture] = [
    repo.getTaskById(db, overdueTodo.id),
    repo.getTaskById(db, overdueButComplete.id),
    repo.getTaskById(db, notYetDue.id),
  ];

  assert.equal(reloadedOverdue.overdue, true);
  assert.equal(reloadedComplete.overdue, false, 'completed tasks are not flagged overdue');
  assert.equal(reloadedFuture.overdue, false);

  // "overdue" must never appear as a value of status - only todo/in-progress/complete are valid
  assert.ok(repo.STATUSES.includes(reloadedOverdue.status));
});

test('listTasks sorts by topic, status, and due date on request', () => {
  const db = createDb(':memory:');

  const a = repo.createTask(db, { title: 'A', dueDate: futureDate(10), topic: 'Zebra' });
  const b = repo.createTask(db, { title: 'B', dueDate: futureDate(1), topic: 'Apple' });
  const c = repo.createTask(db, { title: 'C', dueDate: futureDate(5), topic: 'Mango' });
  repo.editTask(db, a.id, { status: 'complete' });
  repo.editTask(db, b.id, { status: 'in-progress' });

  const byTopic = repo.listTasks(db, { sortBy: 'topic' }).map((t) => t.topic);
  assert.deepEqual(byTopic, ['Apple', 'Mango', 'Zebra']);

  const byDueDate = repo.listTasks(db, { sortBy: 'dueDate' }).map((t) => t.id);
  assert.deepEqual(byDueDate, [b.id, c.id, a.id]);

  const byStatus = repo.listTasks(db, { sortBy: 'status' }).map((t) => t.status);
  // 'complete' < 'in-progress' < 'todo' alphabetically - just assert grouping is consistent
  assert.equal(byStatus[0], 'complete');
});

test('data persists across an application restart (reopening the same database file)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'labtrack-test-'));
  const dbPath = path.join(tmpDir, 'labtrack.db');

  try {
    const firstRun = createDb(dbPath);
    const created = repo.createTask(firstRun, {
      title: 'Persist me',
      dueDate: futureDate(2),
      topic: 'Networks',
    });
    firstRun.close();

    // Simulate restarting the app: open a brand new connection to the same file.
    const secondRun = createDb(dbPath);
    const reloaded = repo.getTaskById(secondRun, created.id);

    assert.ok(reloaded, 'task must still exist after reopening the database');
    assert.equal(reloaded.title, 'Persist me');
    assert.equal(reloaded.topic, 'Networks');

    secondRun.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
