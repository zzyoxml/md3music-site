/* MD3Music 官网 · 交互脚本 */
(function () {
  'use strict';

  /* ---------- 主题 ---------- */
  var root = document.documentElement;
  root.classList.add('js');
  var STORE_THEME = 'md3-theme';
  var mql = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    var icon = document.getElementById('themeIcon');
    var use = icon && icon.querySelector('use');
    if (use) use.setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
      b.setAttribute('title', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    });
  }

  var saved = null;
  try { saved = localStorage.getItem(STORE_THEME); } catch (e) {}
  applyTheme(saved || (mql.matches ? 'dark' : 'light'));

  mql.addEventListener && mql.addEventListener('change', function (e) {
    var s = null;
    try { s = localStorage.getItem(STORE_THEME); } catch (err) {}
    if (!s) applyTheme(e.matches ? 'dark' : 'light');
  });

  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(STORE_THEME, next); } catch (e) {}
    });
  });

  /* ---------- 顶栏滚动 / 移动菜单 ---------- */
  var topbar = document.querySelector('.topbar');
  var fab = document.getElementById('toTop');
  function onScroll() {
    if (topbar) topbar.classList.toggle('scrolled', window.scrollY > 8);
    if (fab) fab.classList.toggle('show', window.scrollY > 480);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (fab) {
    fab.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  var nav = document.querySelector('.nav');
  var menuBtn = document.querySelector('.menu-btn');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- 进场动画 ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- 截图切换 ---------- */
  document.querySelectorAll('[data-gallery]').forEach(function (group) {
    group.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var id = tab.getAttribute('data-target');
        group.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        group.querySelectorAll('.gallery').forEach(function (g) { g.classList.remove('active'); });
        tab.classList.add('active');
        var target = group.querySelector('#' + id);
        if (target) target.classList.add('active');
      });
    });
  });

  /* ---------- 首屏截图置顶 ---------- */
  var heroShots = document.querySelectorAll('.hero-visual .shot');
  heroShots.forEach(function (shot) {
    function raise() {
      heroShots.forEach(function (s) { s.classList.toggle('is-front', s === shot); });
    }
    shot.addEventListener('click', raise);
    shot.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); raise(); }
    });
  });

  /* ---------- 下载镜像 ---------- */
  var MIRRORS = {
    github: { label: 'GitHub 直连', prefix: '' },
    ghfast: { label: 'ghfast.top', prefix: 'https://ghfast.top/' },
    ghproxy: { label: 'gh-proxy.com', prefix: 'https://gh-proxy.com/' },
    ghnet: { label: 'ghproxy.net', prefix: 'https://ghproxy.net/' }
  };
  var STORE_MIRROR = 'md3-mirror';

  function currentMirror() {
    var key = 'github';
    try { key = localStorage.getItem(STORE_MIRROR) || 'github'; } catch (e) {}
    return MIRRORS[key] ? key : 'github';
  }

  function refreshMirror() {
    var key = currentMirror();
    var prefix = MIRRORS[key].prefix;
    document.querySelectorAll('[data-gh]').forEach(function (a) {
      var base = a.getAttribute('data-gh');
      a.setAttribute('href', base ? prefix + base : '#');
    });
    document.querySelectorAll('[data-mirror]').forEach(function (chip) {
      var on = chip.getAttribute('data-mirror') === key;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-mirror-label]').forEach(function (el) {
      el.textContent = key === 'github' ? 'GitHub 直连' : MIRRORS[key].label + ' 镜像';
    });
  }

  document.querySelectorAll('[data-mirror]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      try { localStorage.setItem(STORE_MIRROR, chip.getAttribute('data-mirror')); } catch (e) {}
      refreshMirror();
    });
  });
  refreshMirror();

  /* ---------- 开发者文件展开 ---------- */
  document.querySelectorAll('[data-dev-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var on = document.body.classList.toggle('show-dev');
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      btn.querySelector('.txt').textContent = on ? '隐藏开发者文件' : '显示开发者文件（Symbols）';
      btn.querySelector('use').setAttribute('href', on ? '#i-chevron-down' : '#i-chevron-right');
    });
  });

  /* ---------- 页脚年份 ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
