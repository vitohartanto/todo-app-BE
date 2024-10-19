CREATE DATABASE todo_app;

CREATE TABLE todo(
    todo_id SERIAL PRIMARY KEY,
    description VARCHAR(255),
    completed BOOLEAN DEFAULT FALSE,
    order_position INTEGER
);