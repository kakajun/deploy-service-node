# deploy-service-node
前端一键部署,高度自定义sh,实现全自动流程

## 配置文件准备
1. deployConfig.js

```js
module.exports = {
  LOCAL_TAR_FILE: 'mobilevue.tar.gz',  // 本地打包后的tar包名
  REMOTE_USER: 'root',  // 远程服务器用户名
  REMOTE_HOST: '192.168.0.250',  // 远程服务器ip
  REMOTE_PORT: 22,    // 远程服务器端口
  REMOTE_PASSWORD: '123456',  // 远程服务器密码
  REMOTE_DIR: '/usr/local/nginx/html/',  // 远程服务器部署目录
  REMOTE_BACKDIR: '/usr/local/nginx/backups/',  // 远程服务器备份目录
  REMOTE_DISTNAME: 'mobilevue'  // 远程服务器部署目录名
}
```

2. remote-deploy.sh
下面是部署到服务器后怎么执行脚本,可以根据自己的需求自由修改, 我这里只提供一个可执行的例子
```sh
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
```

## 安装
npm install deploy-service-node -g

## 使用

```sh
deploy -v  // 查看版本
```

```sh
deploy   // 部署
```
