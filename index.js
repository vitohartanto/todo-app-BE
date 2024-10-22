const express = require('express');
const app = express();
const cors = require('cors');
const pool = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Middleware
app.use(
  cors({
    origin: 'https://todo-app-fe-rust.vercel.app',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true, // Jika kamu menggunakan cookie untuk autentikasi
  })
);

// app.use(cors());

app.use(express.json()); // to access req.body

// Middleware untuk authentications
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  //Extracting token from authorization header
  const token = authHeader && authHeader.split(' ')[1];

  //Checking if the token is null
  if (!token) {
    return res.status(401).send('Authorization failed. No access token.');
  }

  //Verifying if the token is valid.
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, user) => {
    if (err) {
      console.error(err.message);
      return res.status(403).send('Could not verify token');
    }
    req.user = user;
  });
  next();
};

// ROUTES

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
    //Extracting username and password from the req.body object
    const { username, password } = req.body;

    // Find user by username
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    //Checking if user exists in database
    if (userResult.rows.length === 0) {
      return res
        .status(401)
        .json({ msg: 'Invalid credentials! No username found' });
    }

    const user = userResult.rows[0];

    // Comparing provided password with password retrieved from database
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (isPasswordMatch) {
      const accessToken = jwt.sign(
        { username },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '3600s' }
      );
      const refreshToken = jwt.sign(
        { username },
        process.env.JWT_REFRESH_SECRET
      );

      // Simpan refresh token ke database
      await pool.query(
        'UPDATE users SET refresh_token = $1 WHERE user_id = $2',
        [refreshToken, user.user_id]
      );

      return res.status(200).json({
        message: 'User Logged in Successfully',
        username: req.body.username,
        accessToken,
        refreshToken,
      });
    } else {
      return res.status(401).json({ message: 'Invalid Credentials' });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: 'Server error', error: error.message });
  }
});

// Endpoint untuk memperbarui accessToken menggunakan refreshToken
app.post('/token', async (req, res) => {
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

    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ msg: 'Invalid refresh token' });
      }

      const accessToken = jwt.sign(
        { username: req.body.username },
        process.env.JWT_ACCESS_SECRET,
        {
          expiresIn: '3600s',
        }
      );

      res.json({ accessToken });
    });
  } catch (error) {
    console.error(error.message);
  }
});

// Endpoint logout untuk menghapus refreshToken dari database
app.delete('/authentications', authenticateToken, async (req, res) => {
  try {
    // Mencari userId berdasarkan username dari req.user
    const { username } = req.user;
    const userResult = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );

    const userId = userResult.rows[0].user_id;

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    await pool.query(
      'UPDATE users SET refresh_token = NULL WHERE user_id = $1',
      [userId]
    );

    res.json({ msg: 'Logged out successfully' });
  } catch (error) {
    console.error(error.message);
  }
});

// Create a Todo
app.post('/todos', authenticateToken, async (req, res) => {
  try {
    const { description } = req.body;

    const id = `todo-${uuidv4()}`;

    // Mencari userId berdasarkan username dari req.user
    const { username } = req.user;
    const userResult = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );

    const userId = userResult.rows[0].user_id;

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Membuat todo baru
    const newTodo = await pool.query(
      'INSERT INTO todo (todo_id, description) VALUES($1, $2) RETURNING *',
      [id, description]
    );

    // Associate todo with user
    await pool.query(
      'INSERT INTO user_tasks (user_id, todo_id) VALUES($1, $2)',
      [userId, id]
    );

    res.json(newTodo.rows[0]);
  } catch (error) {
    console.error(error.message);
  }
});

// Get all todos for a user
app.get('/todos', authenticateToken, async (req, res) => {
  try {
    // Mencari userId berdasarkan username dari req.user
    const { username } = req.user;
    const userResult = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );

    const userId = userResult.rows[0].user_id;

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

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

// Update a todo
app.put('/todos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, completed } = req.body;

    // Mencari userId berdasarkan username dari req.user
    const { username } = req.user;
    const userResult = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );

    const userId = userResult.rows[0].user_id;

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

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
      const updatedTodo = await pool.query(
        'UPDATE todo SET description = $1 WHERE todo_id = $2 RETURNING *',
        [description, id]
      );

      res.json(updatedTodo.rows[0]);
    }

    if (typeof completed !== 'undefined') {
      // Update completed jika disediakan dalam body
      await pool.query('UPDATE todo SET completed = $1 WHERE todo_id = $2', [
        completed,
        id,
      ]);
      res.json('Todo was updated!');
    }
  } catch (error) {
    console.error(error.message);
  }
});

// Delete a todo
app.delete('/todos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Mencari userId berdasarkan username dari req.user
    const { username } = req.user;
    const userResult = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );

    const userId = userResult.rows[0].user_id;

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

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

// // Update todo order
// app.put('/todos/reorder', async (req, res) => {
//   const { todos } = req.body; // Expects an array of todos with updated order
//   try {
//     const updatePromises = todos.map((todo, index) => {
//       return pool.query('UPDATE todo SET order = $1 WHERE todo_id = $2', [
//         index,
//         todo.todo_id,
//       ]);
//     });

//     await Promise.all(updatePromises);
//     res.json({ message: 'Order updated successfully' });
//   } catch (error) {
//     console.error(error.message);
//   }
// });

app.listen(process.env.PORT, () => {
  console.log('Server has started on port 5000');
});
