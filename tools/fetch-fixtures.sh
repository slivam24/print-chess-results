#!/usr/bin/env bash
# Stáhne vzorové stránky z chess-results.com do tests/fixtures/.
# Použití: tools/fetch-fixtures.sh            (stáhne vše)
# Fixtures se commitují, testy pak běží offline a deterministicky.
set -euo pipefail
cd "$(dirname "$0")/../tests/fixtures"
UA="Mozilla/5.0 (X11; Linux x86_64) chess-print-fixtures"
get() { # name tnr query
  local url="https://chess-results.com/tnr$2.aspx?lan=1&turdet=YES&zeilen=99999$3"
  curl -sSL -m 40 -A "$UA" -o "$1.html" "$url"
  echo "$1  <- $url ($(wc -c < "$1.html") B)"
  sleep 1
}
# Švýcar jednotlivců, rozehraný (Vršovický podzimní open 2026)
get swiss-main        1495793 ""
get swiss-pairings-r6 1495793 "&art=2&rd=6"
get swiss-pairings-r7 1495793 "&art=2&rd=7"
get swiss-pairings-r8 1495793 "&art=2&rd=8"
get swiss-ranking-r6  1495793 "&art=1&rd=6"
# Stejný los v češtině (test vícejazyčných hlaviček)
curl -sSL -m 40 -A "$UA" -o swiss-pairings-r7-cs.html "https://chess-results.com/tnr1495793.aspx?lan=5&turdet=YES&zeilen=99999&art=2&rd=7"
# Turnaj s kategoriemi (sloupec Skupina) a výběrem turnajů (Open/Rapid/Blitz)
get categories-main   1514476 ""
# Více skupin (H18+H20, D18+D20, Blesk)
get groups-main       1486996 ""
# Kruhový systém jednotlivců
get rr-main           1522127 ""
get rr-pairings-r1    1522127 "&art=2&rd=1"
get rr-crosstable     1522127 "&art=4"
# Kruhový systém družstev (2. liga F)
get team-main         1464724 ""
get team-teams        1464724 "&art=32"
get team-pairings-r3  1464724 "&art=2&rd=3"
get team-boards-r3    1464724 "&art=3&rd=3"
get team-boards-r4    1464724 "&art=3&rd=4"
get team-table        1464724 "&art=46"
get team-players      1464724 "&art=16"
get team-ranking-r3   1464724 "&art=1&rd=3"
# Švýcar družstev, před startem
get teamswiss-main    1543120 ""
get teamswiss-teams   1543120 "&art=32"

# Anonymizace kontaktů (kapitáni družstev apod.) – do repozitáře nepatří.
sed -i -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/x@example.invalid/g; s/\+?[0-9]{3} ?[0-9]{3} ?[0-9]{3}( ?[0-9]{3})?([,)\/ ])/000 000 000\2/g' *.html
echo "Hotovo."
