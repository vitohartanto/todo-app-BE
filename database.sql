CREATE DATABASE todo_app;

CREATE TABLE todo(
    todo_id VARCHAR(100) PRIMARY KEY,
    description VARCHAR(255),
    completed BOOLEAN DEFAULT FALSE,
    order_position INTEGER
);

CREATE TABLE users(
    user_id VARCHAR(100) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    refresh_token TEXT
);

CREATE TABLE user_tasks (
    user_id VARCHAR(100) REFERENCES users(user_id) ON DELETE CASCADE,
    todo_id VARCHAR(100) REFERENCES todo(todo_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, todo_id)
);