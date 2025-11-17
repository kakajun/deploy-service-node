const fs = require('fs/promises') // 使用 fs.promises 提升异步操作体验
const { spawn } = require('child_process')
const { NodeSSH } = require('node-ssh')
const path = require('path')
const iconv = require('iconv-lite') // 用于 GBK/UTF-8 编码转换
const crypto = require('crypto')
const os = require('os')

/**
 * 检查文件是否存在
 * @param {string} filePath - 文件路径
 * @param {string} fileName - 文件名（用于提示）
 */
const checkFileExists = async function (filePath, fileName) {
  try {
    return await fs.access(filePath)
  } catch (error) {
    console.error(
      `\x1b[31m文件 ${fileName} 不存在，请参照模板配置文件于根目录。\x1b[0m`
    )
    process.exit(1)
  }
}

/**
 * 执行本地命令
 * @param {string} command - 命令字符串
 * @returns {Promise<void>}
 */
async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      // 仅在当前运行环境为 Windows 时，才使用 shell
      shell: process.platform === 'win32'
    })

    child.on('close', code => {
      if (code !== 0) {
        reject(
          new Error(`命令 ${command} ${args.join(' ')} 失败，退出码: ${code}`)
        )
      } else {
        resolve()
      }
    })

    child.on('error', err => {
      reject(err)
    })
  })
}

/**
 * 传输文件到远程服务器
 * @param {NodeSSH} ssh - SSH 客户端实例
 * @param {string} localFilePath - 本地文件路径
 * @param {string} remoteFilePath - 远程文件路径
 */
async function transferFileToRemote(ssh, localFilePath, remoteFilePath) {
  try {
    await ssh.putFile(localFilePath, remoteFilePath)
    console.log(`\x1b[32m文件传输完成：${remoteFilePath}\x1b[0m`)
  } catch (error) {
    console.error(`\x1b[31m文件传输失败：${error.message}\x1b[0m`)
    throw error
  }
}

/**
 * 在远程服务器上执行脚本
 * @param {NodeSSH} ssh - SSH 客户端实例
 * @param {string} scriptPath - 脚本路径
 * @param {Array<string>} args - 脚本参数
 * @param {boolean} isLinux - 是否为 Linux 系统
 */

async function executeRemoteScript(isLinux, ssh, scriptPath, args) {
  const quotedArgs = args.map(a => {
    const val = String(a)
    return isLinux ? `"${val.replace(/"/g, '\\"')}"` : `"${val.replace(/"/g, '"')}"`
  })
  const command = isLinux
    ? `bash "${scriptPath}" ${quotedArgs.join(' ')}`
    : `cmd /c "${scriptPath}" ${quotedArgs.join(' ')}`

  try {
    const result = await ssh.execCommand(command, {
      cwd: isLinux ? path.dirname(scriptPath) : '',
      encoding: 'binary'
    })
    const decoder = isLinux ? 'utf8' : 'gbk'
    const stdout = iconv.decode(Buffer.from(result.stdout || '', 'binary'), decoder)
    const stderr = iconv.decode(Buffer.from(result.stderr || '', 'binary'), decoder)
    if (stdout) console.log(`\x1b[36mSTDOUT: ${stdout}\x1b[0m`)
    if (stderr) console.log(`\x1b[34mSTDERR: ${stderr}\x1b[0m`)
    const currentTime = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    console.log(`\x1b[32m脚本执行完毕！${currentTime}\x1b[0m`)
  } catch (error) {
    console.error(`\x1b[31m远程脚本执行失败：${error.message}\x1b[0m`)
    throw error
  }
}
/**
 * 初始化 SSH 客户端并连接到远程服务器
 * @param {Object} config - 远程服务器配置
 * @returns {Promise<NodeSSH>} - SSH 客户端实例
 */
async function connectToRemoteServer(config) {
  const ssh = new NodeSSH()

  try {
    const connectOptions = {
      host: process.env.REMOTE_HOST || config.REMOTE_HOST,
      username: process.env.REMOTE_USER || config.REMOTE_USER,
      password: process.env.REMOTE_PASSWORD || config.REMOTE_PASSWORD,
      privateKey: process.env.REMOTE_PRIVATE_KEY || config.PRIVATE_KEY,
      passphrase: process.env.REMOTE_PASSPHRASE || config.PASSPHRASE,
      port: (process.env.REMOTE_PORT && Number(process.env.REMOTE_PORT)) || config.REMOTE_PORT || 22,
      readyTimeout: 20000,
      keepaliveInterval: 5000,
      keepaliveCountMax: 3
    }
    await ssh.connect(connectOptions)

    // 再获取底层 Client 实例
    const connection = ssh.connection
    // 现在可以安全地监听事件
    connection.on('error', err => {
      console.debug('\x1b[33mSSH 底层错误(调试信息)：\x1b[0m', err.message)
    })
    connection.on('close', () => {
      console.log('SSH 连接已关闭')
    })

    console.log('\x1b[32m连接成功！\x1b[0m')
    return ssh
  } catch (error) {
    console.error(`\x1b[31m连接到远程服务器失败：${error.message}\x1b[0m`)
    throw error
  }
}

/**
 * @description: 检查是不是linux系统
 * @param {*} ssh
 */
async function checkServerOS(ssh) {
  try {
    const linuxResult = await ssh.execCommand('uname -a')
    if (linuxResult && linuxResult.stdout && !linuxResult.stderr) {
      console.log(`\x1b[32mThis is a Linux/Unix system\x1b[0m`)
      return true
    }
  } catch (_) {}

  try {
    const winResult = await ssh.execCommand('cmd /c ver')
    if (winResult && (winResult.stdout || winResult.stderr)) {
      console.log(`\x1b[32mThis is a Windows\x1b[0m`)
      return false
    }
  } catch (_) {}

  console.log(`\x1b[33m无法确定远程系统类型，默认按 Windows 处理\x1b[0m`)
  return false
}

/**
 * @description: 检查服务器有没有该文件
 * @param {*} ssh
 */
async function checkFileExistsLinux(ssh, remotePath) {
  const result = await ssh.execCommand(
    `test -f "${remotePath}" && echo "File exists" || echo "File not found"`
  )
  if (result.stdout.includes('File exists')) {
    console.log(`\x1b[32m${remotePath} File exists\x1b[0m`)
    return true
  } else {
    console.log(`\x1b[32m${remotePath} File not found\x1b[0m`)
    return false
  }
}

async function checkFileExistsWin(ssh, remotePath) {
  const result = await ssh.execCommand(
    `if exist "${remotePath}" (echo File exists) else (echo File not found)`
  )
  if (result.stdout.includes('File exists')) {
    console.log(`\x1b[32m${remotePath}File exists\x1b[0m`)
    return true
  } else {
    console.log(`\x1b[32m${remotePath}File not found\x1b[0m`)
    return false
  }
}

module.exports = {
  checkFileExists,
  runCommand,
  transferFileToRemote,
  executeRemoteScript,
  connectToRemoteServer,
  checkServerOS,
  checkFileExistsLinux,
  checkFileExistsWin,
  computeLocalFileHash: async function (filePath) {
    const buf = await fs.readFile(filePath)
    return crypto.createHash('sha256').update(buf).digest('hex')
  },
  computeRemoteFileHash: async function (ssh, remotePath) {
    const tmp = path.join(
      os.tmpdir(),
      `deploy-script-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    try {
      await ssh.getFile(tmp, remotePath)
    } catch (_) {
      return null
    }
    try {
      const buf = await fs.readFile(tmp)
      await fs.unlink(tmp).catch(() => {})
      return crypto.createHash('sha256').update(buf).digest('hex')
    } catch (_) {
      await fs.unlink(tmp).catch(() => {})
      return null
    }
  }
}
