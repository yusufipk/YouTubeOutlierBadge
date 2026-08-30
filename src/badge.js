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

  function element(card) {
    var box = host(card);
    var el = box.querySelector(":scope > .ob-badge");
    if (!el) {
      el = document.createElement("div");
      el.className = "ob-badge";
      if (getComputedStyle(box).position === "static") box.style.position = "relative";
      box.appendChild(el);
      /* Tıklama dinleyicisi burada yok: rozet tıklamaları OBMenu window
       * seviyesinde, capture aşamasında yakalar. Rozetin kendi üstündeki bir
       * dinleyici Shorts kartlarında işe yaramıyordu, YouTube tıklamayı
       * belge seviyesindeki capture dinleyicisiyle daha önce alıp Short'u
       * açıyordu. */
    }
    return el;
  }

  function loading(card) {
    var el = element(card);
    el.className = "ob-badge ob-loading";
    el.textContent = "";
    el.removeAttribute("title");
  }

  function show(card, result, extra) {
    var el = element(card);
    el.className = "ob-badge " + P.scoreTone(result.score);
    el.textContent = P.scoreLabel(result.score);
    var unit = T.t(extra && extra.isShort ? "unitShorts" : "unitVideos");
    var lines = [
      T.t("badgeScore", P.scoreLabel(result.score)),
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
    el.className = "ob-badge ob-none";
    el.textContent = "-";
    el.title = reason || T.t("badgeFailed");
  }

  function clear(card) {
    var box = host(card);
    var el = box.querySelector(":scope > .ob-badge");
    if (el) el.remove();
  }

  /* Rozet hâlâ yerinde mi? Hover önizlemesi kapak kutusunu yeniden kurup
   * rozeti silebiliyor; tarama bununla anlayıp geri basar. */
  function present(card) {
    return !!host(card).querySelector(":scope > .ob-badge");
  }

  /* --- Hayalet rozet ----------------------------------------------------
   *
   * Hover önizlemesi (ytd-video-preview) kartın üstüne uygulama seviyesinde
   * ayrı bir katman bindiriyor; kartın içindeki rozet z-index'i ne olursa
   * olsun o katmanın altında kalıyor. Çare: fare karta girince rozetin
   * birebir kopyası body'ye fixed basılır. Body çocuğu olduğu ve z-index'i
   * en yüksek olduğu için önizlemenin de üstünde durur, tıklanabilir kalır.
   *
   * Hayaletin ömrü DOM'la değil geometriyle yönetilir: önizleme katmanı
   * kartın soyundan gelmediği için "fare hâlâ kartın içinde mi" sorusuna
   * closest() cevap veremez; onun yerine imlecin kartın dikdörtgeni içinde
   * olup olmadığına bakılır (önizleme karttan biraz taştığı için payla). */
  var GHOST_MARGIN = 40;
  var ghost = null;
  var ghostCard = null;

  function hideGhost() {
    if (ghost) { ghost.remove(); ghost = null; ghostCard = null; }
  }

  function showGhost(card) {
    var el = host(card).querySelector(":scope > .ob-badge");
    if (!el) { hideGhost(); return; }
    var rect = el.getBoundingClientRect();
    if (!rect.width) { hideGhost(); return; }
    if (!ghost) {
      ghost = document.createElement("div");
      ghost.dataset.obGhost = "1";
      document.body.appendChild(ghost);
    }
    ghost.className = el.className + " ob-ghost";
    ghost.textContent = el.textContent;
    ghost.title = el.title || "";
    ghost.obCard = card;
    ghostCard = card;
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
  }

  document.addEventListener("mouseover", function (e) {
    var node = e.target;
    if (node && node.dataset && node.dataset.obGhost) return;
    while (node && !node.obVideoId) node = node.parentElement;
    if (node && (node !== ghostCard || !ghost)) showGhost(node);
  }, true);

  document.addEventListener("mousemove", function (e) {
    if (!ghost) return;
    if (!ghostCard || !ghostCard.isConnected) { hideGhost(); return; }
    var r = ghostCard.getBoundingClientRect();
    if (e.clientX < r.left - GHOST_MARGIN || e.clientX > r.right + GHOST_MARGIN ||
        e.clientY < r.top - GHOST_MARGIN || e.clientY > r.bottom + GHOST_MARGIN) {
      hideGhost();
    }
  }, true);

  window.addEventListener("scroll", hideGhost, true);
  window.addEventListener("yt-navigate-start", hideGhost);

  return { loading: loading, show: show, fail: fail, clear: clear, present: present };
})();
