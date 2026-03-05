
import Database from "better-sqlite3";
const db = new Database("kb.db");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables:", tables);
const columnsQuizzes = db.prepare("PRAGMA table_info(quizzes)").all();
console.log("Quizzes columns:", columnsQuizzes);
const columnsArticles = db.prepare("PRAGMA table_info(articles)").all();
console.log("Articles columns:", columnsArticles);
db.close();
