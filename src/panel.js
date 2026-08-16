/* İzleme sayfasındaki panel.
 *
 * Zaman içinde izlenme grafiği bilerek yok: YouTube hiçbir video için geçmiş
 * izlenme eğrisi vermiyor, ne public API'de ne dahili uçlarda. vidIQ ve Social
 * Blade dahil herkes o eğriyi kendi topladığı anlık ölçümlerden üretiyor, yani
 * tek kullanıcılık bir eklentide eğri ancak aylar sonra ve sadece senin açtığın
 * videolar için oluşurdu. Onun yerine burada beklemeden işe yarayan şey var:
 * videonun kanal dağılımındaki yeri ve günlük izlenme hızı.
 */
var OBPanel = (function () {
  "use strict";

  var P = OBParse;
  var T = OBI18n;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function agoText(days) {
    if (days == null) return "";
    if (days < 60) return T.t("agoDays", Math.round(days));
    if (days < 730) return T.t("agoMonths", Math.round(days / 30.44));
    return T.t("agoYears", Math.round(days / 365.25));
  }

  /* Kanalın son videolarının izlenme dağılımı, eskiden yeniye.
   *
   * Çubuklar SVG değil düz HTML: SVG <title> ipucu balonu Firefox'ta ancak
   * uzun beklemeyle çıkıyor ve ince çubuklarda fareyi yakalamak zor. Burada
   * her çubuğun arkasında tam yükseklikte görünmez bir isabet alanı var ve
   * balonu kendimiz çiziyoruz. */
  function distribution(pool, videoId, median) {
    var items = pool.slice().reverse();
    var wrap = el("div", "ob-chart-wrap");
    var chart = el("div", "ob-chart");
    var max = 0;
    for (var i = 0; i < items.length; i++) max = Math.max(max, items[i].views || 0);
    if (!max) return wrap;

    if (median) {
      var line = el("div", "ob-median");
      line.style.bottom = ((median / max) * 100).toFixed(2) + "%";
      chart.appendChild(line);
    }

    var tip = el("div", "ob-tip");
    tip.hidden = true;

    items.forEach(function (item) {
      var slot = el("div", "ob-slot");
      var bar = el("div", "ob-bar" + (item.id === videoId ? " ob-bar-self" : ""));
      bar.style.height = Math.max(1, (item.views / max) * 100).toFixed(2) + "%";
      slot.appendChild(bar);

      slot.addEventListener("mouseenter", function () {
        tip.textContent = "";
        if (item.title) tip.appendChild(el("div", "ob-tip-title", item.title));
        var meta = [T.t("tipViews", P.humanCount(item.views))];
        if (item.age != null) meta.push(agoText(item.age));
        if (item.id === videoId) meta.push(T.t("tipThisVideo"));
        tip.appendChild(el("div", "ob-tip-meta", meta.join(" · ")));
        tip.hidden = false;
        /* Balon grafiğin içinde kalmalı. Genişliği içeriğe göre değiştiği için
         * sabit bir paya göre değil, görünür hale geldikten sonra ölçülen
         * gerçek genişliğe göre sıkıştırılıyor: kenardaki çubuklarda balon
         * ortalanmak yerine grafiğin kenarına yaslanır. */
        var center = slot.offsetLeft + slot.offsetWidth / 2;
        /* Ölçümden önce sola yaslanıyor: absolute kutunun genişliği kalan
         * alana göre daraldığı için, önceki hover'dan kalan left değeriyle
         * ölçmek balonu olduğundan dar gösterirdi. */
        tip.style.left = "0px";
        var width = tip.offsetWidth;
        var maxLeft = Math.max(0, chart.offsetWidth - width);
        tip.style.left = Math.min(Math.max(center - width / 2, 0), maxLeft) + "px";
      });
      slot.addEventListener("click", function () {
        window.open("https://www.youtube.com/watch?v=" + item.id, "_blank", "noopener");
      });
      chart.appendChild(slot);
    });

    chart.addEventListener("mouseleave", function () { tip.hidden = true; });
    chart.appendChild(tip);
    wrap.appendChild(chart);

    var legend = el("div", "ob-legend");
    legend.appendChild(el("span", "ob-legend-median", T.t("chartMedianLegend")));
    if (items.some(function (v) { return v.id === videoId; })) {
      legend.appendChild(el("span", "ob-legend-self", T.t("chartSelfLegend")));
    } else {
      legend.appendChild(el("span", null, T.t("chartNotInPool", items.length)));
    }
    wrap.appendChild(legend);
    return wrap;
  }

  function row(label, value) {
    var r = el("div", "ob-row");
    r.appendChild(el("span", "ob-row-label", label));
    r.appendChild(el("span", "ob-row-value", value));
    return r;
  }

  function mount() {
    var anchor = document.querySelector("ytd-watch-metadata #above-the-fold")
      || document.querySelector("ytd-watch-metadata")
      || document.querySelector("#secondary-inner");
    if (!anchor) return null;
    var existing = document.getElementById("ob-panel");
    if (existing && existing.parentElement === anchor) return existing;
    if (existing) existing.remove();
    var panel = el("div", "ob-panel");
    panel.id = "ob-panel";
    anchor.appendChild(panel);
    return panel;
  }

  function remove() {
    var existing = document.getElementById("ob-panel");
    if (existing) existing.remove();
  }

  function renderLoading() {
    var panel = mount();
    if (!panel) return;
    panel.textContent = "";
    panel.appendChild(el("div", "ob-panel-head", T.t("panelLoading")));
  }

  function renderError(message) {
    var panel = mount();
    if (!panel) return;
    panel.textContent = "";
    panel.appendChild(el("div", "ob-panel-head", T.t("panelTitle")));
    panel.appendChild(el("div", "ob-note", message));
  }

  function tone(score) {
    return score >= 10 ? "ob-t4" : score >= 5 ? "ob-t3"
      : score >= 2 ? "ob-t2" : score >= 1 ? "ob-t1" : "ob-t0";
  }

  function render(data) {
    var panel = mount();
    if (!panel) return;
    panel.textContent = "";

    var head = el("div", "ob-panel-head");
    var scoreText = data.score >= 10
      ? Math.round(data.score) + "x"
      : T.num(Math.round(data.score * 10) / 10, 1) + "x";
    head.appendChild(el("span", "ob-chip " + tone(data.score), scoreText));
    head.appendChild(el("span", "ob-head-text", T.t("panelHead")));
    panel.appendChild(head);

    var unit = T.t(data.isShort ? "unitShorts" : "unitVideos");
    var body = el("div", "ob-panel-body");
    body.appendChild(row(T.t("panelViews"), P.humanCount(data.views)));
    body.appendChild(row(T.t("panelMedian"),
      T.t("panelMedianValue", P.humanCount(data.median), data.sample, unit)));
    if (data.percentile != null) {
      body.appendChild(row(T.t("panelRank"),
        T.t("panelRankValue", Math.round(data.percentile * 100))));
    }
    if (data.ageDays) {
      body.appendChild(row(T.t("panelDaily"),
        T.t("panelDailyValue", P.humanCount(Math.round(data.views / Math.max(1, data.ageDays))))));
    }
    panel.appendChild(body);

    var pool = (data.isShort ? data.blob.short : data.blob.video) || [];
    if (pool.length) {
      panel.appendChild(el("div", "ob-section-title", T.t("panelDistTitle")));
      panel.appendChild(distribution(pool, data.videoId, data.median));
    }
  }

  return { render: render, renderLoading: renderLoading, renderError: renderError, remove: remove };
})();
