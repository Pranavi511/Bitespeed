import * as sqlite3 from "sqlite3";
const sqlite = sqlite3.verbose();

export const db = new sqlite.Database("contacts.db");

export interface Contact {
  id: number;
  phoneNumber: string | null;
  email: string | null;
  linkedId: number | null;
  linkPrecedence: "primary" | "secondary";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS Contact (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phoneNumber TEXT,
      email TEXT,
      linkedId INTEGER,
      linkPrecedence TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      deletedAt DATETIME
    )
  `);
});

// Promise wrappers around sqlite3 queries
export function dbAll(query: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err: Error | null, rows: any[]) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function dbGet(query: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err: Error | null, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function dbRun(query: string, params: any[] = []): Promise<sqlite3.RunResult> {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (this: sqlite3.RunResult, err: Error | null) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}