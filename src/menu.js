/* Rozete tıklanınca açılan menü: kopyala, indir, kütüphaneye ekle/çıkar.
 *
 * Menü kartın içine değil body'ye eklenir: kart kapsayıcılarının overflow'u
 * menüyü kırpar. Konum rozetin o anki yerinden ölçülür, kaydırma ve sayfa içi
 * gezinme menüyü kapatır; takip etmeye çalışmaktan ucuz ve yeterli.
 */
var OBMenu = (function () {
  "use strict";

  var T = OBI18n;
  var open = null;

  function close() {
    if (open) { open.remove(); open = null; }
  }

  /* Rozetin kendisi hariç tutulur: rozet tıklaması buraya da düşer ve menü
   * burada kapatılırsa toggle açık menü göremez, ikinci tık kapatmak yerine
   * yeniden açardı. */
  document.addEventListener("click", function (e) {
    if (!open) return;
    if (open.contains(e.target) || open.obAnchor.contains(e.target)) return;
    close();
  }, true);

  /* Rozet tıklamaları window seviyesinde, capture aşamasında yakalanır ve
   * yutulur. Rozetin kendi üstünde dinleyici yetmiyordu: YouTube özellikle
   * Shorts kartlarında tıklamayı belge seviyesindeki capture dinleyicisiyle
   * bizden önce alıp Short'u açıyordu. Olay yolu window -> document diye
   * aktığı için buradaki stopPropagation YouTube'unkilerden önce çalışır. */
  var badgeOf = function (e) {
    return e.target && e.target.closest ? e.target.closest(".ob-badge") : null;
  };

  ["pointerdown", "pointerup", "mousedown", "mouseup", "touchend"].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (badgeOf(e)) e.stopPropagation();
    }, true);
  });

  window.addEventListener("click", function (e) {
    var badge = badgeOf(e);
    if (!badge) return;
    e.preventDefault();
    e.stopPropagation();
    /* Hayalet rozet body'de durur, kartı DOM'dan bulunamaz; kart referansı
     * hayaletin üstünde taşınır. */
    var card = badge.obCard || badge.parentElement;
    while (card && !card.obVideoId) card = card.parentElement;
    if (card) toggle(badge, contextOf(card));
  }, true);
  window.addEventListener("scroll", close, true);
  window.addEventListener("yt-navigate-start", close);
  window.addEventListener("resize", close);

  /* --- Karttan bağlam çıkarma ------------------------------------------ */

  /* Başlık kart türüne göre farklı yerlerde; sıra özelden genele. */
  var TITLE_SELECTORS = [
    "#video-title",
    "a#video-title-link",
    "[class*='lockup-metadata'][class*='title']",
    ".shortsLockupViewModelHostMetadataTitle",
    "h3 a[href*='/watch']",
    "h3 a[href*='/shorts/']"
  ];

  function titleOf(card) {
    for (var i = 0; i < TITLE_SELECTORS.length; i++) {
      var el = card.querySelector(TITLE_SELECTORS[i]);
      var text = el && ((el.getAttribute("title") || "").trim() || (el.textContent || "").trim());
      if (text) return text;
    }
    return "";
  }

  var CHANNEL_SELECTORS = [
    "ytd-channel-name a",
    "ytd-channel-name #text",
    "[class*='metadata-view-model'][class*='text'] a[href^='/@']",
    "a[href^='/@']"
  ];

  function channelOf(card) {
    for (var i = 0; i < CHANNEL_SELECTORS.length; i++) {
      var el = card.querySelector(CHANNEL_SELECTORS[i]);
      var text = el && (el.textContent || "").trim();
      if (text && text.charAt(0) !== "/") return text;
    }
    return "";
  }

  function contextOf(card) {
    return {
      videoId: card.obVideoId,
      title: titleOf(card),
      channel: channelOf(card),
      isShort: /shorts-lockup/i.test(card.tagName) || !!card.querySelector('a[href*="/shorts/"]'),
      score: card.obScore != null ? card.obScore : null,
      views: card.obViews != null ? card.obViews : null
    };
  }

  /* Kanal sayfası kartlarında başlık bazen sadece görselin aria-label'ında;
   * hiçbir yerde yoksa son çare InnerTube'a sorulur (tek istek, menü zaten
   * kullanıcı jestiyle açıldı). */
  function ensureTitle(ctx) {
    if (ctx.title) return Promise.resolve(ctx);
    return OBTube.videoDetails(ctx.videoId).then(function (d) {
      ctx.title = d.title || "";
      return ctx;
    }, function () { return ctx; });
  }

  /* --- Menü ------------------------------------------------------------ */

  function item(labelKey, action) {
    var el = document.createElement("button");
    el.type = "button";
    el.className = "ob-menu-item";
    el.textContent = T.t(labelKey);
    el.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (el.disabled) return;
      el.disabled = true;
      el.textContent = "…";
      action().then(function (doneKey) {
        el.textContent = T.t(doneKey);
        /* Zamanlayıcı yalnız kendi menüsünü kapatır: aradan geçen sürede
         * başka bir rozetin menüsü açıldıysa ona dokunmaz. */
        var owner = el.parentElement;
        setTimeout(function () { if (open === owner) close(); }, 900);
      }, function () {
        el.disabled = false;
        el.textContent = T.t("menuFailed");
      });
    });
    return el;
  }

  function place(menu, anchor) {
    var rect = anchor.getBoundingClientRect();
    menu.style.visibility = "hidden";
    document.body.appendChild(menu);
    var width = menu.offsetWidth;
    var height = menu.offsetHeight;
    var left = Math.min(rect.right - width, window.innerWidth - width - 8);
    var top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) top = rect.top - height - 6;
    menu.style.left = Math.max(8, left) + "px";
    menu.style.top = Math.max(8, top) + "px";
    menu.style.visibility = "";
  }

  function toggle(anchor, ctx) {
    if (open && open.obAnchor === anchor) { close(); return; }
    close();
    if (!ctx.videoId) return;

    var menu = document.createElement("div");
    menu.className = "ob-menu";
    menu.obAnchor = anchor;

    menu.appendChild(item("menuCopyImage", function () {
      return ensureTitle(ctx).then(function () {
        return OBActions.copyImage(ctx.videoId, ctx.title, ctx.channel);
      }).then(function () { return "menuCopied"; });
    }));

    menu.appendChild(item("menuCopyText", function () {
      return ensureTitle(ctx).then(function () {
        return OBActions.copyText(ctx.videoId, ctx.title, ctx.isShort);
      }).then(function () { return "menuCopied"; });
    }));

    menu.appendChild(item("menuDownload", function () {
      return ensureTitle(ctx).then(function () {
        return OBActions.download(ctx.videoId, ctx.title, ctx.channel);
      }).then(function () { return "menuDownloaded"; });
    }));

    var saved = false;
    var saveItem = item("menuSave", function () {
      if (saved) {
        return OBStore.libraryRemove(ctx.videoId).then(function () {
          saved = false;
          return "menuRemoved";
        });
      }
      return ensureTitle(ctx).then(function () {
        return OBActions.save(ctx);
      }).then(function () {
        saved = true;
        return "menuSaved";
      });
    });
    menu.appendChild(saveItem);
    OBStore.libraryHas(ctx.videoId).then(function (has) {
      if (has && !saveItem.disabled) {
        saved = true;
        saveItem.textContent = T.t("menuUnsave");
      }
    });

    place(menu, anchor);
    open = menu;
  }

  return { toggle: toggle, contextOf: contextOf, close: close };
})();
