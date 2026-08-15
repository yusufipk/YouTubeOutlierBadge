/* YouTube'un dahili (InnerTube) API'sine karşı istemci.
 *
 * İstekler hep hl=en/gl=US gider: izlenme kısaltmaları ("1.2M") ve yaş metni
 * ("3 months ago") tek bir dilde ayrıştırılsın diye. Kullanıcının arayüz dili
 * ne olursa olsun burası İngilizce okur.
 *
 * Oturum bilgisi gönderilmez (credentials: "omit"): rozet hesabının kullanıcının
 * YouTube hesabıyla ilişkilendirilmesi için bir sebep yok.
 *
 * Bu resmi olmayan bir arayüz. Ayrıştıran her fonksiyon eksik alanlara karşı
 * savunmacı yazıldı; yapı değişirse sonuç boş döner, sayfa bozulmaz.
 */
var OBTube = (function () {
  "use strict";

  var P = OBParse;
  var BASE = "https://www.youtube.com/youtubei/v1";
  var FALLBACK_VERSION = "2.20240701.00.00";
  var cachedVersion = null;

  /* Kanal sekmelerinin protobuf `params` değerleri. */
  var CHANNEL_TABS = {
    videos: "EgZ2aWRlb3PyBgQKAjoA",
    shorts: "EgZzaG9ydHPyBgUKA5oBAA",
    live: "EgdzdHJlYW1z8gYECgJ6AA"
  };
  var TAB_TITLES = { videos: "videos", shorts: "shorts", live: "live" };
  var MAX_ROUNDS = 6;

  function clientVersion() {
    if (cachedVersion) return cachedVersion;
    var scripts = document.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
      var t = scripts[i].textContent;
      if (!t || t.indexOf("INNERTUBE_CLIENT_VERSION") < 0) continue;
      var m = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(t);
      if (m) { cachedVersion = m[1]; return cachedVersion; }
    }
    cachedVersion = FALLBACK_VERSION;
    return cachedVersion;
  }

  function context() {
    return {
      client: {
        clientName: "WEB",
        clientVersion: clientVersion(),
        hl: "en",
        gl: "US"
      }
    };
  }

  /* İstek iki yoldan gidebilir. Önce içerik betiğinin kendi fetch'i denenir:
   * orada Origin başlığı moz-extension:// olur ve YouTube bunu reddedebilir.
   * Reddederse Firefox'un içerik betiklerine verdiği `content` nesnesine
   * düşeriz; oradaki fetch sayfanın kendi prensibiyle, yani youtube.com
   * origin'iyle gider. Hangisinin çalıştığı ilk denemede öğrenilir ve öyle
   * kalır, her istekte iki kez denenmez. */
  var mode = null;

  function pageFetch() {
    return (typeof content !== "undefined" && content && content.fetch)
      ? content.fetch.bind(content) : null;
  }

  function request(url, init) {
    var direct = function () {
      return fetch(url, init).then(function (resp) {
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.json();
      });
    };
    var viaPage = function () {
      var f = pageFetch();
      if (!f) return Promise.reject(new Error("sayfa fetch'i yok"));
      /* json() yerine text(): yanıt nesnesi sayfa dünyasından geldiği için
       * çözülmüş JSON'a Xray üzerinden erişmek sorun çıkarabiliyor, düz metin
       * çıkarmıyor. */
      return f(url, init).then(function (resp) {
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.text();
      }).then(function (text) {
        return JSON.parse(text);
      });
    };
    if (mode === "page") return viaPage();
    return direct().then(function (data) {
      mode = "ext";
      return data;
    }, function (err) {
      if (mode || !pageFetch()) throw err;
      return viaPage().then(function (data) {
        mode = "page";
        return data;
      });
    });
  }

  function post(endpoint, body) {
    var payload = Object.assign({}, body, { context: context() });
    return request(BASE + "/" + endpoint + "?prettyPrint=false", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(function (err) {
      throw new Error(endpoint + ": " + err.message);
    });
  }

  /* --- Yanıt ayrıştırma ------------------------------------------------ */

  /* Kanal sekmelerinde kullanılan 'lockupViewModel' biçimi. */
  function parseLockup(lv) {
    if (lv.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
    var vid = lv.contentId;
    if (!vid) return null;
    var meta = (lv.metadata && lv.metadata.lockupMetadataViewModel) || {};
    var rows = P.findFirst(meta, "metadataRows") || [];
    var parts = [];
    for (var i = 0; i < rows.length; i++) {
      var mp = rows[i].metadataParts || [];
      for (var j = 0; j < mp.length; j++) parts.push(P.textOf(mp[j].text));
    }
    var views = null;
    for (var k = 0; k < parts.length; k++) {
      if (parts[k].toLowerCase().indexOf("view") >= 0) { views = P.parseCountEn(parts[k]); break; }
    }
    if (views == null) {
      /* İzlenme metni yoksa yaş metnini izlenme sanmayalım: "2 months ago"
       * bir sayı değil. */
      for (var n = 0; n < parts.length; n++) {
        if (parts[n] && P.parseAgeDays(parts[n]) == null) { views = P.parseCountEn(parts[n]); break; }
      }
    }
    var published = "";
    var watching = false;
    for (var q = 0; q < parts.length; q++) {
      var low = parts[q].toLowerCase();
      if (low.indexOf("ago") >= 0) published = parts[q];
      /* Süren canlı yayın "12K watching" der; bu izlenme değil anlık izleyici
       * sayısıdır ve baseline'a girerse medyanı bozar. */
      if (low.indexOf("watching") >= 0) watching = true;
    }
    if (watching) views = null;
    var badges = P.findAll(lv, "badgeViewModel");
    var membersOnly = badges.some(function (b) {
      return b && b.badgeStyle === "BADGE_MEMBERS_ONLY";
    });
    var durationBadge = P.findFirst(lv, "thumbnailBadgeViewModel") || {};
    return {
      videoId: vid,
      title: P.textOf(meta.title),
      views: views,
      publishedText: published,
      ageDays: P.parseAgeDays(published),
      durationSeconds: P.parseDuration(durationBadge.text || ""),
      membersOnly: membersOnly,
      /* Bitmiş canlı yayınlar Videos sekmesinde de görünür ve izlenmeleri
       * normal videolarla kıyaslanamaz. YouTube bunları "Streamed 2 months
       * ago" diye işaretliyor, ayrı bir istek atmadan ayıklıyoruz. */
      wasLive: /streamed/i.test(published)
    };
  }

  /* Shorts sekmesinin 'shortsLockupViewModel' biçimi. Yayın tarihi içermez. */
  function parseShortsLockup(sl) {
    var entity = sl.entityId || "";
    var prefix = "shorts-shelf-item-";
    /* Video kimliğinin kendisi de tire içerebilir ("Ab3-xc"), o yüzden sondan
     * değil baştan kesiliyor. */
    var vid = entity.indexOf(prefix) === 0 ? entity.slice(prefix.length) : null;
    if (!vid) vid = P.findFirst(sl, "videoId");
    if (!vid) return null;
    var meta = sl.overlayMetadata || {};
    return {
      videoId: vid,
      title: P.textOf(meta.primaryText),
      views: P.parseCountEn(P.textOf(meta.secondaryText)),
      publishedText: "",
      ageDays: null,
      durationSeconds: null,
      membersOnly: false,
      wasLive: false,
      isShort: true
    };
  }

  function parseVideoRenderer(vr) {
    var vid = vr.videoId;
    if (!vid) return null;
    var published = P.textOf(vr.publishedTimeText);
    var lengthText = P.textOf(vr.lengthText);
    return {
      videoId: vid,
      title: P.textOf(vr.title),
      views: P.parseCountEn(P.textOf(vr.viewCountText)),
      publishedText: published,
      ageDays: P.parseAgeDays(published),
      durationSeconds: P.parseDuration(lengthText),
      membersOnly: false,
      wasLive: /streamed/i.test(published),
      isLive: !!P.findFirst(vr, "isLiveNow")
    };
  }

  function continuationToken(data) {
    var tokens = P.findAll(data, "continuationCommand");
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] && tokens[i].token) return tokens[i].token;
    }
    return null;
  }

  function selectedTab(data) {
    var tabs = P.findAll(data, "tabRenderer");
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i] && tabs[i].selected) return P.textOf(tabs[i].title).trim().toLowerCase();
    }
    return "";
  }

  function collect(data, videos, seen) {
    var kinds = [
      ["lockupViewModel", parseLockup],
      ["shortsLockupViewModel", parseShortsLockup],
      ["videoRenderer", parseVideoRenderer]
    ];
    for (var i = 0; i < kinds.length; i++) {
      var nodes = P.findAll(data, kinds[i][0]);
      for (var j = 0; j < nodes.length; j++) {
        var item = kinds[i][1](nodes[j]);
        if (item && !seen[item.videoId]) {
          seen[item.videoId] = true;
          videos.push(item);
        }
      }
    }
  }

  /* Bir kanal sekmesindeki videolar, en yeniden eskiye, en fazla `limit` tane.
   * Kanalda o sekme yoksa YouTube sessizce başka bir sekme döndürdüğü için
   * seçili sekmenin başlığı doğrulanır; uymuyorsa boş liste döner. */
  function channelTab(channelId, tab, limit) {
    var params = CHANNEL_TABS[tab];
    if (!params) return Promise.reject(new Error("bilinmeyen sekme: " + tab));
    var videos = [], seen = {}, tokens = {};

    function round(data) {
      if (!videos.length) {
        var sel = selectedTab(data);
        if (sel && sel.indexOf(TAB_TITLES[tab]) < 0) return videos;
      }
      var before = videos.length;
      collect(data, videos, seen);
      var token = continuationToken(data);
      /* İlerleme yoksa ya da YouTube aynı token'ı tekrar veriyorsa dur:
       * aksi halde bazı kanallarda sonsuz döngüye giriliyor. */
      if (videos.length >= limit || !token || tokens[token] || videos.length === before) {
        return videos.slice(0, limit);
      }
      tokens[token] = true;
      if (Object.keys(tokens).length > MAX_ROUNDS) return videos.slice(0, limit);
      return post("browse", { continuation: token }).then(round);
    }

    return post("browse", { browseId: channelId, params: params }).then(round);
  }

  /* @handle veya kanal adresini UC... kimliğine çevirir. */
  function resolveChannel(raw) {
    raw = (raw || "").trim();
    if (!raw) return Promise.reject(new Error("boş kanal adresi"));
    if (/^UC[\w-]{22}$/.test(raw)) return Promise.resolve(raw);
    if (raw.indexOf("/channel/") >= 0) {
      var tail = raw.split("/channel/")[1].split("/")[0].split("?")[0];
      if (tail.indexOf("UC") === 0) return Promise.resolve(tail);
    }
    var url = raw;
    if (url.indexOf("http") !== 0) {
      url = "https://www.youtube.com/" + (url.charAt(0) === "@" ? url : "@" + url.replace(/^\/+/, ""));
    }
    return post("navigation/resolve_url", { url: url }).then(function (data) {
      var endpoint = P.findFirst(data, "browseEndpoint") || {};
      var id = endpoint.browseId || "";
      if (id.indexOf("UC") === 0) return id;
      /* Eski /user/ adresi olan kanallarda YouTube browseEndpoint yerine
       * urlEndpoint ile başka bir adrese yolluyor. */
      var next = (P.findFirst(data, "urlEndpoint") || {}).url || "";
      if (next.indexOf("/channel/") >= 0) {
        var t = next.split("/channel/")[1].split("/")[0].split("?")[0];
        if (t.indexOf("UC") === 0) return t;
      }
      throw new Error("kanal çözülemedi: " + raw);
    });
  }

  /* Videonun kanal kimliği ve tam izlenme sayısı. Kartta kanal bağlantısı
   * bulunamadığında son çare olarak kullanılır: video başına bir istek. */
  function videoDetails(videoId) {
    return post("player", { videoId: videoId }).then(function (data) {
      var d = data.videoDetails || {};
      return {
        channelId: d.channelId || null,
        views: d.viewCount ? parseInt(d.viewCount, 10) : null,
        title: d.title || "",
        lengthSeconds: d.lengthSeconds ? parseInt(d.lengthSeconds, 10) : null,
        isLive: !!d.isLiveContent
      };
    });
  }

  return {
    channelTab: channelTab,
    resolveChannel: resolveChannel,
    videoDetails: videoDetails,
    clientVersion: clientVersion
  };
})();
