#!/usr/bin/env bash

count() {
   wc -c | awk '{print $1}';
}

sed -E '/^[[:space:]]*\/\*/,/^[[:space:]]*\*\//d; /^[[:space:]]*\/\//d; /^[[:space:]]*$/d; s/^[[:space:]]+//; s/[[:space:]]+$//' batsignal.js > batsignal.min.js;
node --check batsignal.min.js || exit "$?";

echo "$(cat batsignal.min.js | count)  # batsignal.min.js";
echo "$(gzip -ck9 batsignal.min.js | count)  # batsignal.min.js + gzip";
echo "$(brotli -ckq 6 batsignal.min.js | count)  # batsignal.min.js + brotli";

echo "$(cat batsignal.js | count) # batsignal.js";
echo "$(gzip -ck9 batsignal.js | count)  # batsignal.js + gzip";
echo "$(brotli -ckq 6 batsignal.js | count)  # batsignal.js + brotli";

echo "$(uglifyjs -m properties,toplevel batsignal.js | count)  # uglify";
echo "$(uglifyjs -m properties,toplevel batsignal.js | gzip -ck9 | count)  # uglify + gzip";
echo "$(uglifyjs -m properties,toplevel batsignal.js | brotli -ckq 6 | count)  # uglify + brotli";
