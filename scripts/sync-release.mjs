#!/usr/bin/env node
/**
 * 将官网中的版本号、下载链接、文件名与体积同步到 GitHub 最新正式版。
 * 由 .github/workflows/sync-release.yml 在 Release 发布 / 手动 / 定时触发。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'zzyoxml/md3Music';
const API = `https://api.github.com/repos/${REPO}`;

const ASSET_RULES = [
  ['standard', /-standard-arm64-v8a\.apk$/i],
  ['apple', /-apple-music-arm64-v8a\.apk$/i],
  ['tv64', /-tv-arm64-v8a\.apk$/i],
  ['tv32', /-tv-armeabi-v7a\.apk$/i],
  ['windows', /^md3music-windows-.*\.zip$/i],
  ['symbols', /-symbols\.zip$/i],
];
const REQUIRED_ASSETS = ['standard', 'windows'];
const CHANGELOG_URL = 'https://raw.githubusercontent.com/zzyoxml/md3Music/rust-local-force/CHANGELOG.md';

const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'md3music-site-sync',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function api(pathname) {
  const res = await fetch(API + pathname, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${pathname} 返回 ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function displayTag(tag) {
  return tag.startsWith('v') ? tag : `v${tag}`;
}
function versionOf(tag) {
  return displayTag(tag).slice(1);
}
function dateOf(iso) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(iso));
}
function sizeOf(bytes) {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}
function assetMap(release) {
  const map = {};
  for (const [key, pattern] of ASSET_RULES) {
    const asset = release.assets.find((item) => pattern.test(item.name));
    if (asset) map[key] = asset;
  }
  return map;
}
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function parseChangelog(markdown) {
  const map = new Map();
  let current = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^##\s+v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\s*$/);
    if (heading) {
      current = { version: heading[1], items: [] };
      map.set(current.version, current.items);
      continue;
    }
    if (!current) continue;
    if (/^---+$/.test(line)) {
      current = null;
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      current.items.push(bullet[1].trim());
    } else if (line && !line.startsWith('#') && current.items.length) {
      current.items[current.items.length - 1] += ` ${line}`;
    }
  }
  return map;
}
function releaseItems(release) {
  return (release.body || '')
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
}
const GROUPS = [
  { title: '新增功能', test: /^(新增|支持|扩展|加入|实现|接入)/ },
  { title: '体验优化', test: /^(优化|调整|重构|改进|提升|降低|减少|压缩|统一|完善|延长|缩短)/ },
  { title: '问题修复', test: /^(修复|解决|处理)/ },
];
function groupItems(items) {
  const groups = GROUPS.map((group) => ({ title: group.title, items: [] }));
  const other = [];
  for (const item of items) {
    const index = GROUPS.findIndex((group) => group.test.test(item));
    if (index >= 0) groups[index].items.push(item);
    else other.push(item);
  }
  if (other.length) groups.push({ title: '其他改进', items: other });
  return groups.filter((group) => group.items.length);
}
const ASSET_LABELS = {
  standard: 'Android 标准版',
  apple: '随身听兼容版',
  tv64: 'TV 64 位',
  tv32: 'TV 32 位',
  windows: 'Windows 便携版',
};
function cardHtml(release, index, items) {
  const tag = displayTag(release.tag_name);
  const version = versionOf(release.tag_name);
  const id = `v${version.replace(/\D/g, '')}`;
  const badge = index === 0
    ? '<span class="badge-latest">最新</span>'
    : '<span class="badge-plain">上一版本</span>';
  const date = release.published_at
    ? `${dateOf(release.published_at)} · 构建于 ${new Date(release.published_at).toISOString().slice(11, 16)} UTC`
    : '';
  const groups = groupItems(items);
  const body = groups.length
    ? groups.map((group) => `        <h4>${group.title}</h4>\n        <ul>\n${group.items.map((item) => `          <li>${inlineMarkdown(item)}</li>`).join('\n')}\n        </ul>`).join('\n\n')
    : `        <p>本版本更新内容请见 <a href="${release.html_url}" target="_blank" rel="noopener">GitHub Release</a>。</p>`;
  const assets = assetMap(release);
  const files = Object.entries(ASSET_LABELS)
    .filter(([key]) => assets[key])
    .map(([key, label]) => `          <a data-asset="${key}" data-gh="${assets[key].browser_download_url}" href="${assets[key].browser_download_url}">${label}</a>`)
    .join('\n');
  return `      <article class="log-card reveal" id="${id}" data-log-version="${tag}">
        <div class="log-head">
          <h2>${tag}</h2>
          ${badge}
          <span class="date">${date}</span>
        </div>
${body}
${files ? `        <div class="files-inline">\n${files}\n        </div>\n` : ''}      </article>`;
}
async function fetchChangelog() {
  const res = await fetch(`${CHANGELOG_URL}?t=${Date.now()}`, { headers: { 'User-Agent': 'md3music-site-sync' } });
  if (!res.ok) throw new Error(`CHANGELOG.md 返回 ${res.status}`);
  return res.text();
}
function setText(html, attr, value) {
  const re = new RegExp(`(<([a-z]+)\\b[^>]*\\b${attr}\\b[^>]*>)([^<]*)(</\\2>)`, 'g');
  return html.replace(re, (match, open, _tag, _inner, close) => open + value + close);
}
function updateAssets(html, assets, version) {
  let out = html;
  for (const [key, asset] of Object.entries(assets)) {
    const openRe = new RegExp(`<a\\b[^>]*\\bdata-asset="${key}"[^>]*>`, 'g');

    out = out.replace(openRe, (tag) => {
      let next = tag.replace(/\bdata-gh="[^"]*"/, `data-gh="${asset.browser_download_url}"`);
      if (!/\bdata-gh=/.test(next)) {
        next = next.replace(/>$/, ` data-gh="${asset.browser_download_url}">`);
      }
      return next.replace(/\shref="[^"]*"/, ` href="${asset.browser_download_url}"`);
    });

    const blockRe = new RegExp(`<a\\b[^>]*\\bdata-asset="${key}"[^>]*>[\\s\\S]*?</a>`, 'g');
    out = out.replace(blockRe, (block) => {
      let next = block;
      next = next.replace(/(<span class="name">)([^<]*)(<\/span>)/, (_m, open, _old, close) => open + asset.name + close);
      next = next.replace(/(<span class="n">)([^<]*)(<\/span>)/, (_m, open, inner, close) => (
        open + inner.replace(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/g, version) + close
      ));
      next = next.replace(/(<span class="size">)[^<]*(<\/span>)/, (_m, open, close) => open + sizeOf(asset.size) + close);
      next = next.replace(/(<span class="s">)[^<]*(<\/span>)/, (_m, open, close) => open + sizeOf(asset.size) + close);
      return next;
    });
  }
  return out;
}
/**
 * 只把「本轮确实改动过」的页面 URL 的 lastmod 刷新为当前时刻。
 *
 * 依据 Bing 官方（2025-07 Keeping Content Discoverable with Sitemaps）：
 *  - lastmod 必须写内容的真实最后修改时间，不能一律写生成时间，否则会被判无效；
 *  - 必须使用带时间的 ISO 8601（如 2026-11-28T10:30:00+08:00），仅日期会削弱信号；
 *  - changefreq / priority 已被 Bing 忽略，故不写入。
 */
const PAGE_URLS = {
  'index.html': 'https://md3music.ccwu.cc/',
  'download.html': 'https://md3music.ccwu.cc/download',
  'changelog.html': 'https://md3music.ccwu.cc/changelog',
};
function isoNowShanghai() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+08:00`;
}
/**
 * @param {string} xml 现有 sitemap
 * @param {string[]} changedFiles 本轮发生变化的页面文件名
 * @returns {{xml: string, updated: string[]}}
 */
function refreshSitemap(xml, changedFiles) {
  const stamp = isoNowShanghai();
  const updated = [];
  let out = xml;
  for (const file of changedFiles) {
    const loc = PAGE_URLS[file];
    if (!loc) continue;
    // 仅替换该 loc 对应 <url> 块内的 lastmod，不存在则补一个
    const blockRe = new RegExp(`(<url>\\s*<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>\\s*)(?:<lastmod>[^<]*</lastmod>)?`, 'g');
    let hit = false;
    out = out.replace(blockRe, (_m, head) => {
      hit = true;
      return `${head}<lastmod>${stamp}</lastmod>`;
    });
    if (hit) updated.push(loc);
  }
  return { xml: out, updated };
}
function readFile(name) {
  return fs.readFile(path.join(ROOT, name), 'utf8');
}
function writeIfChanged(name, before, after) {
  if (before === after) {
    console.log(`${name}: 无变化`);
    return false;
  }
  return fs.writeFile(path.join(ROOT, name), after).then(() => {
    console.log(`${name}: 已更新`);
    return true;
  });
}

const releases = (await api('/releases?per_page=10')).filter((r) => !r.draft && !r.prerelease);
if (!releases.length) throw new Error('仓库暂无正式 Release');

const latest = releases[0];
const previous = releases[1];
const tag = displayTag(latest.tag_name);
const version = versionOf(latest.tag_name);
const date = dateOf(latest.published_at);
const prevTag = previous ? displayTag(previous.tag_name) : '';
const prevVersion = previous ? versionOf(previous.tag_name) : '';
const prevDate = previous ? dateOf(previous.published_at) : '';
const latestAssets = assetMap(latest);
const prevAssets = previous ? assetMap(previous) : {};

for (const key of REQUIRED_ASSETS) {
  if (!latestAssets[key]) throw new Error(`最新 Release 缺少必需产物：${key}`);
}

console.log(`最新正式版：${tag}（${date}）`);
if (previous) console.log(`上一版本：${prevTag}（${prevDate}）`);

/* ---------- index.html ---------- */
let index = await readFile('index.html');
index = setText(index, 'data-latest-version', tag);
index = setText(index, 'data-latest-date', date);
if (prevTag) index = setText(index, 'data-previous-version', prevTag);
index = updateAssets(index, latestAssets, version);

/* ---------- download.html ---------- */
let download = await readFile('download.html');
download = setText(download, 'data-latest-version', tag);
download = setText(download, 'data-latest-date', date);
if (prevTag) {
  download = setText(download, 'data-previous-version', prevTag);
  download = setText(download, 'data-previous-date', prevDate);
}
const splitAt = download.indexOf('<!-- 上一版本 -->');
if (splitAt < 0) throw new Error('download.html 中未找到上一版本标记');
const latestPart = updateAssets(download.slice(0, splitAt), latestAssets, version);
const previousPart = updateAssets(download.slice(splitAt), prevAssets, prevVersion);
download = latestPart + previousPart;

/* ---------- changelog.html ---------- */
const changelogSource = await readFile('changelog.html');
let changelog = setText(changelogSource, 'data-latest-version', tag);

let changelogMap = new Map();
try {
  changelogMap = parseChangelog(await fetchChangelog());
} catch (error) {
  console.warn(`更新日志同步跳过：${error.message}`);
}

if (changelogMap.size) {
  const logsHtml = releases.slice(0, 2).map((release, index) => {
    const releaseVersion = versionOf(release.tag_name);
    const items = changelogMap.get(releaseVersion) || releaseItems(release);
    return cardHtml(release, index, items);
  }).join('\n\n');
  const startToken = '<!-- LOGS:START -->';
  const endToken = '<!-- LOGS:END -->';
  const start = changelog.indexOf(startToken);
  const end = changelog.indexOf(endToken, start + startToken.length);
  if (start >= 0 && end > start) {
    changelog = `${changelog.slice(0, start + startToken.length)}\n${logsHtml}\n      ${changelog.slice(end)}`;
  } else {
    console.warn('changelog.html 缺少 LOGS 标记，保留现有卡片');
  }
}

const changelogHref = (v) => {
  const id = `v${v.replace(/\D/g, '')}`;
  return changelog.includes(`id="${id}"`) ? `/changelog#${id}` : '/changelog';
};
if (prevTag) {
  download = download.replace(/href="(?:\/)?changelog(?:\.html)?#[^"]*"(\s+data-previous-log)/, (_m, tail) => `href="${changelogHref(prevVersion)}"${tail}`);
}

let changed = false;
const changedFiles = [];
if (await writeIfChanged('index.html', await readFile('index.html'), index)) {
  changed = true;
  changedFiles.push('index.html');
}
if (await writeIfChanged('download.html', await readFile('download.html'), download)) {
  changed = true;
  changedFiles.push('download.html');
}
if (await writeIfChanged('changelog.html', await readFile('changelog.html'), changelog)) {
  changed = true;
  changedFiles.push('changelog.html');
}

/* ---------- sitemap.xml：仅刷新本轮真正改动页面的 lastmod ---------- */
const sitemapSource = await readFile('sitemap.xml');
if (changedFiles.length) {
  const { xml: nextSitemap, updated } = refreshSitemap(sitemapSource, changedFiles);
  if (!updated.length) console.warn('sitemap.xml 未匹配到改动页面的 <loc>，已跳过');
  else {
    console.log(`sitemap.xml: 刷新 lastmod → ${updated.join(', ')}`);
    await writeIfChanged('sitemap.xml', sitemapSource, nextSitemap);
  }
} else {
  console.log('sitemap.xml: 无页面改动，保持原样');
}

console.log(changed ? `同步完成：${tag}` : `已是最新版本 ${tag}`);
