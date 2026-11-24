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
const changelogHref = (v) => {
  const id = `v${v.replace(/\D/g, '')}`;
  return changelogSource.includes(`id="${id}"`) ? `changelog.html#${id}` : 'changelog.html';
};
if (prevTag) {
  download = download.replace(/href="changelog\.html#[^"]*"(\s+data-previous-log)/, (_m, tail) => `href="${changelogHref(prevVersion)}"${tail}`);
}

let changelog = changelogSource;
changelog = setText(changelog, 'data-latest-version', tag);

const logVersion = (changelog.match(/data-log-version="([^"]+)"/) || [])[1];
if (logVersion && logVersion !== tag) {
  console.log(`更新日志缺少 ${tag}，将最新记录标记为历史版本`);
  changelog = changelog.replace(
    /(<article\b[^>]*data-log-version="[^"]+"[^>]*>[\s\S]*?)<span class="badge-latest">最新<\/span>/,
    '$1<span class="badge-plain">历史版本</span>',
  );
  const note = `<svg class="icon"><use href="#i-info"></use></svg><p>最新版本 <strong>${tag}</strong> 已发布，更新说明与完整记录请见 <a href="${latest.html_url}" target="_blank" rel="noopener">GitHub Release</a>。</p>`;
  changelog = changelog.replace(
    /<div class="note-box reveal" id="latest-note"[^>]*>[\s\S]*?<\/div>/,
    `<div class="note-box reveal" id="latest-note">${note}</div>`,
  );
} else if (logVersion) {
  changelog = changelog.replace(
    /<div class="note-box reveal" id="latest-note"[^>]*>[\s\S]*?<\/div>/,
    '<div class="note-box reveal" id="latest-note" hidden></div>',
  );
}

let changed = false;
changed = (await writeIfChanged('index.html', await readFile('index.html'), index)) || changed;
changed = (await writeIfChanged('download.html', await readFile('download.html'), download)) || changed;
changed = (await writeIfChanged('changelog.html', await readFile('changelog.html'), changelog)) || changed;

console.log(changed ? `同步完成：${tag}` : `已是最新版本 ${tag}`);
