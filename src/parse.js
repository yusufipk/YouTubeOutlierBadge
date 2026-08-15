/* Metin ve JSON ayrıştırma yardımcıları.
 *
 * İki ayrı sayı ayrıştırıcısı var ve bu bilerek böyle: InnerTube yanıtlarını
 * hep hl=en isteyip okuyoruz, orada "B" milyar demek. Sayfanın kendi DOM'u ise
 * kullanıcının arayüz dilinde ve Türkçe arayüzde "B" bin demek. Aynı fonksiyonla
 * ikisini okumak 24 bin izlenmeyi 24 milyar yapardı.
 */
var OBParse = (function () {
  "use strict";

  function findAll(obj, key, out) {
    out = out || [];
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) findAll(obj[i], key, out);
    } else if (obj && typeof obj === "object") {
      for (var k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        if (k === key) out.push(obj[k]);
        else findAll(obj[k], key, out);
      }
    }
    return out;
  }

  function findFirst(obj, key, fallback) {
    var hits = findAll(obj, key);
    return hits.length ? hits[0] : fallback;
  }

  /* simpleText / runs / content biçimlerinin hepsini düz metne çevirir. */
  function textOf(node) {
    if (node == null) return "";
    if (typeof node === "string") return node;
    if (typeof node !== "object") return "";
    if (typeof node.simpleText === "string") return node.simpleText;
    if (typeof node.content === "string") return node.content;
    if (Array.isArray(node.runs)) {
      return node.runs.map(function (r) { return r.text || ""; }).join("");
    }
    return "";
  }

  /* "1.2M views" / "341,331 views" -> sayı. İngilizce kısaltmalara göre.
   * Kısaltma harfi bir kelimenin başı olmamalı: "2 months ago" içindeki 'm',
   * yoksa milyon çarpanı sanılıp 2'yi 2.000.000 yapardı. */
  var EN_MULT = { k: 1e3, m: 1e6, b: 1e9 };
  function parseCountEn(text) {
    if (!text) return null;
    var m = /([\d.,]+)\s*([KMB](?![A-Za-z]))?/i.exec(String(text).replace(/ /g, " "));
    if (!m) return null;
    var num = m[1];
    var suffix = (m[2] || "").toLowerCase();
    if (suffix) {
      /* Kısaltılmış biçimde ayırıcı ondalık noktasıdır (1.2M, 1,2 M). */
      var value = parseFloat(num.replace(/,/g, "."));
      return isNaN(value) ? null : Math.round(value * EN_MULT[suffix]);
    }
    var digits = num.replace(/[.,\s]/g, "");
    return /^\d+$/.test(digits) ? parseInt(digits, 10) : null;
  }

  /* Sayfanın kendi metnini arayüz diline göre okur.
   * Türkçe: 24 B = 24.000, 1,3 Mn = 1.300.000, 2,1 Mr = 2.100.000.000 */
  var TR_MULT = { b: 1e3, bin: 1e3, mn: 1e6, mr: 1e9 };
  function parseCountUI(text, lang) {
    if (!text) return null;
    var s = String(text).replace(/ /g, " ");
    var turkish = (lang || "").toLowerCase().indexOf("tr") === 0;
    if (!turkish) return parseCountEn(s);
    var m = /([\d.,]+)\s*(Mn|Mr|bin|B)(?![a-zA-ZğüşöçıİĞÜŞÖÇ])/i.exec(s);
    if (m) {
      var value = parseFloat(m[1].replace(/\./g, "").replace(/,/g, "."));
      var mult = TR_MULT[m[2].toLowerCase()];
      return isNaN(value) || !mult ? null : Math.round(value * mult);
    }
    var plain = /([\d.,]+)/.exec(s);
    if (!plain) return null;
    var digits = plain[1].replace(/[.,\s]/g, "");
    return /^\d+$/.test(digits) ? parseInt(digits, 10) : null;
  }

  /* "3 months ago" -> 91,3 gün. Türkçe arayüz metinleri de tanınır. */
  var AGE_UNITS = {
    second: 1 / 86400, minute: 1 / 1440, hour: 1 / 24,
    day: 1, week: 7, month: 30.44, year: 365.25,
    saniye: 1 / 86400, dakika: 1 / 1440, saat: 1 / 24,
    gun: 1, hafta: 7, ay: 30.44, yil: 365.25
  };
  function parseAgeDays(text) {
    if (!text) return null;
    /* Türkçe harfler burada ASCII'ye indirgeniyor, çünkü karşılaştırılan şey
     * kullanıcıya gösterilen metin değil, sözlükteki anahtar. */
    var s = String(text).toLowerCase()
      .replace(/ü/g, "u").replace(/ı/g, "i").replace(/ğ/g, "g")
      .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c");
    var m = /(\d+)\s+(second|minute|hour|day|week|month|year|saniye|dakika|saat|gun|hafta|ay|yil)/.exec(s);
    if (!m) return null;
    return parseInt(m[1], 10) * AGE_UNITS[m[2]];
  }

  /* "9:46" -> 586 saniye. */
  function parseDuration(text) {
    if (!text) return null;
    var parts = String(text).trim().split(":");
    var seconds = 0;
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d+$/.test(parts[i])) return null;
      seconds = seconds * 60 + parseInt(parts[i], 10);
    }
    return parts.length ? seconds : null;
  }

  function median(values) {
    if (!values.length) return null;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* 1234567 -> "1,2 Mn" (tr) veya "1.2M" (en). Arayüzde yer dar. */
  function humanCount(n) {
    if (n == null) return "-";
    var tr = typeof OBI18n === "undefined" || OBI18n.lang() === "tr";
    var fmt = function (x, unit) {
      var text = x.toFixed(1).replace(/\.0$/, "");
      return tr ? text.replace(".", ",") + " " + unit : text + unit;
    };
    var units = tr ? { b: "Mr", m: "Mn", k: "B" } : { b: "B", m: "M", k: "K" };
    if (n >= 1e9) return fmt(n / 1e9, units.b);
    if (n >= 1e6) return fmt(n / 1e6, units.m);
    if (n >= 1e5) return tr ? Math.round(n / 1e3) + " " + units.k : Math.round(n / 1e3) + units.k;
    if (n >= 1e3) return fmt(n / 1e3, units.k);
    return String(Math.round(n));
  }

  return {
    findAll: findAll,
    findFirst: findFirst,
    textOf: textOf,
    parseCountEn: parseCountEn,
    parseCountUI: parseCountUI,
    parseAgeDays: parseAgeDays,
    parseDuration: parseDuration,
    median: median,
    humanCount: humanCount
  };
})();
