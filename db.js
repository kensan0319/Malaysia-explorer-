// SQLite 数据层：使用 Node 内置 node:sqlite，无需安装任何依赖
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, 'data', 'explore.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// status / created_by 为「用户投稿」预留：
//   status: published（公开）| pending（待审核）| rejected（已驳回）
//   created_by: NULL 表示官方内容，之后可存用户 ID
db.exec(`
CREATE TABLE IF NOT EXISTS islands (
  id          TEXT PRIMARY KEY,
  seq         INTEGER NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  short       TEXT NOT NULL,
  type        TEXT NOT NULL,
  region      TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  color       TEXT NOT NULL,
  cover_tint  TEXT NOT NULL,
  pos_x REAL NOT NULL, pos_y REAL NOT NULL, pos_z REAL NOT NULL,
  size_x REAL NOT NULL, size_y REAL NOT NULL, size_z REAL NOT NULL,
  feature     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','pending','rejected')),
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_islands_type ON islands(type);
CREATE INDEX IF NOT EXISTS idx_islands_status ON islands(status);
`);

const SEED = [
  ['MY001','吉隆坡 · 城市脉动','吉隆坡','城市','吉隆坡','CITY & CULTURE','探索马来西亚首都的天际线、双子塔、城市公园与多元文化街区。这里是现代城市与传统生活交会的起点。','🏙️','#63bd88','#d5f0e5',-5.4,0.15,1.5,1.7,.48,1.35,'city'],
  ['MY002','槟城 · 街头故事','槟城','历史','槟城','HERITAGE & FOOD','漫步乔治市历史街区，发现壁画、老店屋、街头美食与多元文化留下的城市印记。','🏘️','#7bc68a','#f0dfbe',-2.2,0.1,-2.5,1.55,.4,1.3,'heritage'],
  ['MY003','沙巴 · 山海秘境','沙巴','自然','沙巴','NATURE & ADVENTURE','从神山的高地风景到清澈海岛与珊瑚海域，探索婆罗洲丰富的自然景观与生态。','⛰️','#4ea878','#cce8dd',2.8,0.1,-2.1,1.9,.5,1.55,'mountain'],
  ['MY004','马六甲 · 时光之城','马六甲','历史','马六甲','HISTORY & CULTURE','沿着历史街区、河畔与传统建筑，认识马六甲海峡贸易历史和多元文化交融的故事。','🏛️','#8cc783','#f0d9c8',-1.1,0.1,3.1,1.55,.42,1.2,'heritage'],
  ['MY005','浮罗交怡 · 海岛慢旅','浮罗交怡','海岛','吉打','ISLAND & BEACH','在热带海滩、石灰岩地貌和绿意山林之间放慢脚步，感受马来西亚海岛的自然魅力。','🏝️','#69bf8b','#d2eee6',5.5,0.1,1.5,1.8,.4,1.45,'beach'],
];

const count = db.prepare('SELECT COUNT(*) AS n FROM islands').get().n;
if (count === 0) {
  const ins = db.prepare(`INSERT INTO islands
    (id,seq,name,short,type,region,category,description,emoji,color,cover_tint,pos_x,pos_y,pos_z,size_x,size_y,size_z,feature)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN');
  try {
    for (const r of SEED) ins.run(r[0], parseInt(r[0].slice(2), 10), ...r.slice(1));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  console.log(`[db] 已写入 ${SEED.length} 座示例岛屿`);
}

// 数据库行 → 前端使用的 JSON 结构
export function toIsland(r) {
  return {
    id: r.id, name: r.name, short: r.short, type: r.type, region: r.region,
    category: r.category, desc: r.description, emoji: r.emoji,
    color: r.color, coverTint: r.cover_tint,
    pos: [r.pos_x, r.pos_y, r.pos_z], size: [r.size_x, r.size_y, r.size_z],
    feature: r.feature,
  };
}

const PUBLIC = "status = 'published'";

export function listIslands({ type } = {}) {
  const rows = type && type !== '全部'
    ? db.prepare(`SELECT * FROM islands WHERE ${PUBLIC} AND type = ? ORDER BY seq`).all(type)
    : db.prepare(`SELECT * FROM islands WHERE ${PUBLIC} ORDER BY seq`).all();
  return rows.map(toIsland);
}

export function getIsland(id) {
  const r = db.prepare(`SELECT * FROM islands WHERE ${PUBLIC} AND id = ? COLLATE NOCASE`).get(String(id).trim());
  return r ? toIsland(r) : null;
}

// 搜索：精确 ID 优先，其次按名称/地区/简介模糊匹配
export function searchIslands(q) {
  q = String(q || '').trim().replace(/^#/, '');
  if (!q) return [];
  const exact = getIsland(q);
  const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
  const rows = db.prepare(`SELECT * FROM islands WHERE ${PUBLIC}
    AND (id LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR short LIKE ? ESCAPE '\\' OR region LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
    ORDER BY seq`).all(like, like, like, like, like).map(toIsland);
  return exact ? [exact, ...rows.filter(r => r.id !== exact.id)] : rows;
}
