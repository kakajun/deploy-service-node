#!/usr/bin/env node
const path = require('path')
const fsPromises = require('fs/promises')
const rootPath = process.cwd().replace(/\\/g, '/')
const pkg = require('../package.json')
const localRemoteSh = path.join(__dirname, './remote-deploy.sh')
const localRemoteBat = path.join(__dirname, './remote-deploy.cmd')
const {
  checkFileExists,
  runCommand,
  transferFileToRemote,
  executeRemoteScript,
  checkServerOS,
  connectToRemoteServer,
  checkFileExistsLinux,
  checkFileExistsWin,
  computeLocalFileHash,
  computeRemoteFileHash
} = require('./utils')

let DEPLOY_CONFIG_PATH = `${rootPath}/deployConfig.js`
const REMOTE_SH_PATH = `${rootPath}/remote-deploy.sh`
const REMOTE_BAT_PATH = `${rootPath}/remote-deploy.cmd`

;(async () => {
  let ssh
  try {
    // 参数处理
    const argv = process.argv.slice(2)
    const versionFlagIndex = argv.indexOf('-v')
    const versionLongFlagIndex = argv.indexOf('--version')
    const helpFlagIndex = argv.indexOf('-h')
    const helpLongFlagIndex = argv.indexOf('--help')
    const configFlagIndex = argv.indexOf('--config')
    const nobuild = argv.includes('--nobuild')

    if (helpFlagIndex > -1 || helpLongFlagIndex > -1) {
      console.log(
        `用法: deploy [--nobuild] [--config <path>] [-v|--version] [-h|--help]\n\n` +
          `选项:\n` +
          `  --nobuild            跳过本地构建\n` +
          `  --config <path>     指定配置文件路径(默认: 项目根目录 deployConfig.js)\n` +
          `  -v, --version       显示版本\n` +
          `  -h, --help          显示帮助\n`
      )
      process.exit(0)
    }

    if (configFlagIndex > -1 && argv[configFlagIndex + 1]) {
      const customConfigPath = path.resolve(rootPath, argv[configFlagIndex + 1])
      DEPLOY_CONFIG_PATH = customConfigPath.replace(/\\/g, '/')
    }

    if (versionFlagIndex > -1 || versionLongFlagIndex > -1) {
      console.log(`当前版本: ${pkg.version}`)
      process.exit(0) // 结束程序
    } else {
      // 检查配置文件是否存在
      await checkFileExists(DEPLOY_CONFIG_PATH, 'deployConfig')
      const deployConfig = require(DEPLOY_CONFIG_PATH)
      console.log('\x1b[32m开始打包前端项目...\x1b[0m')
      if (!nobuild) {
        await runCommand('npm', ['run', 'build'])
        console.log('\x1b[32m前端项目打包完成！\x1b[0m')
      }

      console.log('\x1b[32m正在将打包后的文件压缩为 tar 文件...\x1b[0m')
      await runCommand('tar', [
        '-czf',
        deployConfig.LOCAL_TAR_FILE,
        deployConfig.REMOTE_DISTNAME
      ])
      console.log('\x1b[32m文件压缩完成！\x1b[0m')
      console.log('\x1b[32m正在连接到远程服务器...\x1b[0m')
      ssh = await connectToRemoteServer(deployConfig)

      // 检测远程服务器操作系统类型（在上传之前，确保路径分隔符正确）
      const isLinux = await checkServerOS(ssh)

      // 根据远程 OS 构造 TAR 目标路径
      const remoteTarFileName = path.basename(deployConfig.LOCAL_TAR_FILE)
      const remoteTarPath = isLinux
        ? path.posix.join(deployConfig.REMOTE_DIR, remoteTarFileName)
        : path.win32.join(deployConfig.REMOTE_DIR, remoteTarFileName)

      console.log('\x1b[32m正在将文件传输到服务器...\x1b[0m')
      await transferFileToRemote(
        ssh,
        deployConfig.LOCAL_TAR_FILE,
        remoteTarPath
      )

      let remoteSh = isLinux ? REMOTE_SH_PATH : REMOTE_BAT_PATH
      if (!(await fsPromises.stat(remoteSh).catch(() => false))) {
        remoteSh = isLinux ? localRemoteSh : localRemoteBat
      }
      const remoteScriptFileName = isLinux
        ? 'remote-deploy.sh'
        : 'remote-deploy.cmd'
      const remoteScriptPath = isLinux
        ? path.posix.join(deployConfig.REMOTE_DIR, remoteScriptFileName)
        : path.win32.join(deployConfig.REMOTE_DIR, remoteScriptFileName)

      const hasScript = isLinux
        ? await checkFileExistsLinux(ssh, remoteScriptPath)
        : await checkFileExistsWin(ssh, remoteScriptPath)
      if (!hasScript) {
        console.log('\x1b[32m正在将远程脚本文件传输到服务器...\x1b[0m')
        await transferFileToRemote(ssh, remoteSh, remoteScriptPath)
      } else {
        const localHash = await computeLocalFileHash(remoteSh)
        const remoteHash = await computeRemoteFileHash(ssh, remoteScriptPath)
        if (!remoteHash || remoteHash !== localHash) {
          console.log('\x1b[33m检测到脚本变更，正在更新远程脚本...\x1b[0m')
          await transferFileToRemote(ssh, remoteSh, remoteScriptPath)
        } else {
          console.log('\x1b[32m远程脚本文件已存在且内容一致...\x1b[0m')
        }
      }

      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const date = String(now.getDate()).padStart(2, '0')
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const seconds = String(now.getSeconds()).padStart(2, '0')

      const CURRENT_TIMESTAMP = `${year}-${month}-${date}_${hours}-${minutes}-${seconds}`
      console.log('\x1b[32m正在远程服务器上执行脚本...\x1b[0m')
      await executeRemoteScript(isLinux, ssh, remoteScriptPath, [
        deployConfig.REMOTE_DIR,
        deployConfig.REMOTE_BACKDIR,
        deployConfig.REMOTE_DISTNAME,
        remoteTarFileName,
        CURRENT_TIMESTAMP
      ])
    }
  } catch (error) {
    console.error(`\x1b[31m发生错误：${error.message}\x1b[0m`)
  } finally {
    if (ssh && ssh.isConnected()) {
      ssh.dispose()
    }
  }
})()
