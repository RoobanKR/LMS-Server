#!/usr/bin/env bash
# Install extra language versions into the self-hosted Piston container.
#
#   bash scripts/piston/install-runtimes.sh          install everything below
#   bash scripts/piston/install-runtimes.sh --list   only show what would be installed
#
# 1. Official Piston packages (Python, Node, TypeScript) through the Piston API.
# 2. Java and Go versions that Piston's package list does not have: the
#    official Linux builds (Eclipse Temurin JDKs, go.dev tarballs) are unpacked
#    into the container as Piston packages, reusing the run script of the
#    java/15.0.2 and go/1.16.2 packages that are already installed. Piston
#    only loads packages at startup, so the container is restarted at the end.
#
# Safe to run again: versions already installed are skipped.
# The LMS keeps running ONE version per language (Server/services/codeJudge.js
# and the client's Piston maps) until it gets a version picker.

set -u

PISTON_URL="${PISTON_URL:-http://127.0.0.1:2000}"
CONTAINER="${PISTON_CONTAINER:-piston_api}"

# Edit these lists to add or drop versions.
OFFICIAL_PACKAGES="python=3.9.4 python=3.11.0 python=3.12.0 node=16.3.0 node=20.11.1 typescript=4.2.3"
JAVA_MAJORS="11 17 21 25"                     # latest Eclipse Temurin build of each
GO_VERSIONS="1.21.13 1.23.12 1.25.14 1.27.2"

# Java 11+ runs a single source file directly (`java Main.java`), which is what
# the java/15.0.2 run script does. Java 8 cannot, so it is not in the list.
GO_ENVIRONMENT='export PATH=$PWD/go/bin:$PATH
export GOPATH=$PWD/gopath
export GOENV=off
export GOTOOLCHAIN=local'

say() { printf '\n== %s\n' "$*"; }

# "<version> <download url>" of the newest Temurin JDK for one major version.
java_asset() {
  curl -fsS "https://api.adoptium.net/v3/assets/latest/$1/hotspot?architecture=x64&image_type=jdk&os=linux&vendor=eclipse" |
    python3 -c 'import sys, json; a = json.load(sys.stdin)[0]; print(a["version"]["semver"].split("+")[0], a["binary"]["package"]["link"])'
}

if [ "${1:-}" = "--list" ]; then
  say "Official Piston packages"
  for p in $OFFICIAL_PACKAGES; do echo "${p%%=*} ${p#*=}"; done
  say "Java (Eclipse Temurin)"
  for m in $JAVA_MAJORS; do java_asset "$m" || echo "java $m: lookup failed"; done
  say "Go"
  for v in $GO_VERSIONS; do echo "$v https://go.dev/dl/go$v.linux-amd64.tar.gz"; done
  exit 0
fi

if [ "$(uname -m)" != "x86_64" ]; then
  echo "This script downloads x86_64 builds, but this machine is $(uname -m)."; exit 1
fi
if ! curl -fs "$PISTON_URL/api/v2/runtimes" >/dev/null; then
  echo "Piston is not answering at $PISTON_URL. Is the $CONTAINER container running? (docker ps)"; exit 1
fi
if ! docker exec "$CONTAINER" true 2>/dev/null; then
  echo "Container $CONTAINER not found. Set PISTON_CONTAINER=<name> (see docker ps)."; exit 1
fi
df -h /var/lib/docker 2>/dev/null | awk 'NR==2 {print "Free disk for Docker: " $4 " (this install needs about 4 GB)"}'

# ── 1. Official packages ────────────────────────────────────────────────────
for p in $OFFICIAL_PACKAGES; do
  lang="${p%%=*}"; ver="${p#*=}"
  say "$lang $ver (official package; the download can take a few minutes)"
  curl -s -X POST "$PISTON_URL/api/v2/packages" -H 'Content-Type: application/json' \
    -d "{\"language\":\"$lang\",\"version\":\"$ver\"}"
  echo
done

# ── 2. Java and Go as hand-made Piston packages ─────────────────────────────
added=0

# install_custom <language> <version> <tarball url> <template version> <tar strip> [environment]
install_custom() {
  local lang="$1" ver="$2" url="$3" tpl="$4" strip="$5" envfile="${6:-}"
  say "$lang $ver"
  if docker exec "$CONTAINER" test -f "/piston/packages/$lang/$ver/.ppman-installed"; then
    echo "already installed"; return 0
  fi
  if ! docker exec "$CONTAINER" test -f "/piston/packages/$lang/$tpl/run"; then
    echo "skipped: the official $lang $tpl package must be installed first (it is the template)"; return 1
  fi
  local tmp; tmp="$(mktemp)"
  if ! curl -fL --retry 3 -o "$tmp" "$url"; then
    echo "download failed: $url"; rm -f "$tmp"; return 1
  fi
  if ! docker cp "$tmp" "$CONTAINER:/tmp/piston-pkg.tar.gz"; then rm -f "$tmp"; return 1; fi
  rm -f "$tmp"
  # Same layout the Piston installer leaves: files, pkg-info.json, a cached
  # .env (PATH etc.) and the .ppman-installed marker it looks for at startup.
  if docker exec -i -e PKG_LANG="$lang" -e PKG_VER="$ver" -e PKG_TPL="$tpl" \
       -e PKG_STRIP="$strip" -e PKG_ENV="$envfile" "$CONTAINER" bash -se <<'IN_CONTAINER'
src="/piston/packages/$PKG_LANG/$PKG_TPL"
dir="/piston/packages/$PKG_LANG/$PKG_VER"
rm -rf "$dir"; mkdir -p "$dir"; chmod 755 "$dir"
tar xzf /tmp/piston-pkg.tar.gz -C "$dir" --strip-components="$PKG_STRIP"
rm -f /tmp/piston-pkg.tar.gz
cp "$src/run" "$dir/run"
if [ -n "$PKG_ENV" ]; then printf '%s\n' "$PKG_ENV" > "$dir/environment"; else cp "$src/environment" "$dir/environment"; fi
node -e 'const fs = require("fs"); const [s, d, v] = process.argv.slice(1); const j = JSON.parse(fs.readFileSync(s, "utf8")); j.version = v; fs.writeFileSync(d, JSON.stringify(j));' \
  "$src/pkg-info.json" "$dir/pkg-info.json" "$PKG_VER"
env -i bash -c "cd '$dir'; source environment; env" | grep -vE '^(PWD|OLDPWD|_|SHLVL)=' > "$dir/.env"
date +%s000 > "$dir/.ppman-installed"
IN_CONTAINER
  then
    echo "installed"; added=$((added + 1))
  else
    echo "install failed"; docker exec "$CONTAINER" rm -rf "/piston/packages/$lang/$ver" /tmp/piston-pkg.tar.gz
    return 1
  fi
}

for m in $JAVA_MAJORS; do
  if read -r ver url < <(java_asset "$m") && [ -n "${url:-}" ]; then
    install_custom java "$ver" "$url" 15.0.2 1
  else
    say "java $m"; echo "could not look up the Temurin $m download"
  fi
done

for v in $GO_VERSIONS; do
  install_custom go "$v" "https://go.dev/dl/go$v.linux-amd64.tar.gz" 1.16.2 0 "$GO_ENVIRONMENT"
done

if [ "$added" -gt 0 ]; then
  say "Restarting $CONTAINER so Piston loads the new packages"
  docker restart "$CONTAINER" >/dev/null
  for _ in $(seq 1 30); do curl -fs "$PISTON_URL/api/v2/runtimes" >/dev/null && break; sleep 2; done
fi

say "Installed runtimes"
curl -s "$PISTON_URL/api/v2/runtimes" |
  python3 -c 'import sys, json; [print(r["language"].ljust(12), r["version"]) for r in sorted(json.load(sys.stdin), key=lambda r: (r["language"], [int(x) for x in r["version"].split(".") if x.isdigit()]))]'
