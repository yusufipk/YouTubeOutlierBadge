/* Kartın kapağının üstüne basılan rozet.
 *
 * Rozet kapağın kendi kapsayıcısına konur, karta değil: YouTube kartın alt
 * kısmını (başlık, kanal satırı) sık sık yeniden çiziyor, kapak kutusu ise
 * kaydırma boyunca yerinde kalıyor. Konumu süre damgasının hemen üstü.
 */
var OBBadge = (function () {
  "use strict";

  var P = OBParse;
  var T = OBI18n;
  var HOST_SELECTORS = [
    "ytd-thumbnail",
    "yt-thumbnail-view-model",
    ".ytThumbnailViewModelHost",
    "a#thumbnail",
    ".shortsLockupViewModelHostThumbnailContainer"
  ];

  function host(card) {
    for (var i = 0; i < HOST_SELECTORS.length; i++) {
      var el = card.querySelector(HOST_SELECTORS[i]);
      if (el) return el;
    }
    return card;
  }

  function isShortCard(card) {
    return /shorts-lockup/i.test(card.tagName) || !!card.querySelector('a[href*="/shorts/"]');
  }

  function tone(score) {
    if (score >= 10) return "ob-t4";
    if (score >= 5) return "ob-t3";
    if (score >= 2) return "ob-t2";
    if (score >= 1) return "ob-t1";
    return "ob-t0";
  }

  function label(score) {
    if (score >= 10) return Math.round(score) + "x";
    return T.num(Math.round(score * 10) / 10, 1) + "x";
  }

  function element(card) {
    var box = host(card);
    var el = box.querySelector(":scope > .ob-badge");
    if (!el) {
      el = document.createElement("div");
      el.className = "ob-badge";
      if (getComputedStyle(box).position === "static") box.style.position = "relative";
      box.appendChild(el);
    }
    /* Shorts kapağının altı izlenme metniyle dolu, rozet orada üste gider. */
    el.dataset.short = isShortCard(card) ? "1" : "";
    return el;
  }

  function base(el) {
    return "ob-badge" + (el.dataset.short ? " ob-short" : "");
  }

  function loading(card) {
    var el = element(card);
    el.className = base(el) + " ob-loading";
    el.textContent = "";
    el.removeAttribute("title");
  }

  function show(card, result, extra) {
    var el = element(card);
    el.className = base(el) + " " + tone(result.score);
    el.textContent = label(result.score);
    var unit = T.t(extra && extra.isShort ? "unitShorts" : "unitVideos");
    var lines = [
      T.t("badgeScore", label(result.score)),
      T.t("badgeViews", P.humanCount(result.views)),
      T.t("badgeMedian", P.humanCount(result.median), result.sample, unit)
    ];
    if (result.percentile != null) {
      lines.push(T.t("badgeRank", Math.round(result.percentile * 100)));
    }
    if (extra && extra.young) {
      lines.push(T.t("badgeYoung"));
      el.className += " ob-young";
    }
    lines.push(T.t("badgeRounded"));
    el.title = lines.join("\n");
  }

  function fail(card, reason) {
    var el = element(card);
    el.className = base(el) + " ob-none";
    el.textContent = "-";
    el.title = reason || T.t("badgeFailed");
  }

  function clear(card) {
    var box = host(card);
    var el = box.querySelector(":scope > .ob-badge");
    if (el) el.remove();
  }

  return { loading: loading, show: show, fail: fail, clear: clear };
})();
