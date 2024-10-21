const express = require('express');
const app = express();
const cors = require('cors');
const pool = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

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

// Get all todos for a user
app.get('/todos', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userTodos = await pool.query(
      `SELECT t.* FROM todo t
      JOIN user_tasks ut ON t.todo_id = ut.todo_id
      WHERE ut.user_id = $1`,
      [userId]
    );
    res.json(userTodos.rows);
  } catch (error) {
    console.error(error.message);
  }
});

// // Get a todo
// app.get('/todos/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const todo = await pool.query('SELECT * FROM todo WHERE todo_id = $1', [
//       id,
//     ]);

//     res.json(todo.rows[0]);
//   } catch (error) {
//     console.error(error.message);
//   }
// });

// Update a todo
app.put('/todos/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, completed } = req.body;
    const userId = req.user.id;

    // Check if the todo belongs to the logged-in user
    const userTodo = await pool.query(
      `SELECT t.* FROM todo t
      JOIN user_tasks ut ON t.todo_id = ut.todo_id
      WHERE t.todo_id = $1 AND ut.user_id = $2`,
      [id, userId]
    );

    if (userTodo.rows.length === 0) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    // Update the todo
    if (description) {
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
    const userId = req.user.id;

    // Check if the todo belongs to the logged-in user
    const userTodo = await pool.query(
      `SELECT t.* FROM todo t
      JOIN user_tasks ut ON t.todo_id = ut.todo_id
      WHERE t.todo_id = $1 AND ut.user_id = $2`,
      [id, userId]
    );

    if (userTodo.rows.length === 0) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    // Delete the todo
    await pool.query('DELETE FROM todo WHERE todo_id = $1', [id]);

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
    const id = `user-${uuidv4()}`;

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
      'INSERT INTO users (user_id, username, password) VALUES ($1, $2, $3) RETURNING user_id',
      [id, username, hashedPassword]
    );

    res.json(newUser.rows[0]);
  } catch (error) {
    console.error(error.message);
  }
});

// Endpoint untuk Menambahkan Autentikasi alias Log In
app.post('/authentications', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user by username
    const user = await pool.query('SELECT * FROM users WHERE username = $1', [
      username,
    ]);
    if (user.rows.length === 0) {
      return res
        .status(400)
        .json({ msg: 'Invalid credentials! No username found' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Generate JWT
    const payload = { user: { id: user.rows[0].user_id } };
    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
      expiresIn: '1h',
    });
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: '7d',
    });

    // Simpan refresh token ke database
    await pool.query('UPDATE users SET refresh_token = $1 WHERE user_id = $2', [
      refreshToken,
      user.rows[0].user_id,
    ]);

    res.json({ accessToken, refreshToken });
  } catch (error) {
    console.error(error.message);
  }
});

// Endpoint untuk memperbarui accessToken menggunakan refreshToken
app.put('/authentications', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res
        .status(401)
        .json({ msg: 'No refresh token, authorization denied' });
    }

    const user = await pool.query(
      'SELECT * FROM users WHERE refresh_token = $1',
      [refreshToken]
    );

    if (user.rows.length === 0) {
      return res
        .status(403)
        .json({ msg: 'Invalid refresh token or Expired over 7 days' });
    }

    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ msg: 'Invalid refresh token' });
      }

      const payload = { user: { id: decoded.user.id } };
      const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '1h',
      });

      res.json({ accessToken });
    });
  } catch (error) {
    console.error(error.message);
  }
});

// Endpoint logout untuk menghapus refreshToken dari database
app.delete('/authentications', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query(
      'UPDATE users SET refresh_token = NULL WHERE user_id = $1',
      [userId]
    );

    res.json({ msg: 'Logged out successfully' });
  } catch (error) {
    console.error(error.message);
  }
});

app.listen(process.env.PORT, () => {
  console.log('Server has started on port 5000');
});
