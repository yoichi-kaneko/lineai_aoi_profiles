#!/bin/bash
# tmp/ ディレクトリを掃除するスクリプト
# send_daily_line.sh が各処理の開始時に呼び出すほか、手動でも実行できる

find tmp/ -not -name '.empty' -type f -delete
echo "tmp/ を掃除しました"
