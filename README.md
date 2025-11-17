# deploy-service-node

前端一键部署,高度自定义 sh,实现全自动流程:打包, 上传, 解压,备份, 同时支持 linux 服务器和 Windows 服务器

## 安装

npm install deploy-service-node -g

## 使用

```sh
deploy -v  // 查看版本, 检查安装是否成功
```

```sh
deploy   // 需要先阅读配置文件准备, 部署,在配置好 deployConfig.js 前提下, 自动打包并部署
```

### 常用参数

```sh
deploy --help              # 查看帮助
deploy --nobuild           # 跳过本地构建, 直接压缩/上传/部署
deploy --config ./deploy.prod.js  # 指定配置文件路径
deploy -v | --version      # 查看版本
```

## 配置文件准备

1. deployConfig.js (必填)

```js
module.exports = {
  LOCAL_TAR_FILE: 'fvue.tar.gz', // 本地打包后的tar包名
  REMOTE_USER: 'root', // 远程服务器用户名
  REMOTE_HOST: '192.168.0.250', // 远程服务器ip
  REMOTE_PORT: 22, // 远程服务器端口
  REMOTE_PASSWORD: '123456', // 远程服务器密码(或使用私钥登录,见下)
  REMOTE_DIR: '/usr/local/nginx/html/', // 远程服务器部署目录
  REMOTE_BACKDIR: '/usr/local/nginx/backups/', // 远程服务器备份目录
  REMOTE_DISTNAME: 'fvue' // 远程服务器部署目录名
}
```

2. package.json 下的 scripts 配置

```js
"scripts": {
     "build": "vue-cli-service build --dest fvue && npm run tar",
     "tar": "tar -czf fvue.tar.gz  fvue",
}
```

注意`fvue` 名字要跟 `REMOTE_DISTNAME` 中配置的一样,可以根据自己的包名配置, 否则会部署失败

### 私钥登录与环境变量

支持使用私钥登录与环境变量覆盖配置:

```sh
# 通过环境变量覆盖(优先级高于配置文件)
set REMOTE_HOST=192.168.0.250
set REMOTE_USER=root
set REMOTE_PORT=22
set REMOTE_PRIVATE_KEY=C:\\Users\\you\\.ssh\\id_rsa
set REMOTE_PASSPHRASE=your-passphrase
deploy
```

或在 `deployConfig.js` 中加入:

```js
module.exports = {
  // ...原有配置
  PRIVATE_KEY: 'C:/Users/you/.ssh/id_rsa',
  PASSPHRASE: 'your-passphrase'
}
```

3. remote-deploy.sh (可选,Linux 服务器部署脚本)
   下面是部署到服务器后怎么执行脚本,可以根据自己的需求自由修改, 我这里只提供一个可执行的例子, 脚本非必须,如果没有配置, 那么就用我内置的 sh,代码如下:

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
rm -f "$LOCAL_TAR_FILE"
echo "解压成功"
```

4. remote-deploy.cmd (可选,Windows 服务器部署脚本)

```cmd
@echo off
setlocal enabledelayedexpansion
:: 注意这个文件一定要用CRLF格式保存,否则传输过去会代码挤到一起
:: Parameter check
if "%~1"=="" (echo Error: Missing parameter REMOTE_DIR & exit /b 1)
if "%~2"=="" (echo Error: Missing parameter REMOTE_BACKDIR & exit /b 1)
if "%~3"=="" (echo Error: Missing parameter REMOTE_DISTNAME & exit /b 1)
if "%~4"=="" (echo Error: Missing parameter LOCAL_TAR_FILE & exit /b 1)
if "%~5"=="" (echo Error: Missing parameter CURRENT_TIMESTAMP & exit /b 1)

:: Parameter mapping
set REMOTE_DIR=%~1
set REMOTE_BACKDIR=%~2
set REMOTE_DISTNAME=%~3
set LOCAL_TAR_FILE=%~4
set CURRENT_TIMESTAMP=%~5

:: Debug information
echo [INFO] Current working directory: %cd%
echo [INFO] REMOTE_DIR=%REMOTE_DIR%
echo [INFO] REMOTE_BACKDIR=%REMOTE_BACKDIR%
echo [INFO] REMOTE_DISTNAME=%REMOTE_DISTNAME%
echo [INFO] LOCAL_TAR_FILE=%LOCAL_TAR_FILE%
echo [INFO] CURRENT_TIMESTAMP=%CURRENT_TIMESTAMP%

:: Check remote directory
if not exist "%REMOTE_DIR%" (
    echo Error: Directory "%REMOTE_DIR%" does not exist
    exit /b 1
)

:: Change to directory
cd /d "%REMOTE_DIR%" || (
    echo Error: Unable to enter directory "%REMOTE_DIR%"
    exit /b 1
)

:: Check tar file
if not exist "%LOCAL_TAR_FILE%" (
    echo Error: File "%LOCAL_TAR_FILE%" does not exist
    exit /b 1
)

:: Create backup directory if it doesn't exist
if not exist "%REMOTE_BACKDIR%" (
    mkdir "%REMOTE_BACKDIR%" || (
        echo Error: Unable to create backup directory "%REMOTE_BACKDIR%"
        exit /b 1
    )
)

:: Backup old directory if it exists
if exist "%REMOTE_DISTNAME%" (
    move "%REMOTE_DISTNAME%" "%REMOTE_BACKDIR%\%REMOTE_DISTNAME%_%CURRENT_TIMESTAMP%" || (
        echo Error: Unable to backup old directory to "%REMOTE_BACKDIR%"
        exit /b 1
    )
    echo [INFO] Old directory has been backed up to %REMOTE_BACKDIR%\%REMOTE_DISTNAME%_%CURRENT_TIMESTAMP%
)

:: Try tar extraction silently
tar -zxvf "%LOCAL_TAR_FILE%" >nul 2>&1 || (
    echo [INFO] Failed to extract with tar, trying with 7z...
    7z x "%LOCAL_TAR_FILE%" -o"%REMOTE_DIR%" -y || (
        echo Error: Failed to extract with 7z
        exit /b 1
    )

    :: Check if the extracted file is a .tar file
    for %%F in ("%REMOTE_DIR%\*.tar") do (
        echo [INFO] Found additional .tar file: %%F
        7z x "%%F" -o"%REMOTE_DIR%" -y || (
            echo Error: Failed to extract inner .tar file
            exit /b 1
        )
        del "%%F"
    )
)
del "%LOCAL_TAR_FILE%" >nul 2>&1
echo [INFO] Operation completed successfully
exit /b 0
```

## 注意

1. 脚本中会调用`package.json`中 script 中的 build 命令,执行打包, 请务必保证有改打包命令
2. node14 安装时会报错, 就只有一个 node-ssh 依赖, 经测试不影响使用
3. 如果是 windows 系统, cmd 脚本需要以`CRLF`格式进行文件编辑和保存, 否则传到服务器,代码会失去换行挤到一起,导致脚本执行失败
4. 远程脚本智能更新: 工程目录下的脚本变动会自动检测并更新到服务器, 无需手动删除远程脚本
5. 路径分隔符按远程服务器类型自动处理(Linux/Windows), 上传与执行更稳健

## 最后

项目长期维护, 欢迎大家提 issue 和 star
