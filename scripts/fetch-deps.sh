#!/bin/sh
# Clones odin-http into vendor/ at the commit the Dockerfile uses, so `odin check` and your
# editor can resolve `import http "deps:odin-http"`. Docker does its own clone; this is for tooling.
set -eu

REF="fac113fbd828aad3d71479a534b5de4358b6a07b"
DIR="vendor/odin-http"

mkdir -p vendor
if [ ! -d "$DIR/.git" ]; then
  git clone --quiet https://github.com/laytan/odin-http "$DIR"
fi
git -C "$DIR" fetch --quiet origin
git -C "$DIR" checkout --quiet "$REF"
echo "odin-http at $REF in $DIR"
