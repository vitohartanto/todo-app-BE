const express = require('express');
const app = express();
const cors = require('cors');
const pool = require('./db');

// Middleware
app.use(cors());
app.use(express.json()); // to access req.body

// ROUTES

// Create a Todo
app.post('/todos', async (req, res) => {
  try {
    const { description } = req.body;
    const newTodo = await pool.query(
      'INSERT INTO todo (description) VALUES($1) RETURNING *',
      [description]
    );

    res.json(newTodo.rows[0]);
  } catch (error) {
    console.error(error.message);
  }
});

// Get all todos
app.get('/todos', async (req, res) => {
  try {
    const allTodos = await pool.query('SELECT * FROM todo');
    res.json(allTodos.rows);
  } catch (error) {
    console.error(error.message);
  }
});

// Get a todo
app.get('/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const todo = await pool.query('SELECT * FROM todo WHERE todo_id = $1', [
      id,
    ]);

    res.json(todo.rows[0]);
  } catch (error) {
    console.error(error.message);
  }
});

// Update a todo
app.put('/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { description, completed } = req.body;

    if (description) {
      // Update description jika disediakan dalam body
      await pool.query('UPDATE todo SET description = $1 WHERE todo_id = $2', [
        description,
        id,
      ]);
    }

    if (typeof completed !== 'undefined') {
      // Update completed jika disediakan dalam body
      await pool.query('UPDATE todo SET completed = $1 WHERE todo_id = $2', [
        completed,
        id,
      ]);
    }

    res.json('Todo was updated!');
  } catch (error) {
    console.error(error.message);
  }
});

// Delete a todo
app.delete('/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedTodo = await pool.query(
      'DELETE FROM todo WHERE todo_id = $1 RETURNING *',
      [id]
    );

    res.json('Todo was deleted!');
  } catch (error) {
    console.error(error.message);
  }
});

// Update todo order
app.put('/todos/reorder', async (req, res) => {
  const { todos } = req.body; // Expects an array of todos with updated order
  try {
    const updatePromises = todos.map((todo, index) => {
      return pool.query('UPDATE todo SET order = $1 WHERE todo_id = $2', [
        index,
        todo.todo_id,
      ]);
    });

    await Promise.all(updatePromises);
    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    console.error(error.message);
  }
});

app.listen(5000, () => {
  console.log('Server has started on port 5000');
});
