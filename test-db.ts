import Database from "better-sqlite3";
const db = new Database(":memory:");
console.log("Database opened");
db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
db.prepare("INSERT INTO test DEFAULT VALUES").run();
console.log(db.prepare("SELECT * FROM test").get());
