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

const REMOTE_SH_PATH = `${rootPath}/remote-deploy.sh`
const REMOTE_BAT_PATH = `${rootPath}/remote-deploy.cmd`

/**
 * 查找默认部署配置文件，支持 .js 和 .cjs 后缀
 * @returns {Promise<string|null>} 配置文件路径或 null
 */
async function resolveDefaultConfigPath() {
  const candidates = [
    `${rootPath}/deployConfig.js`,
    `${rootPath}/deployConfig.cjs`
  ]
  for (const candidate of candidates) {
    try {
      await fsPromises.access(candidate)
      return candidate
    } catch (_) {}
  }
  return null
}

/**
 * 将 sh 脚本中的 CRLF 换行符统一转换为 LF，避免在 Linux 上执行报错
 * @param {string} filePath - 原始脚本路径
 * @returns {Promise<string>} 转换后临时文件路径
 */
async function normalizeShLineEndings(filePath) {
  const content = await fsPromises.readFile(filePath, 'utf8')
  const normalized = content.replace(/\r\n/g, '\n')
  const tmpFile = path.join(
    require('os').tmpdir(),
    `deploy-script-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`
  )
  await fsPromises.writeFile(tmpFile, normalized, 'utf8')
  return tmpFile
}

;(async () => {
  let ssh
  let tmpShPath = null
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
          `  --config <path>     指定配置文件路径(默认: 项目根目录 deployConfig.js 或 deployConfig.cjs)\n` +
          `  -v, --version       显示版本\n` +
          `  -h, --help          显示帮助\n`
      )
      process.exit(0)
    }

    let deployConfigPath
    if (configFlagIndex > -1 && argv[configFlagIndex + 1]) {
      deployConfigPath = path
        .resolve(rootPath, argv[configFlagIndex + 1])
        .replace(/\\/g, '/')
    } else {
      deployConfigPath = await resolveDefaultConfigPath()
      if (!deployConfigPath) {
        console.error(
          `\x1b[31m未找到默认配置文件 deployConfig.js 或 deployConfig.cjs，请参照模板配置文件于根目录。\x1b[0m`
        )
        process.exit(1)
      }
    }

    if (versionFlagIndex > -1 || versionLongFlagIndex > -1) {
      console.log(`当前版本: ${pkg.version}`)
      process.exit(0) // 结束程序
    } else {
      // 检查配置文件是否存在
      await checkFileExists(deployConfigPath, 'deployConfig')
      const deployConfig = require(deployConfigPath)
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

      // Linux 环境下上传前统一将 sh 脚本换行符转为 LF，避免 CRLF 导致执行失败
      let uploadShPath = remoteSh
      if (isLinux) {
        tmpShPath = await normalizeShLineEndings(remoteSh)
        uploadShPath = tmpShPath
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
        await transferFileToRemote(ssh, uploadShPath, remoteScriptPath)
      } else {
        const localHash = await computeLocalFileHash(uploadShPath)
        const remoteHash = await computeRemoteFileHash(ssh, remoteScriptPath)
        if (!remoteHash || remoteHash !== localHash) {
          console.log('\x1b[33m检测到脚本变更，正在更新远程脚本...\x1b[0m')
          await transferFileToRemote(ssh, uploadShPath, remoteScriptPath)
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
    if (tmpShPath) {
      await fsPromises.unlink(tmpShPath).catch(() => {})
    }
    if (ssh && ssh.isConnected()) {
      ssh.dispose()
    }
  }
})()
