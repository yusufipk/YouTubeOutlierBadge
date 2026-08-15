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
  var SVG = "http://www.w3.org/2000/svg";

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  /* Kanalın son videolarının izlenme dağılımı, eskiden yeniye.
   * Bu video vurgulu, medyan kesikli çizgi. */
  function distribution(pool, videoId, median) {
    var items = pool.slice().reverse();
    var w = 100, h = 46;
    var svg = svgEl("svg", { viewBox: "0 0 " + w + " " + h, class: "ob-chart", preserveAspectRatio: "none" });
    var max = 0;
    for (var i = 0; i < items.length; i++) max = Math.max(max, items[i].views || 0);
    if (!max) return svg;
    var bw = w / items.length;
    for (var j = 0; j < items.length; j++) {
      var v = items[j].views || 0;
      var bh = Math.max(1, (v / max) * (h - 2));
      var bar = svgEl("rect", {
        x: (j * bw + bw * 0.12).toFixed(2),
        y: (h - bh).toFixed(2),
        width: (bw * 0.76).toFixed(2),
        height: bh.toFixed(2),
        class: items[j].id === videoId ? "ob-bar ob-bar-self" : "ob-bar"
      });
      var tip = svgEl("title", {});
      tip.textContent = P.humanCount(v);
      bar.appendChild(tip);
      svg.appendChild(bar);
    }
    if (median) {
      var y = h - (median / max) * (h - 2);
      svg.appendChild(svgEl("line", {
        x1: 0, x2: w, y1: y.toFixed(2), y2: y.toFixed(2), class: "ob-median"
      }));
    }
    return svg;
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

    panel.appendChild(el("div", "ob-note", T.t("panelNote")));
  }

  return { render: render, renderLoading: renderLoading, renderError: renderError, remove: remove };
})();
