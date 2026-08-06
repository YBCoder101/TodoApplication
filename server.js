'use strict';

const path = require('path');
const express = require('express');
const { createDb } = require('./src/db');
const repo = require('./src/tasksRepo');

const DB_PATH = path.join(__dirname, 'data', 'labtrack.db');
const PORT = process.env.PORT || 3000;

const db = createDb(DB_PATH);
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tasks', (req, res) => {
  const { sort, archived } = req.query;
  const tasks = repo.listTasks(db, {
    sortBy: sort,
    includeArchived: archived === 'true',
  });
  res.json(tasks);
});

app.get('/api/topics', (req, res) => {
  res.json(repo.listTopics(db));
});

app.post('/api/tasks', (req, res) => {
  try {
    const task = repo.createTask(db, req.body);
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    const task = repo.editTask(db, Number(req.params.id), req.body);
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/archive', (req, res) => {
  try {
    const task = repo.archiveTask(db, Number(req.params.id));
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* istanbul ignore next -- only runs when this file is executed directly */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LabTrack running at http://localhost:${PORT}`);
  });
}

module.exports = app;
