const { createDatabase, initializeSchema, migrateDatabase } = require('./database');

const db = createDatabase();

module.exports = db;
module.exports.createDatabase = createDatabase;
module.exports.initializeSchema = initializeSchema;
module.exports.migrateDatabase = migrateDatabase;
