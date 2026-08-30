/* Kalıcı depo: ayarlar, kanal baseline önbelleği ve handle -> kanal kimliği
 * eşleşmesi.
 *
 * Baseline önbelleği olmadan ana sayfada aşağı her kaydırmada onlarca kanal
 * için yeniden istek atılırdı. Sayfa ömrü boyunca ayrıca bellekte tutulur,
 * aynı kanal için aynı oturumda depoya bir kez gidilir.
 */
var OBStore = (function () {
  "use strict";

  var api = (typeof browser !== "undefined" ? browser : chrome);
  var local = api.storage.local;

  /* 2: baseline videolarına başlık eklendi (panelin grafik ipuçları için). */
  var CACHE_VERSION = 2;
  var MAX_CHANNELS = 400;   /* aşılınca en eski baseline'lar silinir */

  var DEFAULTS = {
    enabled: true,
    baselineSize: 30,       /* kanalın son kaç videosu medyanı oluşturur */
    ttlHours: 24,
    minScore: 0,            /* altındaki skorlar rozet basmaz (0 = hepsi) */
    scoreShorts: true,
    showPanel: true,
    language: "auto"        /* auto | tr | en */
  };

  var mem = {};             /* anahtar -> değer, sayfa ömrü boyunca */
  var settingsCache = null;

  function get(keys) {
    return local.get(keys);
  }

  function set(obj) {
    return local.set(obj);
  }

  function settings() {
    if (settingsCache) return Promise.resolve(settingsCache);
    return get("settings").then(function (r) {
      settingsCache = Object.assign({}, DEFAULTS, r.settings || {});
      return settingsCache;
    });
  }

  function saveSettings(patch) {
    return settings().then(function (s) {
      settingsCache = Object.assign({}, s, patch);
      return set({ settings: settingsCache });
    });
  }

  /* --- Kanal baseline'ı ------------------------------------------------ */

  function baselineKey(channelId) { return "bl:" + channelId; }

  function readBaseline(channelId, size, ttlHours) {
    var key = baselineKey(channelId);
    var fresh = function (blob) {
      if (!blob || blob.v !== CACHE_VERSION || blob.size !== size) return null;
      if (Date.now() - blob.fetchedAt > ttlHours * 3600 * 1000) return null;
      return blob;
    };
    if (mem[key] !== undefined) return Promise.resolve(fresh(mem[key]));
    return get(key).then(function (r) {
      mem[key] = r[key] || null;
      return fresh(mem[key]);
    });
  }

  function writeBaseline(channelId, blob) {
    var key = baselineKey(channelId);
    mem[key] = blob;
    var payload = {};
    payload[key] = blob;
    return set(payload).then(function () { return touchIndex(channelId); });
  }

  /* Silinecekleri seçebilmek için kanal başına son yazma zamanı tutulur.
   * storage.local'ın tamamını okuyup taramak yerine tek bir dizin anahtarı. */
  function touchIndex(channelId) {
    return get("blIndex").then(function (r) {
      var index = r.blIndex || {};
      index[channelId] = Date.now();
      var ids = Object.keys(index);
      if (ids.length > MAX_CHANNELS) {
        ids.sort(function (a, b) { return index[a] - index[b]; });
        var drop = ids.slice(0, ids.length - MAX_CHANNELS + 40);
        for (var i = 0; i < drop.length; i++) {
          delete index[drop[i]];
          delete mem[baselineKey(drop[i])];
        }
        local.remove(drop.map(baselineKey));
      }
      return set({ blIndex: index });
    });
  }

  /* --- handle -> kanal kimliği ----------------------------------------- */

  function readChannelId(handle) {
    var key = "ch:" + handle.toLowerCase();
    if (mem[key] !== undefined) return Promise.resolve(mem[key]);
    return get(key).then(function (r) {
      mem[key] = r[key] || null;
      return mem[key];
    });
  }

  function writeChannelId(handle, channelId) {
    var key = "ch:" + handle.toLowerCase();
    mem[key] = channelId;
    var payload = {};
    payload[key] = channelId;
    return set(payload);
  }

  /* --- Kütüphane ------------------------------------------------------- */

  /* Kütüphane bellekte önbelleklenmez: kütüphane sayfası ile açık YouTube
   * sekmeleri aynı veriyi düzenliyor, bayat kopya yanlış "ekli/değil" gösterir.
   * Erişim seyrek (menü açılışı, kayıt), her seferinde depodan okumak ucuz. */
  var LIBRARY_KEY = "library";

  function readLibrary() {
    return get(LIBRARY_KEY).then(function (r) {
      var lib = r[LIBRARY_KEY] || {};
      return {
        v: 1,
        projects: Array.isArray(lib.projects) ? lib.projects : [],
        items: Array.isArray(lib.items) ? lib.items : []
      };
    });
  }

  function writeLibrary(lib) {
    var payload = {};
    payload[LIBRARY_KEY] = lib;
    return set(payload);
  }

  /* Aynı video ikinci kez eklenirse eski kaydın yerine geçer (tek girdi,
   * proje bilgisi korunur), listenin başına alınır. */
  function libraryAdd(item) {
    return readLibrary().then(function (lib) {
      var old = null;
      lib.items = lib.items.filter(function (it) {
        if (it.videoId === item.videoId) { old = it; return false; }
        return true;
      });
      if (old && item.projectId == null) item.projectId = old.projectId;
      lib.items.unshift(item);
      return writeLibrary(lib).then(function () { return lib; });
    });
  }

  function libraryRemove(videoId) {
    return readLibrary().then(function (lib) {
      lib.items = lib.items.filter(function (it) { return it.videoId !== videoId; });
      return writeLibrary(lib);
    });
  }

  function libraryHas(videoId) {
    return readLibrary().then(function (lib) {
      return lib.items.some(function (it) { return it.videoId === videoId; });
    });
  }

  function clearBaselines() {
    mem = {};
    return get("blIndex").then(function (r) {
      var ids = Object.keys(r.blIndex || {});
      return local.remove(ids.map(baselineKey).concat(["blIndex"]));
    });
  }

  function stats() {
    return get("blIndex").then(function (r) {
      return { channels: Object.keys(r.blIndex || {}).length };
    });
  }

  return {
    DEFAULTS: DEFAULTS,
    CACHE_VERSION: CACHE_VERSION,
    settings: settings,
    saveSettings: saveSettings,
    readBaseline: readBaseline,
    writeBaseline: writeBaseline,
    readChannelId: readChannelId,
    writeChannelId: writeChannelId,
    readLibrary: readLibrary,
    writeLibrary: writeLibrary,
    libraryAdd: libraryAdd,
    libraryRemove: libraryRemove,
    libraryHas: libraryHas,
    clearBaselines: clearBaselines,
    stats: stats
  };
})();
