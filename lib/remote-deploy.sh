#!/bin/bash
set -x

REMOTE_DIR="$1"
REMOTE_BACKDIR="$2"
REMOTE_DISTNAME="$3"
LOCAL_TAR_FILE="$4"
CURRENT_TIMESTAMP="$5"

cd "$REMOTE_DIR" || { echo "目录 $REMOTE_DIR 不存在"; exit 1; }

if [ ! -e "$LOCAL_TAR_FILE" ]; then
  echo "错误: $LOCAL_TAR_FILE 不存在"
  exit 1
fi

if [ -e "$REMOTE_DISTNAME" ]; then
  mv "$REMOTE_DISTNAME" "${REMOTE_DISTNAME}_${CURRENT_TIMESTAMP}" || { echo "重命名失败"; exit 1; }
  echo "旧目录已重命名为 ${REMOTE_DISTNAME}_${CURRENT_TIMESTAMP}"
  mv "${REMOTE_DISTNAME}_${CURRENT_TIMESTAMP}" "${REMOTE_BACKDIR}${REMOTE_DISTNAME}_${CURRENT_TIMESTAMP}" || { echo "移动到备份目录失败"; exit 1; }
  echo "旧目录已移动到备份目录 ${REMOTE_BACKDIR}${REMOTE_DISTNAME}_${CURRENT_TIMESTAMP}"
fi

tar -xvf "$LOCAL_TAR_FILE" || { echo "解压失败"; exit 1; }
echo "解压成功"
