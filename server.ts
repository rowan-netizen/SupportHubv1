import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("kb.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    team_id INTEGER,
    role TEXT DEFAULT 'viewer', -- 'admin', 'editor', 'viewer'
    FOREIGN KEY (team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS folder_access (
    folder_id INTEGER,
    team_id INTEGER,
    PRIMARY KEY (folder_id, team_id),
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    article_id INTEGER,
    team_id INTEGER, -- NULL means all teams
    sender_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    folder_id INTEGER,
    author_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS article_access (
    article_id INTEGER,
    team_id INTEGER,
    PRIMARY KEY (article_id, team_id),
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    team_id INTEGER, -- Target team, NULL for all
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    created_by INTEGER,
    status TEXT DEFAULT 'draft', -- 'draft', 'published'
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER,
    question TEXT NOT NULL,
    options TEXT NOT NULL, -- JSON array of strings
    correct_option_index INTEGER NOT NULL,
    feedback TEXT,
    article_id INTEGER,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS quiz_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER,
    user_id INTEGER,
    score INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Seed some initial data if empty
  INSERT OR IGNORE INTO teams (name) VALUES ('General'), ('Technical Support'), ('Billing'), ('Onboarding'), ('Line 1'), ('Line 2'), ('Line 3');
  INSERT OR IGNORE INTO users (name, email, team_id, role) VALUES ('Admin User', 'admin@supporthub.com', 1, 'admin');
`);

try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer'"); } catch (e) {}

try { db.exec("ALTER TABLE articles ADD COLUMN tags TEXT"); } catch (e) {}

import multer from "multer";
import yaml from "js-yaml";
import fs from "fs";
const pdf = require("pdf-parse");
const AdmZip = require("adm-zip");

import { NodeHtmlMarkdown } from "node-html-markdown";

const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB
});

async function startServer() {
  console.log("Starting server...");
  const app = express();
  app.use(express.json({ limit: "30mb" }));
  app.use(express.urlencoded({ limit: "30mb", extended: true }));

  // Ensure uploads directory exists
  if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
  }

  // Request logging
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);
    console.log(`[${new Date().toISOString()}] Headers: ${JSON.stringify(req.headers)}`);
    next();
  });

  // Import Route (Batch & ZIP)
  app.post(["/api/import", "/api/import/"], (req, res, next) => {
    console.log(`[${new Date().toISOString()}] POST /api/import - Start`);
    upload.array("files")(req, res, (err: any) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Multer error:`, err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: "File too large. Max size is 30MB." });
        }
        return res.status(400).json({ error: err.message });
      }
      console.log(`[${new Date().toISOString()}] Multer finished. Files: ${(req as any).files?.length || 0}`);
      next();
    });
  }, async (req: any, res) => {
    const folderId = req.body.folder_id ? parseInt(req.body.folder_id) : null;
    console.log(`[${new Date().toISOString()}] Processing import into folder: ${folderId}`);
    
    if (!req.files || req.files.length === 0) {
      console.warn(`[${new Date().toISOString()}] No files uploaded`);
      return res.status(400).json({ error: "No files uploaded" });
    }

    const results = [];

    for (const file of req.files) {
      const filePath = file.path;
      const fileName = file.originalname;
      const extension = path.extname(fileName).toLowerCase();

      try {
        if (extension === ".zip") {
          const zip = new AdmZip(filePath);
          const zipEntries = zip.getEntries();
          const tempDir = path.join("uploads", `extract_${Date.now()}`);
          fs.mkdirSync(tempDir, { recursive: true });
          zip.extractAllTo(tempDir, true);

          const cardsDir = path.join(tempDir, "cards");
          const resourcesDir = path.join(tempDir, "resources");
          const foldersDir = path.join(tempDir, "folders");

          // 1. Handle Resources
          const publicResourcesDir = path.join("public", "resources");
          if (!fs.existsSync(publicResourcesDir)) fs.mkdirSync(publicResourcesDir, { recursive: true });
          if (fs.existsSync(resourcesDir)) {
            const resourceFiles = fs.readdirSync(resourcesDir);
            for (const resFile of resourceFiles) {
              fs.copyFileSync(path.join(resourcesDir, resFile), path.join(publicResourcesDir, resFile));
            }
          }

          // 2. Handle Cards (Articles)
          const articleMap = new Map<string, number>(); // Map ZIP ID to DB ID
          if (fs.existsSync(cardsDir)) {
            const cardFiles = fs.readdirSync(cardsDir);
            const yamlFiles = cardFiles.filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));

            for (const yamlFile of yamlFiles) {
              const yamlPath = path.join(cardsDir, yamlFile);
              try {
                const yamlContent = fs.readFileSync(yamlPath, "utf8");
                const yamlData = yaml.load(yamlContent) as any;
                
                if (!yamlData) continue;

                const title = yamlData.Title || yamlData.title || yamlFile.replace(/\.ya?ml$/, "");
                const externalId = yamlData.ExternalId || yamlData.id;
                
                if (!externalId) {
                  console.warn(`No ExternalId found in ${yamlFile}`);
                  continue;
                }

                const htmlFile = `${externalId}.html`;
                const htmlPath = path.join(cardsDir, htmlFile);

                if (!fs.existsSync(htmlPath)) {
                  console.warn(`HTML file not found for ExternalId: ${externalId} (referenced in ${yamlFile})`);
                  continue;
                }

                let tagsArr: string[] = [];
                const rawTags = yamlData.Tags || yamlData.tags;
                if (Array.isArray(rawTags)) {
                  tagsArr = rawTags.map((t: string) => 
                    t.replace(/^Support Tags:/i, "").toLowerCase().trim()
                  );
                }
                const tags = tagsArr.join(",");

                const htmlContent = fs.readFileSync(htmlPath, "utf8");
                // Update resource paths in HTML if needed
                const updatedHtml = htmlContent.replace(/src=["']resources\/(.*?)["']/g, 'src="/resources/$1"');
                const markdownContent = NodeHtmlMarkdown.translate(updatedHtml);

                const result = db.prepare(`
                  INSERT INTO articles (title, content, tags, folder_id)
                  VALUES (?, ?, ?, ?)
                `).run(title, markdownContent, tags, folderId);

                articleMap.set(externalId.toString(), result.lastInsertRowid as number);
                results.push({ title, success: true });
              } catch (err) {
                console.error(`Error processing YAML ${yamlFile}:`, err);
                results.push({ fileName: yamlFile, error: "Failed to process metadata" });
              }
            }
          }

          // 3. Handle Folders
          if (fs.existsSync(foldersDir)) {
            const folderFiles = fs.readdirSync(foldersDir);
            for (const fFile of folderFiles) {
              if (fFile.endsWith(".yaml") || fFile.endsWith(".yml")) {
                const fPath = path.join(foldersDir, fFile);
                const fContent = fs.readFileSync(fPath, "utf8");
                const fData = yaml.load(fContent) as any;
                const fTitle = fData.Title || fData.title || fFile.replace(/\.ya?ml$/, "");

                const folderResult = db.prepare("INSERT INTO folders (name, parent_id) VALUES (?, ?)").run(fTitle, folderId);
                const newFolderId = folderResult.lastInsertRowid;

                const fArticles = fData.Articles || fData.articles;
                if (fArticles && Array.isArray(fArticles)) {
                  for (const artZipId of fArticles) {
                    const dbId = articleMap.get(artZipId.toString());
                    if (dbId) {
                      db.prepare("UPDATE articles SET folder_id = ? WHERE id = ?").run(newFolderId, dbId);
                    }
                  }
                }
              }
            }
          }

          // Cleanup temp extraction dir
          fs.rmSync(tempDir, { recursive: true, force: true });
        } else {
          // Handle single files as before
          let title = fileName.replace(extension, "");
          let content = "";
          let tags = "";

          if (extension === ".pdf") {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            content = data.text;
          } else if (extension === ".html" || extension === ".htm") {
            const fileContents = fs.readFileSync(filePath, "utf8");
            content = NodeHtmlMarkdown.translate(fileContents);
          } else if (extension === ".yaml" || extension === ".yml") {
            const fileContents = fs.readFileSync(filePath, "utf8");
            const data = yaml.load(fileContents) as any;
            title = data.title || title;
            content = data.content || JSON.stringify(data, null, 2);
            tags = Array.isArray(data.tags) ? data.tags.join(",") : (data.tags || "");
          } else {
            results.push({ fileName, error: "Unsupported file type" });
            continue;
          }

          const result = db.prepare(`
            INSERT INTO articles (title, content, tags, folder_id)
            VALUES (?, ?, ?, ?)
          `).run(title, content, tags, folderId);

          results.push({ id: result.lastInsertRowid, title, success: true });
        }
      } catch (error) {
        console.error(`Import error for ${fileName}:`, error);
        results.push({ fileName, error: "Failed to parse file" });
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    res.json({ results });
  });

  app.get("/api/initial-data", (req, res) => {
    try {
      const folders = db.prepare("SELECT * FROM folders").all();
      const teams = db.prepare("SELECT * FROM teams").all();
      const articles = db.prepare("SELECT * FROM articles").all();
      const users = db.prepare("SELECT u.*, t.name as team_name FROM users u LEFT JOIN teams t ON u.team_id = t.id").all();
      const folderAccess = db.prepare("SELECT * FROM folder_access").all();
      const announcements = db.prepare(`
        SELECT a.*, u.name as sender_name, art.title as article_title 
        FROM announcements a 
        LEFT JOIN users u ON a.sender_id = u.id 
        LEFT JOIN articles art ON a.article_id = art.id
        ORDER BY a.created_at DESC
      `).all();
      const quizzes = db.prepare(`
        SELECT q.*, t.name as team_name 
        FROM quizzes q 
        LEFT JOIN teams t ON q.team_id = t.id
        ORDER BY q.created_at DESC
      `).all();
      res.json({ folders, teams, articles, users, folderAccess, announcements, quizzes });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  app.get("/api/folders", (req, res) => {
    try {
      const folders = db.prepare("SELECT * FROM folders").all();
      res.json(folders);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/folders", (req, res) => {
    const { name, parent_id } = req.body;
    try {
      const result = db.prepare("INSERT INTO folders (name, parent_id) VALUES (?, ?)").run(name, parent_id);
      res.json({ id: result.lastInsertRowid, name, parent_id });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.put("/api/folders/:id", (req, res) => {
    const { name, parent_id } = req.body;
    try {
      db.prepare("UPDATE folders SET name = ?, parent_id = ? WHERE id = ?").run(name, parent_id, req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/folders/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM folders WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/articles", (req, res) => {
    const { folder_id, search } = req.query;
    let query = "SELECT * FROM articles";
    const params = [];

    if (search) {
      query += " WHERE (title LIKE ? OR content LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    } else if (folder_id) {
      query += " WHERE folder_id = ?";
      params.push(folder_id);
    }

    try {
      const articles = db.prepare(query).all(...params);
      res.json(articles);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/articles/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      console.log(`Fetching article details for ID: ${id}`);
      const article = db.prepare("SELECT * FROM articles WHERE id = ?").get(id);
      if (!article) {
        console.warn(`Article not found for ID: ${id}`);
        return res.status(404).json({ error: "Article not found" });
      }
      
      const access = db.prepare("SELECT team_id FROM article_access WHERE article_id = ?").all(id);
      res.json({ ...article, team_access: access.map((a: any) => a.team_id) });
    } catch (err) {
      console.error("Error fetching article details:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/articles", (req, res) => {
    const { title, content, tags, folder_id, expires_at, team_access } = req.body;
    try {
      const result = db.prepare(`
        INSERT INTO articles (title, content, tags, folder_id, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(title, content, tags, folder_id, expires_at);
      
      const articleId = result.lastInsertRowid;
      
      if (team_access && Array.isArray(team_access)) {
        const insertAccess = db.prepare("INSERT INTO article_access (article_id, team_id) VALUES (?, ?)");
        team_access.forEach((teamId: number) => {
          insertAccess.run(articleId, teamId);
        });
      }
      
      res.json({ id: articleId });
    } catch (err) {
      console.error("Error creating article:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.put("/api/articles/:id", (req, res) => {
    const { title, content, tags, folder_id, expires_at, team_access } = req.body;
    try {
      const id = parseInt(req.params.id);
      db.prepare(`
        UPDATE articles 
        SET title = ?, content = ?, tags = ?, folder_id = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(title, content, tags, folder_id, expires_at, id);
      
      // Update access
      db.prepare("DELETE FROM article_access WHERE article_id = ?").run(id);
      if (team_access && Array.isArray(team_access)) {
        const insertAccess = db.prepare("INSERT INTO article_access (article_id, team_id) VALUES (?, ?)");
        team_access.forEach((teamId: number) => {
          insertAccess.run(id, teamId);
        });
      }
      
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating article:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/admin/articles/batch-update", (req, res) => {
    const { articleIds, updates } = req.body;
    if (!articleIds || !Array.isArray(articleIds) || !updates) {
      return res.status(400).json({ error: "Invalid request" });
    }

    try {
      const { folder_id, expires_at } = updates;
      
      let query = "UPDATE articles SET ";
      const sets = [];
      const params = [];

      if (folder_id !== undefined) {
        sets.push("folder_id = ?");
        params.push(folder_id);
      }
      if (expires_at !== undefined) {
        sets.push("expires_at = ?");
        params.push(expires_at);
      }

      if (sets.length === 0) {
        return res.json({ success: true, message: "No updates provided" });
      }

      query += sets.join(", ") + ", updated_at = CURRENT_TIMESTAMP WHERE id IN (" + articleIds.map(() => "?").join(",") + ")";
      params.push(...articleIds);

      db.prepare(query).run(...params);
      res.json({ success: true });
    } catch (err) {
      console.error("Error batch updating articles:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.put("/api/articles/batch-move", (req, res) => {
    const { article_ids, folder_id } = req.body;
    if (!Array.isArray(article_ids)) return res.status(400).json({ error: "article_ids must be an array" });
    
    try {
      const update = db.prepare("UPDATE articles SET folder_id = ? WHERE id = ?");
      const transaction = db.transaction((ids, fId) => {
        for (const id of ids) update.run(fId, id);
      });
      
      transaction(article_ids, folder_id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/articles/batch-delete", (req, res) => {
    const { article_ids } = req.body;
    if (!Array.isArray(article_ids)) return res.status(400).json({ error: "article_ids must be an array" });
    
    try {
      const del = db.prepare("DELETE FROM articles WHERE id = ?");
      const transaction = db.transaction((ids) => {
        for (const id of ids) del.run(id);
      });
      
      transaction(article_ids);
      res.json({ success: true });
    } catch (err) {
      console.error("Error batch deleting articles:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/articles/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM articles WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/teams", (req, res) => {
    try {
      const teams = db.prepare("SELECT * FROM teams").all();
      res.json(teams);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/expired", (req, res) => {
    try {
      const expired = db.prepare("SELECT * FROM articles WHERE expires_at < CURRENT_TIMESTAMP").all();
      res.json(expired);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // Admin Routes
  app.get("/api/admin/users", (req, res) => {
    try {
      const users = db.prepare("SELECT u.*, t.name as team_name FROM users u LEFT JOIN teams t ON u.team_id = t.id").all();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.put("/api/admin/users/:id", (req, res) => {
    const { name, email, team_id, role } = req.body;
    try {
      db.prepare("UPDATE users SET name = ?, email = ?, team_id = ?, role = ? WHERE id = ?")
        .run(name, email, team_id, role, req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/admin/users", (req, res) => {
    const { name, email, team_id, role } = req.body;
    try {
      const result = db.prepare("INSERT INTO users (name, email, team_id, role) VALUES (?, ?, ?, ?)")
        .run(name, email, team_id, role);
      res.json({ id: result.lastInsertRowid });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/admin/users/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/admin/teams", (req, res) => {
    try {
      const teams = db.prepare("SELECT * FROM teams").all();
      res.json(teams);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/admin/teams", (req, res) => {
    const { name } = req.body;
    try {
      const result = db.prepare("INSERT INTO teams (name) VALUES (?)").run(name);
      res.json({ id: result.lastInsertRowid, name });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/admin/teams/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM teams WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/admin/folder-access", (req, res) => {
    try {
      const access = db.prepare("SELECT * FROM folder_access").all();
      res.json(access);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/admin/folder-access", (req, res) => {
    const { folder_id, team_id } = req.body;
    try {
      db.prepare("INSERT OR IGNORE INTO folder_access (folder_id, team_id) VALUES (?, ?)").run(folder_id, team_id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/admin/folder-access", (req, res) => {
    const { folder_id, team_id } = req.body;
    try {
      db.prepare("DELETE FROM folder_access WHERE folder_id = ? AND team_id = ?").run(folder_id, team_id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // Announcement Routes
  app.get("/api/announcements", (req, res) => {
    const { team_id } = req.query;
    try {
      let query = `
        SELECT a.*, u.name as sender_name, art.title as article_title 
        FROM announcements a 
        LEFT JOIN users u ON a.sender_id = u.id 
        LEFT JOIN articles art ON a.article_id = art.id
      `;
      const params = [];
      if (team_id) {
        query += " WHERE a.team_id IS NULL OR a.team_id = ?";
        params.push(team_id);
      }
      query += " ORDER BY a.created_at DESC LIMIT 50";
      
      const announcements = db.prepare(query).all(...params);
      res.json(announcements);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/announcements", (req, res) => {
    const { message, article_id, team_id, sender_id } = req.body;
    try {
      const result = db.prepare(`
        INSERT INTO announcements (message, article_id, team_id, sender_id)
        VALUES (?, ?, ?, ?)
      `).run(message, article_id, team_id, sender_id);
      res.json({ id: result.lastInsertRowid });
    } catch (err) {
      console.error("Error creating announcement:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // Quiz Routes
  app.get("/api/admin/quiz-content", (req, res) => {
    const { days } = req.query;
    const daysInt = parseInt(days as string) || 7;
    try {
      const articles = db.prepare(`
        SELECT title, content, updated_at 
        FROM articles 
        WHERE updated_at >= datetime('now', ?)
      `).all(`-${daysInt} days`);
      
      const announcements = db.prepare(`
        SELECT message, created_at 
        FROM announcements 
        WHERE created_at >= datetime('now', ?)
      `).all(`-${daysInt} days`);
      
      res.json({ articles, announcements });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/quizzes", (req, res) => {
    try {
      const quizzes = db.prepare(`
        SELECT q.*, t.name as team_name 
        FROM quizzes q 
        LEFT JOIN teams t ON q.team_id = t.id
        ORDER BY q.created_at DESC
      `).all();
      res.json(quizzes);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/quizzes/:id", (req, res) => {
    try {
      const quiz = db.prepare("SELECT * FROM quizzes WHERE id = ?").get(req.params.id);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const questions = db.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ?").all(req.params.id);
      res.json({ ...quiz, questions: questions.map((q: any) => ({ ...q, options: JSON.parse(q.options) })) });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/quizzes", (req, res) => {
    const { title, description, team_id, expires_at, created_by, questions, status } = req.body;
    try {
      const insertQuiz = db.prepare(`
        INSERT INTO quizzes (title, description, team_id, expires_at, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertQuestion = db.prepare(`
        INSERT INTO quiz_questions (quiz_id, question, options, correct_option_index, feedback, article_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction((qData) => {
        const result = insertQuiz.run(qData.title, qData.description, qData.team_id, qData.expires_at, qData.created_by, qData.status || 'draft');
        const quizId = result.lastInsertRowid;
        for (const q of qData.questions) {
          insertQuestion.run(quizId, q.question, JSON.stringify(q.options), q.correct_option_index, q.feedback || null, q.article_id || null);
        }
        return quizId;
      });

      const quizId = transaction({ title, description, team_id, expires_at, created_by, questions, status });
      res.json({ id: quizId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.put("/api/quizzes/:id", (req, res) => {
    const { title, description, team_id, expires_at, questions, status } = req.body;
    const quizId = req.params.id;
    try {
      const updateQuiz = db.prepare(`
        UPDATE quizzes SET title = ?, description = ?, team_id = ?, expires_at = ?, status = ?
        WHERE id = ?
      `);
      const deleteQuestions = db.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?");
      const insertQuestion = db.prepare(`
        INSERT INTO quiz_questions (quiz_id, question, options, correct_option_index, feedback, article_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction((qData) => {
        updateQuiz.run(qData.title, qData.description, qData.team_id, qData.expires_at, qData.status, quizId);
        deleteQuestions.run(quizId);
        for (const q of qData.questions) {
          insertQuestion.run(quizId, q.question, JSON.stringify(q.options), q.correct_option_index, q.feedback || null, q.article_id || null);
        }
      });

      transaction({ title, description, team_id, expires_at, questions, status });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/quizzes/:id/submit", (req, res) => {
    const { user_id, score, total_questions } = req.body;
    const quizId = req.params.id;
    try {
      db.prepare(`
        INSERT INTO quiz_submissions (quiz_id, user_id, score, total_questions)
        VALUES (?, ?, ?, ?)
      `).run(quizId, user_id, score, total_questions);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/quizzes/:id/stats", (req, res) => {
    const quizId = req.params.id;
    try {
      const quiz = db.prepare("SELECT * FROM quizzes WHERE id = ?").get(quizId);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });

      // Submissions with user info
      const submissions = db.prepare(`
        SELECT s.*, u.name as user_name, t.name as team_name
        FROM quiz_submissions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN teams t ON u.team_id = t.id
        WHERE s.quiz_id = ?
        ORDER BY s.submitted_at DESC
      `).all(quizId);

      // Average score
      const avgScore = db.prepare(`
        SELECT AVG(CAST(score AS FLOAT) / total_questions * 100) as average
        FROM quiz_submissions
        WHERE quiz_id = ?
      `).get(quizId);

      // Team averages
      const teamAverages = db.prepare(`
        SELECT t.name as team_name, AVG(CAST(s.score AS FLOAT) / s.total_questions * 100) as average
        FROM quiz_submissions s
        JOIN users u ON s.user_id = u.id
        JOIN teams t ON u.team_id = t.id
        WHERE s.quiz_id = ?
        GROUP BY t.id
      `).all(quizId);

      // Pending users (users in the target team who haven't submitted)
      let pendingUsers = [];
      if (quiz.team_id) {
        pendingUsers = db.prepare(`
          SELECT u.id, u.name, u.email
          FROM users u
          WHERE u.team_id = ? 
          AND u.id NOT IN (SELECT user_id FROM quiz_submissions WHERE quiz_id = ?)
        `).all(quiz.team_id, quizId);
      } else {
        pendingUsers = db.prepare(`
          SELECT u.id, u.name, u.email
          FROM users u
          WHERE u.id NOT IN (SELECT user_id FROM quiz_submissions WHERE quiz_id = ?)
        `).all(quizId);
      }

      res.json({
        submissions,
        averageScore: avgScore.average || 0,
        teamAverages,
        pendingUsers
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/quizzes/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM quizzes WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // Explicit 404 for API routes to prevent falling through to Vite
  app.use("/api", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Serve resources statically
  app.use("/resources", express.static(path.join(__dirname, "public", "resources")));

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware initialized");
    } catch (err) {
      console.error("Failed to initialize Vite middleware:", err);
    }
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
