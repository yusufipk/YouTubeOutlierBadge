/* Rozet menüsünün ve kütüphane sayfasının ortak eylemleri: kart görselini
 * panoya kopyalama, indirme, kütüphaneye kaydetme.
 *
 * Hem içerik betiğinde hem eklenti sayfasında çalışır; YouTube DOM'una ve
 * InnerTube'a bağımlı değildir. Kapak i.ytimg.com'dan düz CORS ile çekilir:
 * sunucu Access-Control-Allow-Origin: * gönderdiği için ayrı host izni
 * gerekmiyor. Google bu başlığı bir gün kaldırırsa görsel kopyalama ve
 * indirme "olmadı" hatasına düşer; metin kopyalama etkilenmez.
 */
var OBActions = (function () {
  "use strict";

  /* maxres her videoda yok; olmayanında YouTube 404 yerine küçük gri bir yer
   * tutucu da dönebiliyor. Sırayla denenir, ilk gerçek görsel kazanır.
   * hqdefault her videoda vardır. */
  var SIZES = ["maxresdefault", "sddefault", "hqdefault"];
  var PLACEHOLDER_MAX_BYTES = 4096;

  function thumbnailUrl(videoId, size) {
    return "https://i.ytimg.com/vi/" + videoId + "/" + (size || "hqdefault") + ".jpg";
  }

  function watchUrl(videoId, isShort) {
    return isShort
      ? "https://www.youtube.com/shorts/" + videoId
      : "https://www.youtube.com/watch?v=" + videoId;
  }

  function fetchThumbnail(videoId) {
    var attempt = function (i) {
      if (i >= SIZES.length) return Promise.reject(new Error("kapak alınamadı"));
      var next = function () { return attempt(i + 1); };
      return fetch(thumbnailUrl(videoId, SIZES[i]), { credentials: "omit" }).then(function (resp) {
        if (!resp.ok) return next();
        return resp.blob().then(function (blob) {
          if (blob.size < PLACEHOLDER_MAX_BYTES && i + 1 < SIZES.length) return next();
          return blob;
        });
      }, next);
    };
    return attempt(0);
  }

  /* --- Kart görseli ---------------------------------------------------- */

  /* Kopyala ve indir düz kapağı değil, YouTube'un koyu arayüzündeki karta
   * benzeyen tek bir görsel üretir: üstte köşeleri yuvarlak kapak, altında
   * başlık ve kanal adı. hq/sd kapaklar 4:3 geldiği için üst-alt siyah
   * bantlar 16:9 merkez kırpımıyla atılıyor; maxres zaten 16:9. */
  var CARD = {
    width: 1200,
    pad: 48,
    radius: 24,
    gap: 36,
    titleFont: "600 46px 'Roboto', 'Segoe UI', Arial, sans-serif",
    titleLine: 60,
    titleMaxLines: 3,
    channelFont: "400 34px 'Roboto', 'Segoe UI', Arial, sans-serif",
    channelHeight: 40,
    channelGap: 16,
    bg: "#0f0f0f",
    fg: "#f1f1f1",
    dim: "#aaaaaa"
  };

  function roundedPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Sığmayan tek parça sözcük (URL, etiket zinciri, boşluksuz CJK başlık)
   * harf harf bölünür; yoksa satır kanvasın sağ kenarından taşıp kırpılırdı. */
  function breakWord(ctx, word, maxWidth) {
    var parts = [];
    var cur = "";
    for (var i = 0; i < word.length; i++) {
      var probe = cur + word.charAt(i);
      if (cur && ctx.measureText(probe).width > maxWidth) {
        parts.push(cur);
        cur = word.charAt(i);
      } else {
        cur = probe;
      }
    }
    if (cur) parts.push(cur);
    return parts;
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    var words = [];
    String(text).split(/\s+/).filter(Boolean).forEach(function (w) {
      if (ctx.measureText(w).width > maxWidth) {
        words.push.apply(words, breakWord(ctx, w, maxWidth));
      } else {
        words.push(w);
      }
    });
    var lines = [];
    var line = "";
    var cut = false;
    for (var i = 0; i < words.length; i++) {
      var probe = line ? line + " " + words[i] : words[i];
      if (line && ctx.measureText(probe).width > maxWidth) {
        lines.push(line);
        line = words[i];
        if (lines.length === maxLines) { cut = true; line = ""; break; }
      } else {
        line = probe;
      }
    }
    if (line) lines.push(line);
    if (cut && lines.length) {
      var last = lines[lines.length - 1];
      while (last && ctx.measureText(last + "…").width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[lines.length - 1] = last + "…";
    }
    return lines;
  }

  function compose(videoId, title, channel) {
    return fetchThumbnail(videoId).then(function (blob) {
      return createImageBitmap(blob);
    }).then(function (bmp) {
      var sw = bmp.width;
      var sh = Math.round(sw * 9 / 16);
      if (sh > bmp.height) { sh = bmp.height; sw = Math.round(sh * 16 / 9); }
      var sx = Math.round((bmp.width - sw) / 2);
      var sy = Math.round((bmp.height - sh) / 2);

      var W = CARD.width;
      var pad = CARD.pad;
      var tw = W - pad * 2;
      var th = Math.round(tw * 9 / 16);

      var measure = document.createElement("canvas").getContext("2d");
      measure.font = CARD.titleFont;
      var lines = wrapLines(measure, title || "", tw, CARD.titleMaxLines);

      var textTop = pad + th + CARD.gap;
      var H = lines.length ? textTop + lines.length * CARD.titleLine : pad + th;
      if (channel) H += CARD.channelGap + CARD.channelHeight;
      H += pad;

      var canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = CARD.bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      roundedPath(ctx, pad, pad, tw, th, CARD.radius);
      ctx.clip();
      ctx.drawImage(bmp, sx, sy, sw, sh, pad, pad, tw, th);
      ctx.restore();

      ctx.textBaseline = "top";
      ctx.fillStyle = CARD.fg;
      ctx.font = CARD.titleFont;
      for (var i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], pad, textTop + i * CARD.titleLine);
      }
      if (channel) {
        ctx.fillStyle = CARD.dim;
        ctx.font = CARD.channelFont;
        ctx.fillText(channel, pad, textTop + lines.length * CARD.titleLine + CARD.channelGap);
      }

      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (png) {
          if (png) resolve(png);
          else reject(new Error("png dönüşümü başarısız"));
        }, "image/png");
      });
    });
  }

  /* Görsel ve metin ayrı kopyalanır. İkisini tek pano yazımında vermek
   * denendi; yapıştırılan alan biçimi kendisi seçiyor ve metin kutuları hep
   * düz metni aldığı için görselin gittiği yeri kullanıcı kestiremiyordu.
   * ClipboardItem'a doğrudan promise veriliyor: önce çizip sonra yazmak
   * kullanıcı jestinin süresini aşabiliyor. */
  function copyImage(videoId, title, channel) {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard.write) {
      return Promise.reject(new Error("pano görsel desteklemiyor"));
    }
    return navigator.clipboard.write([
      new ClipboardItem({ "image/png": compose(videoId, title, channel) })
    ]);
  }

  function copyText(videoId, title, isShort) {
    var text = (title ? title + "\n" : "") + watchUrl(videoId, isShort);
    return navigator.clipboard.writeText(text);
  }

  /* Dosya adı başlıktan gelir; yalnız dosya sisteminin yasakladığı karakterler
   * atılır, Türkçe harfler kalır. */
  function fileName(title, videoId) {
    var base = String(title || "")
      .replace(/[/\\:*?"<>|\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    return (base || videoId) + ".png";
  }

  function download(videoId, title, channel) {
    return compose(videoId, title, channel).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = fileName(title, videoId);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    });
  }

  function save(entry) {
    return OBStore.libraryAdd({
      videoId: entry.videoId,
      title: entry.title || "",
      channel: entry.channel || "",
      url: watchUrl(entry.videoId, entry.isShort),
      isShort: !!entry.isShort,
      score: entry.score != null ? entry.score : null,
      views: entry.views != null ? entry.views : null,
      savedAt: Date.now(),
      /* Skorsuz kayıt (rozet daha yüklenirken menüden eklenen video) taze
       * damgalanırsa kütüphanenin otomatik tazelemesi onu ttl boyunca atlar;
       * damgasız kalsın ki ilk açılışta puanlansın. */
      scoredAt: entry.score != null ? Date.now() : null,
      projectId: entry.projectId != null ? entry.projectId : null
    });
  }

  return {
    thumbnailUrl: thumbnailUrl,
    watchUrl: watchUrl,
    fetchThumbnail: fetchThumbnail,
    compose: compose,
    copyImage: copyImage,
    copyText: copyText,
    download: download,
    save: save
  };
})();
