const request = require('supertest');
const { app } = require('./index');
const pool = require('./db/pool');
// just testing if I can reproduce the 500 error for webhooks
