#!/usr/bin/env bash
set -euo pipefail
android_project=$(cd "$(dirname "$0")" && pwd)
android_output=${1:?Pass the output APK path}
platform=${ANDROID_PLATFORM_JAR:-${ANDROID_HOME:-}/platforms/android-35/android.jar}
tools=${ANDROID_BUILD_TOOLS:-${ANDROID_HOME:-}/build-tools/35.0.0}
signing_key=${GROVE_ANDROID_KEYSTORE:?Set GROVE_ANDROID_KEYSTORE to your existing signing keystore}
signing_alias=${GROVE_ANDROID_KEY_ALIAS:-habitgrove}
: "${GROVE_ANDROID_KEY_PASSWORD:?Set the keystore password in the environment}"
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
mkdir -p "$build_dir/classes" "$build_dir/generated" "$build_dir/dex"
cp -R "$android_project/res" "$build_dir/res"
mkdir -p "$build_dir/res/raw"
node "$android_project/generate-tone.mjs" "$build_dir/res/raw/retro_alert.wav"
"$tools/aapt2" compile --dir "$build_dir/res" -o "$build_dir/resources.zip"
"$tools/aapt2" link -I "$platform" --manifest "$android_project/AndroidManifest.xml" \
  --java "$build_dir/generated" -o "$build_dir/resources.apk" "$build_dir/resources.zip"
mapfile -d '' sources < <(find "$android_project/src" "$build_dir/generated" -name '*.java' -print0)
java -m jdk.compiler/com.sun.tools.javac.Main -source 17 -target 17 -Xlint:-options \
  -classpath "$platform" -d "$build_dir/classes" "${sources[@]}"
mapfile -d '' classes < <(find "$build_dir/classes" -name '*.class' -print0)
"$tools/d8" --min-api 34 --lib "$platform" --output "$build_dir/dex" "${classes[@]}"
(cd "$build_dir/dex" && zip -jq "$build_dir/resources.apk" classes*.dex)
"$tools/zipalign" -p -f 4 "$build_dir/resources.apk" "$build_dir/aligned.apk"
mkdir -p "$(dirname "$android_output")"
"$tools/apksigner" sign --ks "$signing_key" --ks-key-alias "$signing_alias" \
  --ks-pass env:GROVE_ANDROID_KEY_PASSWORD --v4-signing-enabled false \
  --out "$android_output" "$build_dir/aligned.apk"
"$tools/apksigner" verify "$android_output"
