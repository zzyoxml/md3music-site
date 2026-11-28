#!/usr/bin/env node
/**
 * 将 sitemap.xml 中的全部 URL 推送给 IndexNow（Bing / Yandex / Seznam 共用端点）。
 *
 * 由 .github/workflows/indexnow.yml 在站点内容变更后自动调用，
 * 缩短搜索引擎的发现周期，减少对自然抓取的依赖。
 *
 * 依赖仓库根目录的 IndexNow key 文件：文件名与文件内容均为 key。
 * 该文件必须能通过 https://<host>/<key>.txt 公开访问，否则 IndexNow 返回 403。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY_FILE = '90c901841d8d40b4a737d1ed83887659.txt';
const UA = 'md3music-site-indexnow';

const key = (await fs.readFile(path.join(ROOT, KEY_FILE), 'utf8')).trim();
if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
  throw new Error(`IndexNow key 格式非法：${KEY_FILE}`);
}

const xml = await fs.readFile(path.join(ROOT, 'sitemap.xml'), 'utf8');
const urlList = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
if (!urlList.length) {
  throw new Error('sitemap.xml 中未解析到任何 <loc>');
}

// IndexNow 要求单次提交的 URL 同属一个 host
const hosts = new Set(urlList.map((url) => new URL(url).host));
if (hosts.size !== 1) {
  throw new Error(`sitemap.xml 含多个 host：${[...hosts].join(', ')}`);
}
const host = [...hosts][0];
const keyLocation = `https://${host}/${path.basename(KEY_FILE)}`;

// 先确认 key 文件已随站点部署，否则提交必然 403
const probe = await fetch(keyLocation, { headers: { 'User-Agent': UA } });
if (!probe.ok) {
  throw new Error(`key 文件不可访问：${keyLocation} → HTTP ${probe.status}`);
}
if ((await probe.text()).trim() !== key) {
  throw new Error(`key 文件内容与预期不符：${keyLocation}`);
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA },
  body: JSON.stringify({ host, key, keyLocation, urlList }),
});

// 200 = 已接受；202 = 已接受待验证
if (!res.ok) {
  throw new Error(`IndexNow 返回 HTTP ${res.status}：${await res.text()}`);
}

console.log(`IndexNow 已接受 ${urlList.length} 条 URL（HTTP ${res.status}）`);
for (const url of urlList) console.log(`  - ${url}`);
