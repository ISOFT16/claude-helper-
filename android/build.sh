#!/usr/bin/env bash
# Сборка APK без Gradle. Нужны: JDK 8+, а также пакеты Ubuntu:
#   sudo apt-get install android-sdk android-sdk-platform-23 dalvik-exchange apksigner zipalign
# Результат: android/build/Perehvat.apk
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
THREE_VER=0.160.0
OUT=build
rm -rf "$OUT"; mkdir -p "$OUT"/{assets/www,gen,obj}

# 1. Ресурсы игры: index.html + локальная копия three.js (работает без интернета)
ADDONS="geometries/RoundedBoxGeometry.js environments/RoomEnvironment.js utils/BufferGeometryUtils.js"
if [ ! -d "cache/three-$THREE_VER" ]; then
  mkdir -p "cache/three-$THREE_VER"
  curl -fsSL "https://registry.npmjs.org/three/-/three-$THREE_VER.tgz" | tar -xz -C "cache/three-$THREE_VER" package/build/three.module.js $(for a in $ADDONS; do echo "package/examples/jsm/$a"; done)
fi
cp "cache/three-$THREE_VER/package/build/three.module.js" "$OUT/assets/www/three.module.js"
for a in $ADDONS; do mkdir -p "$OUT/assets/www/addons/$(dirname "$a")"; cp "cache/three-$THREE_VER/package/examples/jsm/$a" "$OUT/assets/www/addons/$a"; done
sed -e "s|https://unpkg.com/three@$THREE_VER/build/three.module.js|./three.module.js|" \
    -e "s|https://unpkg.com/three@$THREE_VER/examples/jsm/|./addons/|" ../index.html > "$OUT/assets/www/index.html"
grep -q '"./three.module.js"' "$OUT/assets/www/index.html" && grep -q '"./addons/"' "$OUT/assets/www/index.html" || { echo "importmap не заменён" >&2; exit 1; }
# дополнения не должны тянуть файлы, которых нет в APK
if grep -ho "from '[^']*'" $(for a in $ADDONS; do echo "$OUT/assets/www/addons/$a"; done) | grep -v "from 'three'" ; then echo "лишние зависимости дополнений" >&2; exit 1; fi

# 2. Ресурсы приложения и R.java
aapt package -f -m -J "$OUT/gen" -M AndroidManifest.xml -S res -I "$SDK"

# 3. Компиляция Java -> dex
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$SDK" \
  -d "$OUT/obj" $(find src "$OUT/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/obj"

# 4. Упаковка, выравнивание, подпись
aapt package -f -M AndroidManifest.xml -S res -A "$OUT/assets" -I "$SDK" -F "$OUT/unsigned.apk"
(cd "$OUT" && aapt add -k unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KS=${KEYSTORE:-perehvat.keystore}
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass perehvat -keypass perehvat -alias perehvat \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Perehvat, O=Perehvat Game"
fi
apksigner sign --ks "$KS" --ks-pass pass:${KS_PASS:-perehvat} --ks-key-alias perehvat \
  --min-sdk-version 21 --out "$OUT/Perehvat.apk" "$OUT/aligned.apk"
apksigner verify --print-certs "$OUT/Perehvat.apk" | head -1
ls -lh "$OUT/Perehvat.apk"
