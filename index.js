const express = require('express');
const app = express();
const cors = require('cors');
const pool = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Middleware
// app.use(
//   cors({
//     origin: 'https://todo-app-fe-rust.vercel.app',
//     methods: ['GET', 'POST', 'PUT', 'DELETE'],
//     credentials: true, // Jika kamu menggunakan cookie untuk autentikasi
//   })
// );

app.use(cors());

app.use(express.json()); // to access req.body

// Middleware untuk verifikasi token JWT
const verifyToken = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// ROUTES

// Create a Todo
app.post('/todos', verifyToken, async (req, res) => {
  try {
    const { description } = req.body;
    const userId = req.user.id;

    const newTodo = await pool.query(
      'INSERT INTO todo (description) VALUES($1) RETURNING *',
      [description]
    );

    // Associate todo with user
    await pool.query(
      'INSERT INTO user_tasks (user_id, todo_id) VALUES($1, $2)',
      [userId, newTodo.rows[0].todo_id]
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

// ROUTE UNTUK REGISTER DAN LOGIN

// Register user
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user exists
    const userExist = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    if (userExist.rows.length > 0) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save user to database
    const newUser = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
      [username, hashedPassword]
    );

    // Generate JWT
    const payload = { user: { id: newUser.rows[0].user_id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.json({ token });
  } catch (error) {
    console.error(error.message);
  }
});

// Login user
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user by username
    const user = await pool.query('SELECT * FROM users WHERE username = $1', [
      username,
    ]);
    if (user.rows.length === 0) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Generate JWT
    const payload = { user: { id: user.rows[0].user_id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.json({ token });
  } catch (error) {
    console.error(error.message);
  }
});

app.listen(process.env.PORT, () => {
  console.log('Server has started on port 5000');
});
