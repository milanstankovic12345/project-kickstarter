CREATE TABLE users (id serial primary key, email text unique not null, hash text not null);
