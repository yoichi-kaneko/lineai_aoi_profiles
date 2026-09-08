#!/bin/bash
# tmp/ ディレクトリを掃除するスクリプト
# send_daily_line.sh が各処理の開始時に呼び出すほか、手動でも実行できる
#
# 掃除の対象は通常ファイルのうちドット始まりでないものだけ。`.empty`（ディレクトリ
# 保持用）と `.runner.lock`（実行の直列化に使うロックファイル）は残す。ロックファイルを
# 消すと直列化が壊れるため、制御用のドットファイルは掃除の対象外とする。
#
# 一時ファイル名はスキル側で固定されているため（`tmp/line_message.txt` など）、実行が
# 重なると互いに上書きし合う。そのため `send_daily_line.sh` は tmp/ を使う処理全体を
# flock で直列化しており、この掃除も同じロックの内側で走る。

cd "$(dirname "$0")" || exit 1

mkdir -p tmp
find tmp/ -type f -not -name '.*' -delete
echo "tmp/ を掃除しました"
