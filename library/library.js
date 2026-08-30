/* Kütüphane sayfası: kaydedilen videolar, projeler, içe/dışa aktarma.
 *
 * Veri storage.local'daki tek "library" anahtarında durur ve sayfa
 * storage.onChanged'i dinler: açık bir YouTube sekmesi menüden video
 * eklediğinde burası kendini yeniler, elle tazelemek gerekmez.
 */
(function () {
  "use strict";

  var api = (typeof browser !== "undefined" ? browser : chrome);
  var T = OBI18n;
  var P = OBParse;

  var lib = { projects: [], items: [] };
  var current = "all";        /* "all" | "inbox" | proje kimliği */
  var query = "";

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function projectId() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function projectOf(id) {
    for (var i = 0; i < lib.projects.length; i++) {
      if (lib.projects[i].id === id) return lib.projects[i];
    }
    return null;
  }

  /* Projesi silinmiş ya da hiç atanmamış her video gelen kutusundadır. */
  function bucketOf(item) {
    return item.projectId && projectOf(item.projectId) ? item.projectId : "inbox";
  }

  /* Her değişiklik depodaki güncel kopyaya uygulanır (oku-değiştir-yaz):
   * sayfanın bellekteki kopyasını toptan yazmak, yazma ile onChanged yankısı
   * arasındaki milisaniyelik pencerede bir YouTube sekmesinin az önce
   * eklediği videoyu ezebiliyordu. Kendi yankımız yine yutulmuyor: yankı
   * yazılanla aynı veridir, depo tek gerçek kaynak kalır. */
  function persist(mutate) {
    return OBStore.readLibrary().then(function (fresh) {
      mutate(fresh);
      return OBStore.writeLibrary(fresh).then(function () {
        lib = fresh;
        render();
      });
    });
  }

  /* confirm() penceresi yok: Firefox'un eklenti sekmelerinde dialoglar
   * güvenilmez davranabiliyor ve olay döngüsünü bloklamaları başka hatalar
   * doğuruyor. Silme iki adım: ilk tık düğmeyi "Silinsin?" yapar, 3 saniye
   * içinde ikinci tık siler. */
  function armedDelete(btn, onDelete) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (btn.dataset.armed) { onDelete(); return; }
      btn.dataset.armed = "1";
      var old = btn.textContent;
      btn.textContent = T.t("libConfirmDelete");
      btn.classList.add("armed");
      setTimeout(function () {
        delete btn.dataset.armed;
        btn.textContent = old;
        btn.classList.remove("armed");
      }, 3000);
    });
  }

  /* --- Kenar çubuğu ---------------------------------------------------- */

  function counts() {
    var map = { all: lib.items.length, inbox: 0 };
    lib.items.forEach(function (item) {
      var b = bucketOf(item);
      map[b] = (map[b] || 0) + 1;
    });
    return map;
  }

  function navRow(id, name, count, fixed) {
    var row = el("div", "nav-row" + (current === id ? " active" : ""));
    row.appendChild(el("span", "nav-name", name));
    row.appendChild(el("span", "nav-count", String(count || 0)));
    row.addEventListener("click", function () {
      current = id;
      render();
    });
    if (!fixed) {
      var rename = el("button", "nav-act", "✎");
      rename.type = "button";
      rename.title = T.t("libRenameProject");
      rename.addEventListener("click", function (e) {
        e.stopPropagation();
        editName(row, id);
      });
      var del = el("button", "nav-act", "×");
      del.type = "button";
      del.title = T.t("libDeleteProject") + ". " + T.t("libDeleteProjectHint") + ".";
      armedDelete(del, function () {
        if (current === id) current = "inbox";
        persist(function (l) {
          l.projects = l.projects.filter(function (q) { return q.id !== id; });
        });
      });
      row.appendChild(rename);
      row.appendChild(del);
    }
    return row;
  }

  function editName(row, id) {
    var p = projectOf(id);
    if (!p) return;
    var input = el("input", "nav-edit");
    input.value = p.name;
    row.textContent = "";
    row.appendChild(input);
    input.focus();
    input.select();
    /* finished bayrağı şart: render girdiyi DOM'dan sökünce Chromium blur'u
     * senkron ateşler ve bayrak olmadan iptal edilen ad blur üzerinden yine
     * kaydedilirdi. */
    var finished = false;
    var done = function (save) {
      if (finished) return;
      finished = true;
      var name = input.value.trim();
      if (!save || !name) { render(); return; }
      persist(function (l) {
        for (var i = 0; i < l.projects.length; i++) {
          if (l.projects[i].id === id) l.projects[i].name = name;
        }
      });
    };
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") done(true);
      if (e.key === "Escape") done(false);
    });
    input.addEventListener("blur", function () { done(true); });
  }

  function renderSidebar() {
    var nav = $("projects");
    nav.textContent = "";
    var c = counts();
    nav.appendChild(navRow("all", T.t("libAll"), c.all, true));
    nav.appendChild(navRow("inbox", T.t("libInbox"), c.inbox, true));
    lib.projects.forEach(function (p) {
      nav.appendChild(navRow(p.id, p.name, c[p.id], false));
    });
  }

  function addProject() {
    var nav = $("projects");
    var row = el("div", "nav-row");
    var input = el("input", "nav-edit");
    input.placeholder = T.t("libProjectName");
    row.appendChild(input);
    nav.appendChild(row);
    input.focus();
    var finished = false;
    var done = function (save) {
      if (finished) return;
      finished = true;
      var name = input.value.trim();
      if (save && name) {
        var p = { id: projectId(), name: name, createdAt: Date.now() };
        current = p.id;
        persist(function (l) { l.projects.push(p); });
      } else {
        row.remove();
      }
    };
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") done(true);
      if (e.key === "Escape") done(false);
    });
    input.addEventListener("blur", function () { done(true); });
  }

  /* --- Video kartları -------------------------------------------------- */

  function actionButton(labelKey, action) {
    var btn = el("button", "card-act", T.t(labelKey));
    btn.type = "button";
    btn.addEventListener("click", function () {
      btn.disabled = true;
      var old = btn.textContent;
      action().then(function () {
        btn.textContent = T.t("libDone");
        setTimeout(function () { btn.textContent = old; btn.disabled = false; }, 1200);
      }, function () {
        btn.textContent = T.t("menuFailed");
        setTimeout(function () { btn.textContent = old; btn.disabled = false; }, 1500);
      });
    });
    return btn;
  }

  function moveSelect(item) {
    var select = el("select", "card-move");
    var opt = function (value, text) {
      var o = el("option", null, text);
      o.value = value;
      select.appendChild(o);
    };
    opt("inbox", T.t("libInbox"));
    lib.projects.forEach(function (p) { opt(p.id, p.name); });
    select.value = bucketOf(item);
    select.addEventListener("change", function () {
      var value = select.value === "inbox" ? null : select.value;
      persist(function (l) {
        for (var i = 0; i < l.items.length; i++) {
          if (l.items[i].videoId === item.videoId) l.items[i].projectId = value;
        }
      });
    });
    return select;
  }

  function card(item) {
    var box = el("div", "card");

    var thumb = el("a", "thumb");
    thumb.href = item.url || OBActions.watchUrl(item.videoId, item.isShort);
    thumb.target = "_blank";
    thumb.rel = "noopener";
    var img = el("img");
    img.src = OBActions.thumbnailUrl(item.videoId, "hqdefault");
    img.loading = "lazy";
    img.alt = "";
    thumb.appendChild(img);
    if (item.score != null) {
      thumb.appendChild(el("span", "chip " + P.scoreTone(item.score), P.scoreLabel(item.score)));
    }
    box.appendChild(thumb);

    var body = el("div", "card-body");
    var title = el("a", "card-title", item.title || item.videoId);
    title.href = thumb.href;
    title.target = "_blank";
    title.rel = "noopener";
    title.title = item.title || "";
    body.appendChild(title);

    var meta = [];
    if (item.channel) meta.push(item.channel);
    if (item.savedAt) {
      meta.push(new Date(item.savedAt).toLocaleDateString(T.lang() === "tr" ? "tr-TR" : "en-US"));
    }
    body.appendChild(el("div", "card-meta", meta.join(" · ")));

    body.appendChild(moveSelect(item));

    var row = el("div", "card-row");
    var copyImg = actionButton("libCopyImage", function () {
      return OBActions.copyImage(item.videoId, item.title, item.channel);
    });
    copyImg.title = T.t("menuCopyImage");
    row.appendChild(copyImg);
    var copyTxt = actionButton("libCopyText", function () {
      return OBActions.copyText(item.videoId, item.title, item.isShort);
    });
    copyTxt.title = T.t("menuCopyText");
    row.appendChild(copyTxt);
    row.appendChild(actionButton("libDownload", function () {
      return OBActions.download(item.videoId, item.title, item.channel);
    }));
    var del = el("button", "card-act card-del", T.t("libDelete"));
    del.type = "button";
    armedDelete(del, function () {
      persist(function (l) {
        l.items = l.items.filter(function (it) { return it.videoId !== item.videoId; });
      });
    });
    row.appendChild(del);
    body.appendChild(row);

    box.appendChild(body);
    return box;
  }

  function visibleItems() {
    var q = query.toLowerCase();
    return lib.items.filter(function (item) {
      if (current !== "all" && bucketOf(item) !== current) return false;
      if (!q) return true;
      return (item.title || "").toLowerCase().indexOf(q) >= 0
        || (item.channel || "").toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderGrid() {
    var grid = $("grid");
    grid.textContent = "";
    var items = visibleItems();
    items.forEach(function (item) { grid.appendChild(card(item)); });
    $("count").textContent = T.t("libCount", items.length);
    $("empty").hidden = items.length > 0;
    $("empty").textContent = T.t("libEmpty");
  }

  function render() {
    renderSidebar();
    renderGrid();
  }

  /* --- Skor tazeleme --------------------------------------------------- */

  /* Kaydedilen skor kaydedildiği anın görüntüsü. Sayfa açılınca önbellek
   * ömründen (ttlHours ayarı) eski olanlar yeniden puanlanır; düğme hepsini
   * zorla tazeler. Video başına bir videoDetails isteği gider, kanal
   * baseline'ları içerik betiğiyle paylaşılan önbellekten okunur (taze
   * değilse OBScore kendisi çeker, kanal istekleri 4'le sınırlı). Büyük bir
   * kütüphanede bu yine de çok istek demek; aynı anda en çok 4 video işlenir
   * ve ttl dolmadan otomatik tazeleme tekrarlanmaz. */
  var MAX_REFRESH_PARALLEL = 4;
  var refreshing = false;

  function refreshItem(it) {
    return OBTube.videoDetails(it.videoId).then(function (d) {
      if (!d.channelId) throw new Error("kanal bulunamadı");
      return OBScore.baseline(d.channelId, !!it.isShort).then(function (blob) {
        var own = OBScore.lookupViews(it.videoId, blob);
        var views = d.views != null ? d.views : (own ? own.views : null);
        var r = OBScore.score(it.videoId, views, !!it.isShort, blob);
        var patch = { scoredAt: Date.now() };
        if (d.title) patch.title = d.title;
        if (views != null) patch.views = views;
        if (r.score != null) patch.score = r.score;
        return { videoId: it.videoId, patch: patch, changed: r.score != null };
      });
    }, function () {
      /* Video silinmiş ya da ulaşılamıyor: skor olduğu gibi kalır, zaman yine
       * damgalanır ki her açılışta aynı video için istek yağmasın. */
      return { videoId: it.videoId, patch: { scoredAt: Date.now() }, changed: false };
    });
  }

  function refreshScores(force) {
    if (refreshing) return;
    OBStore.settings().then(function (s) {
      var ttlMs = (s.ttlHours || 24) * 3600 * 1000;
      var stale = lib.items.filter(function (it) {
        return force || !it.scoredAt || Date.now() - it.scoredAt > ttlMs;
      });
      if (!stale.length) return;
      refreshing = true;
      $("refresh").disabled = true;
      notice(T.t("libRefreshing", stale.length));

      /* Güncellemeler videoId ile sonda uygulanır: tazeleme sürerken silme
       * veya taşıma yapılabilir, eski nesne referansına yazmak kaybolurdu. */
      var queueItems = stale.slice();
      var active = 0;
      var updates = [];

      var finish = function () {
        var changed = 0;
        persist(function (l) {
          updates.forEach(function (u) {
            for (var i = 0; i < l.items.length; i++) {
              if (l.items[i].videoId === u.videoId) {
                Object.assign(l.items[i], u.patch);
                if (u.changed) changed++;
                break;
              }
            }
          });
        }).then(function () {
          refreshing = false;
          $("refresh").disabled = false;
          notice(T.t("libRefreshed", changed));
        });
      };

      var startOne = function (it) {
        active++;
        refreshItem(it).then(function (u) {
          updates.push(u);
        }).catch(function () {}).then(function () {
          active--;
          pump();
        });
      };

      var pump = function () {
        while (active < MAX_REFRESH_PARALLEL && queueItems.length) {
          startOne(queueItems.shift());
        }
        if (!active && !queueItems.length) finish();
      };

      pump();
    });
  }

  /* --- İçe / dışa aktarma ---------------------------------------------- */

  function notice(text) {
    $("notice").textContent = text;
    setTimeout(function () {
      if ($("notice").textContent === text) $("notice").textContent = "";
    }, 6000);
  }

  function exportLibrary() {
    var payload = {
      app: "outlier-badge",
      v: 1,
      exportedAt: new Date().toISOString(),
      projects: lib.projects,
      items: lib.items
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "outlier-badge-library.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  /* Birleştirme alan bazında kayıpsız: yeni videolar eklenir, mevcut videoda
   * içe aktarılan alanlar boşları doldurur ama yereldeki proje ataması,
   * eski bir dışa aktarımda proje yoksa geri alınmaz; savedAt/scoredAt
   * ikisinden yenisi kalır. Böylece bayat bir yedeği içe almak videoları
   * gelen kutusuna geri fırlatmaz. */
  function importLibrary(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      notice(T.t("libImportFailed", err.message));
      return;
    }
    var projects = Array.isArray(data.projects) ? data.projects : [];
    var items = Array.isArray(data.items) ? data.items : [];
    var addedProjects = 0, addedItems = 0;

    persist(function (l) {
      projects.forEach(function (p) {
        if (!p || !p.id || !p.name) return;
        var mine = null;
        for (var i = 0; i < l.projects.length; i++) {
          if (l.projects[i].id === p.id) mine = l.projects[i];
        }
        if (mine) { mine.name = String(p.name); return; }
        l.projects.push({ id: p.id, name: String(p.name), createdAt: p.createdAt || Date.now() });
        addedProjects++;
      });

      items.forEach(function (it) {
        if (!it || !it.videoId) return;
        var local = null;
        l.items = l.items.filter(function (mine) {
          if (mine.videoId === it.videoId) { local = mine; return false; }
          return true;
        });
        l.items.push({
          videoId: String(it.videoId),
          title: String(it.title || (local && local.title) || ""),
          channel: String(it.channel || (local && local.channel) || ""),
          url: String(it.url || (local && local.url) || ""),
          isShort: !!(it.isShort != null ? it.isShort : local && local.isShort),
          score: typeof it.score === "number" ? it.score : (local ? local.score : null),
          views: typeof it.views === "number" ? it.views : (local ? local.views : null),
          savedAt: Math.max(it.savedAt || 0, (local && local.savedAt) || 0) || Date.now(),
          scoredAt: Math.max(it.scoredAt || 0, (local && local.scoredAt) || 0) || null,
          projectId: it.projectId || (local ? local.projectId : null)
        });
        if (!local) addedItems++;
      });

      l.items.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    }).then(function () {
      notice(T.t("libImported", addedItems, addedProjects));
    });
  }

  /* --- Kurulum --------------------------------------------------------- */

  function applyTexts() {
    document.title = "Outlier Badge · " + T.t("libTitle");
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = T.t(nodes[i].dataset.i18n);
    }
    $("search").placeholder = T.t("libSearch");
  }

  function bind() {
    $("newProject").addEventListener("click", addProject);
    $("refresh").addEventListener("click", function () { refreshScores(true); });
    $("export").addEventListener("click", exportLibrary);
    $("import").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", function () {
      var file = $("importFile").files[0];
      if (!file) return;
      file.text().then(importLibrary, function (err) {
        notice(T.t("libImportFailed", err.message));
      });
      $("importFile").value = "";
    });
    $("search").addEventListener("input", function () {
      query = $("search").value.trim();
      renderGrid();
    });
    api.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes.library) return;
      lib = changes.library.newValue || { projects: [], items: [] };
      if (!Array.isArray(lib.projects)) lib.projects = [];
      if (!Array.isArray(lib.items)) lib.items = [];
      render();
    });
  }

  OBStore.settings().then(function (s) {
    T.init(s.language);
    applyTexts();
    bind();
    return OBStore.readLibrary();
  }).then(function (data) {
    lib = data;
    render();
    refreshScores(false);
  });
})();
