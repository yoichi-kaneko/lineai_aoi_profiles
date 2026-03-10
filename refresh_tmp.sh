#!/bin/bash
# tmp/ ディレクトリを掃除するスクリプト（週1回程度の実行を想定）

find tmp/ -not -name '.empty' -type f -delete
echo "tmp/ を掃除しました"
