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

  // Import Preview Route
  app.post("/api/import/preview", upload.single("file"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const extension = path.extname(fileName).toLowerCase();

    if (extension !== ".zip") {
      // For single files, show a simple preview
      return res.json({
        tempId: req.file.filename,
        structure: {
          name: fileName.replace(extension, ""),
          type: 'article',
          content: 'Single file import',
          extension
        }
      });
    }

    try {
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      const zipName = fileName.replace(/\.zip$/i, "");
      
      let structure: any = {
        name: zipName,
        type: 'folder',
        children: []
      };

      const jsonEntry = zipEntries.find(entry => entry.entryName.endsWith(".json") && !entry.isDirectory);
      if (jsonEntry) {
        try {
          const jsonData = JSON.parse(jsonEntry.getData().toString('utf8'));
          const normalize = (data: any): any => {
            if (Array.isArray(data)) return data.map(normalize);
            if (typeof data === 'object' && data !== null) {
               const name = data.name || data.title || data.folder_name || "Untitled";
               const children = (data.children || data.folders || data.subfolders || []).map(normalize);
               const articles = (data.articles || []).map((a: any) => ({
                 name: a.title || a.name || "Untitled Article",
                 type: 'article',
                 content: a.content || a.body || "",
                 tags: Array.isArray(a.tags) ? a.tags.join(",") : (a.tags || "")
               }));
               return { name, type: 'folder', children: [...children, ...articles] };
            }
            return { name: String(data), type: 'folder', children: [] };
          };
          const normalized = Array.isArray(jsonData) ? jsonData.map(normalize) : [normalize(jsonData)];
          structure.children = normalized;
        } catch (e) {
          console.error("JSON parse error in preview:", e);
        }
      } else {
        // Legacy detection for preview
        const cardsEntry = zipEntries.find(e => e.entryName.startsWith("cards/") && e.isDirectory);
        if (cardsEntry) {
          structure.children.push({ name: "Legacy Knowledge Base Structure", type: 'folder', children: [] });
        } else {
          // Just list files if nothing else
          zipEntries.filter(e => !e.isDirectory).slice(0, 20).forEach(e => {
            structure.children.push({ name: e.entryName, type: 'article' });
          });
        }
      }

      res.json({
        tempId: req.file.filename,
        structure
      });
    } catch (err) {
      console.error("ZIP preview error:", err);
      res.status(500).json({ error: "Failed to parse ZIP" });
    }
  });

  // Import Confirm Route
  app.post("/api/import/confirm", async (req, res) => {
    const { tempId, structure, folderId } = req.body;
    const filePath = path.join("uploads", tempId);
    
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: "Upload session expired or file not found" });
    }

    try {
      const importStructure = (item: any, parent: number | null) => {
        if (item.type === 'folder') {
          const res = db.prepare("INSERT INTO folders (name, parent_id) VALUES (?, ?)").run(item.name, parent);
          const newId = res.lastInsertRowid as number;
          if (item.children) {
            item.children.forEach((child: any) => importStructure(child, newId));
          }
        } else if (item.type === 'article') {
          db.prepare("INSERT INTO articles (title, content, tags, folder_id) VALUES (?, ?, ?, ?)")
            .run(item.name, item.content || "", item.tags || "", parent);
        }
      };

      const isZip = tempId.toLowerCase().endsWith(".zip") || structure.extension === ".zip";
      // Actually, multer saves files without extensions sometimes depending on config, 
      // but here we can check the original filename if we stored it, or just try AdmZip.
      
      let zip: any = null;
      try {
        zip = new AdmZip(filePath);
      } catch (e) {
        // Not a ZIP
      }

      if (zip) {
        const zipEntries = zip.getEntries();
        const jsonEntry = zipEntries.find(entry => entry.entryName.endsWith(".json") && !entry.isDirectory);

        if (jsonEntry) {
          // Use the structure provided by the user (which might have renames)
          importStructure(structure, folderId);
        } else {
          // Fallback to the original ZIP logic if it was a legacy structure
          const rootFolderResult = db.prepare("INSERT INTO folders (name, parent_id) VALUES (?, ?)").run(structure.name, folderId);
          const rootFolderId = rootFolderResult.lastInsertRowid as number;

          const tempDir = path.join("uploads", `extract_${Date.now()}`);
          fs.mkdirSync(tempDir, { recursive: true });
          zip.extractAllTo(tempDir, true);

          const cardsDir = path.join(tempDir, "cards");
          const resourcesDir = path.join(tempDir, "resources");
          const foldersDir = path.join(tempDir, "folders");

          const publicResourcesDir = path.join("public", "resources");
          if (!fs.existsSync(publicResourcesDir)) fs.mkdirSync(publicResourcesDir, { recursive: true });
          if (fs.existsSync(resourcesDir)) {
            const resourceFiles = fs.readdirSync(resourcesDir);
            for (const resFile of resourceFiles) {
              fs.copyFileSync(path.join(resourcesDir, resFile), path.join(publicResourcesDir, resFile));
            }
          }

          const articleMap = new Map<string, number>();
          if (fs.existsSync(cardsDir)) {
            const cardFiles = fs.readdirSync(cardsDir);
            const yamlFiles = cardFiles.filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
            for (const yamlFile of yamlFiles) {
              try {
                const yamlContent = fs.readFileSync(path.join(cardsDir, yamlFile), "utf8");
                const yamlData = yaml.load(yamlContent) as any;
                if (!yamlData) continue;
                const title = yamlData.Title || yamlData.title || yamlFile.replace(/\.ya?ml$/, "");
                const externalId = yamlData.ExternalId || yamlData.id;
                if (!externalId) continue;
                const htmlPath = path.join(cardsDir, `${externalId}.html`);
                if (!fs.existsSync(htmlPath)) continue;
                let tagsArr: string[] = [];
                const rawTags = yamlData.Tags || yamlData.tags;
                if (Array.isArray(rawTags)) tagsArr = rawTags.map((t: string) => t.replace(/^Support Tags:/i, "").toLowerCase().trim());
                const htmlContent = fs.readFileSync(htmlPath, "utf8");
                const updatedHtml = htmlContent.replace(/src=["']resources\/(.*?)["']/g, 'src="/resources/$1"');
                const markdownContent = NodeHtmlMarkdown.translate(updatedHtml);
                const result = db.prepare("INSERT INTO articles (title, content, tags, folder_id) VALUES (?, ?, ?, ?)").run(title, markdownContent, tagsArr.join(","), rootFolderId);
                articleMap.set(externalId.toString(), result.lastInsertRowid as number);
              } catch (e) {}
            }
          }

          if (fs.existsSync(foldersDir)) {
            const folderFiles = fs.readdirSync(foldersDir);
            for (const fFile of folderFiles) {
              if (fFile.endsWith(".yaml") || fFile.endsWith(".yml")) {
                try {
                  const fContent = fs.readFileSync(path.join(foldersDir, fFile), "utf8");
                  const fData = yaml.load(fContent) as any;
                  const fTitle = fData.Title || fData.title || fFile.replace(/\.ya?ml$/, "");
                  const folderResult = db.prepare("INSERT INTO folders (name, parent_id) VALUES (?, ?)").run(fTitle, rootFolderId);
                  const newFolderId = folderResult.lastInsertRowid;
                  const fArticles = fData.Articles || fData.articles;
                  if (fArticles && Array.isArray(fArticles)) {
                    for (const artZipId of fArticles) {
                      const dbId = articleMap.get(artZipId.toString());
                      if (dbId) db.prepare("UPDATE articles SET folder_id = ? WHERE id = ?").run(newFolderId, dbId);
                    }
                  }
                } catch (e) {}
              }
            }
          }
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } else {
        // Single file import
        const extension = structure.extension || path.extname(tempId).toLowerCase();
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
          content = data.content || JSON.stringify(data, null, 2);
          tags = Array.isArray(data.tags) ? data.tags.join(",") : (data.tags || "");
        } else {
          content = fs.readFileSync(filePath, "utf8");
        }

        db.prepare("INSERT INTO articles (title, content, tags, folder_id) VALUES (?, ?, ?, ?)")
          .run(structure.name, content, tags, folderId);
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Confirm import error:", err);
      res.status(500).json({ error: "Import failed" });
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  // Import Route (Batch & ZIP) - Keep as fallback or for single files
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
          
          // 1. Create a top-level folder for the ZIP
          const zipName = fileName.replace(/\.zip$/i, "");
          const rootFolderResult = db.prepare("INSERT INTO folders (name, parent_id) VALUES (?, ?)").run(zipName, folderId);
          const rootFolderId = rootFolderResult.lastInsertRowid as number;
          
          // Check for a .json file that defines the structure
          const jsonEntry = zipEntries.find(entry => entry.entryName.endsWith(".json") && !entry.isDirectory);
          
          if (jsonEntry) {
            try {
              const jsonData = JSON.parse(jsonEntry.getData().toString('utf8'));
              
              const createStructure = (data: any, parent: number) => {
                if (Array.isArray(data)) {
                  data.forEach(item => createStructure(item, parent));
                } else if (typeof data === 'object' && data !== null) {
                  const name = data.name || data.title || data.folder_name;
                  if (name) {
                    const res = db.prepare("INSERT INTO folders (name, parent_id) VALUES (?, ?)").run(name, parent);
                    const newId = res.lastInsertRowid as number;
                    
                    const children = data.children || data.folders || data.subfolders;
                    if (Array.isArray(children)) {
                      createStructure(children, newId);
                    }
                    
                    const articles = data.articles;
                    if (Array.isArray(articles)) {
                      articles.forEach((art: any) => {
                        const aTitle = art.title || art.name || "Untitled Article";
                        const aContent = art.content || art.body || "";
                        const aTags = Array.isArray(art.tags) ? art.tags.join(",") : (art.tags || "");
                        db.prepare("INSERT INTO articles (title, content, tags, folder_id) VALUES (?, ?, ?, ?)").run(aTitle, aContent, aTags, newId);
                      });
                    }
                  }
                } else if (typeof data === 'string') {
                  db.prepare("INSERT INTO folders (name, parent_id) VALUES (?, ?)").run(data, parent);
                }
              };
              
              createStructure(jsonData, rootFolderId);
              results.push({ title: zipName, success: true, message: "Imported structure from JSON" });
            } catch (err) {
              console.error("JSON parse error:", err);
              results.push({ fileName, error: "Failed to parse JSON structure" });
            }
          } else {
            // Fallback to existing logic but use rootFolderId as the parent
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
                  `).run(title, markdownContent, tags, rootFolderId);

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

                  const folderResult = db.prepare("INSERT INTO folders (name, parent_id) VALUES (?, ?)").run(fTitle, rootFolderId);
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
          }
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
      res.json({ folders, teams, articles, users, folderAccess, announcements });
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
