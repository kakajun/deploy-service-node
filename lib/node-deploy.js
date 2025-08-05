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
  checkFileExistsWin
} = require('./utils')

const DEPLOY_CONFIG_PATH = `${rootPath}/deployConfig.js`
const REMOTE_SH_PATH = `${rootPath}/remote-deploy.sh`
const REMOTE_BAT_PATH = `${rootPath}/remote-deploy.cmd`

;(async () => {
  let ssh
  try {
    // 检查是否传入了版本查看参数
    const versionFlagIndex = process.argv.indexOf('-v')
    const versionLongFlagIndex = process.argv.indexOf('--version')
    const nobuild = process.argv.includes('--nobuild')
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
      console.log('\x1b[32m正在将文件传输到服务器...\x1b[0m')

      await transferFileToRemote(
        ssh,
        deployConfig.LOCAL_TAR_FILE,
        path.join(
          deployConfig.REMOTE_DIR,
          path.basename(deployConfig.LOCAL_TAR_FILE)
        )
      )

      // 检测远程服务器操作系统类型
      let isLinux = await checkServerOS(ssh)
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

      let hasScript = isLinux
        ? await checkFileExistsLinux(ssh, remoteScriptPath)
        : await checkFileExistsWin(ssh, remoteScriptPath)
      if (!hasScript) {
        console.log('\x1b[32m正在将远程脚本文件传输到服务器...\x1b[0m')
        await transferFileToRemote(ssh, remoteSh, remoteScriptPath)
      } else {
        console.log('\x1b[32m远程脚本文件已存在...\x1b[0m')
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
        deployConfig.LOCAL_TAR_FILE,
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
