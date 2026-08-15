/* Ayar penceresi. Kaydetmek için düğme yok: her değişiklik anında yazılır,
 * açık YouTube sekmeleri storage.onChanged ile kendini yeniler. */
(function () {
  "use strict";

  var api = (typeof browser !== "undefined" ? browser : chrome);
  var T = OBI18n;
  var ORIGINS = { origins: ["*://www.youtube.com/*"] };

  var FIELDS = [
    ["enabled", "checkbox"],
    ["scoreShorts", "checkbox"],
    ["showPanel", "checkbox"],
    ["baselineSize", "number"],
    ["minScore", "number"],
    ["ttlHours", "number"],
    ["language", "text"]
  ];

  function $(id) { return document.getElementById(id); }

  function option(select, value, text) {
    var opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = text;
    select.appendChild(opt);
  }

  /* Seçenek metinleri dile göre değiştiği için HTML'de değil burada üretilir. */
  function buildOptions() {
    var sizes = $("baselineSize");
    sizes.textContent = "";
    [15, 30, 60, 90].forEach(function (n) { option(sizes, n, T.t("optLastN", n)); });

    var scores = $("minScore");
    scores.textContent = "";
    option(scores, 0, T.t("optShowAll"));
    [1, 1.5, 2, 3].forEach(function (n) { option(scores, n, T.num(n, n % 1 ? 1 : 0) + "x"); });

    var ttl = $("ttlHours");
    ttl.textContent = "";
    option(ttl, 6, T.t("optHours", 6));
    option(ttl, 24, T.t("optHours", 24));
    option(ttl, 72, T.t("optDays", 3));
    option(ttl, 168, T.t("optWeek"));

    var lang = $("language");
    lang.textContent = "";
    option(lang, "auto", T.t("optAuto"));
    option(lang, "tr", "Türkçe");
    option(lang, "en", "English");
  }

  function applyTexts() {
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = T.t(nodes[i].dataset.i18n);
    }
  }

  function fillValues(s) {
    FIELDS.forEach(function (f) {
      var node = $(f[0]);
      if (f[1] === "checkbox") node.checked = !!s[f[0]];
      else node.value = String(s[f[0]]);
    });
  }

  function refresh() {
    return OBStore.settings().then(function (s) {
      T.init(s.language);
      applyTexts();
      buildOptions();
      fillValues(s);
      return OBStore.stats();
    }).then(function (st) {
      $("stats").textContent = T.t("popupStatsChannels", st.channels);
      return askTabStats();
    });
  }

  /* Açık YouTube sekmesindeki sayaçlar: rozet çıkmıyorsa nedeni burada görünür. */
  function askTabStats() {
    return api.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      if (!tabs.length) return;
      return api.tabs.sendMessage(tabs[0].id, { type: "ob-stats" }).then(function (r) {
        if (!r) return;
        var c = r.counters;
        var line = T.t("popupStatsTab", c.seen, c.scored);
        if (c.skipped) line += T.t("popupStatsSkipped", c.skipped);
        if (c.failed) line += T.t("popupStatsFailed", c.failed);
        $("stats").textContent += "\n" + line + ".";
        if (r.lastError) $("stats").textContent += "\n" + T.t("popupLastError", r.lastError);
      });
    }).catch(function () { /* sekmede içerik betiği yok, önemsiz */ });
  }

  function bind() {
    FIELDS.forEach(function (f) {
      $(f[0]).addEventListener("change", function () {
        var node = $(f[0]);
        var patch = {};
        patch[f[0]] = f[1] === "checkbox" ? node.checked
          : f[1] === "number" ? parseFloat(node.value) : node.value;
        OBStore.saveSettings(patch).then(function () {
          if (f[0] === "language") refresh();
        });
      });
    });

    $("clear").addEventListener("click", function () {
      OBStore.clearBaselines().then(function () {
        $("stats").textContent = T.t("popupCleared");
      });
    });

    $("grant").addEventListener("click", function () {
      api.permissions.request(ORIGINS).then(function (granted) {
        if (granted) $("permission").hidden = true;
      });
    });
  }

  api.permissions.contains(ORIGINS).then(function (has) {
    $("permission").hidden = !!has;
  }).catch(function () {});

  bind();
  refresh();
})();
