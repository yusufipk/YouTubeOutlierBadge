#!/usr/bin/env python3
"""Yayına paket hazırlar: sürümü artırır, kodu kontrol eder, zip'i üretir.

AMO aynı sürüm numarasını ikinci kez kabul etmiyor, o yüzden paketleme ve
sürüm artırma tek adımda: elle biri unutulunca yükleme reddediliyor.

    ./package.py            0.1.1 -> 0.1.2, zip üret
    ./package.py 0.2.0      verilen sürümü yaz, zip üret
    ./package.py --same     sürüme dokunma, sadece zip üret
"""

import json
import os
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
INCLUDE_DIRS = ["src", "popup", "icons", "_locales"]
OUTPUT = "outlier-badge.zip"


def next_version(current):
    parts = current.split(".")
    parts[-1] = str(int(parts[-1]) + 1)
    return ".".join(parts)


def check_syntax():
    """node varsa her JS dosyasını ayrıştırmayı dene: bozuk bir dosyayı
    AMO'ya yükleyip incelemede öğrenmek yerine burada görelim."""
    files = []
    for d in ["src", "popup"]:
        for root, _, names in os.walk(os.path.join(ROOT, d)):
            files += [os.path.join(root, n) for n in names if n.endswith(".js")]
    try:
        for f in files:
            subprocess.run(["node", "--check", f], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except FileNotFoundError:
        print("node yok, sözdizimi kontrolü atlandı")
        return
    except subprocess.CalledProcessError as exc:
        sys.exit("sözdizimi hatası:\n" + exc.stderr.decode())
    print(f"{len(files)} JS dosyası ayrıştırıldı")


def main():
    os.chdir(ROOT)
    arg = sys.argv[1] if len(sys.argv) > 1 else None

    with open("manifest.json") as fh:
        manifest = json.load(fh)
    current = manifest["version"]

    if arg == "--same":
        version = current
    elif arg:
        version = arg
    else:
        version = next_version(current)

    if version != current:
        with open("manifest.json") as fh:
            raw = fh.read()
        raw = raw.replace(f'"version": "{current}"', f'"version": "{version}"', 1)
        with open("manifest.json", "w") as fh:
            fh.write(raw)
        print(f"sürüm {current} -> {version}")
    else:
        print(f"sürüm {version} (değişmedi)")

    check_syntax()

    if os.path.exists(OUTPUT):
        os.remove(OUTPUT)
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.write("manifest.json")
        for d in INCLUDE_DIRS:
            for root, _, names in os.walk(d):
                for name in sorted(names):
                    z.write(os.path.join(root, name))
        count = len(z.namelist())

    size = os.path.getsize(OUTPUT) // 1024
    print(f"{OUTPUT}: {count} dosya, {size} KB")
    print("AMO -> Manage My Submissions -> Upload New Version")


if __name__ == "__main__":
    main()
