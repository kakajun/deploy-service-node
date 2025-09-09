const fs = require('fs/promises') // 使用 fs.promises 提升异步操作体验
const { spawn } = require('child_process')
const { NodeSSH } = require('node-ssh')
const path = require('path')
const iconv = require('iconv-lite') // 用于 GBK/UTF-8 编码转换

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
 * @returns {Promise<string>} - 命令输出
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
  let command

  if (isLinux) {
    command = `bash ${scriptPath} ${args.join(' ')}`
  } else {
    command = `cmd /c "${scriptPath}"  ${args.join(' ')}`
    // console.log(command, 'command')
  }

  try {
    const result = await ssh.execCommand(command, {
      cwd: isLinux ? path.dirname(scriptPath) : '',
      encoding: 'binary' //以二进制方式获取输出
    })
    let stderr = iconv.decode(
      Buffer.from(result.stderr, 'binary'),
      isLinux ? 'utf8' : 'gbk'
    )

    if (stderr) console.log(`\x1b[34mSTDERR: ${stderr}\x1b[0m`)
    const currentTime = new Date().toLocaleTimeString('zh-CN', { hour12: false });
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
    // 先连接
    await ssh.connect({
      host: config.REMOTE_HOST,
      username: config.REMOTE_USER,
      password: config.REMOTE_PASSWORD,
      port: config.REMOTE_PORT || 22,
      readyTimeout: 20000,
      keepaliveInterval: 5000,
      keepaliveCountMax: 3
    })

    // 再获取底层 Client 实例
    const connection = ssh.connection
    // 现在可以安全地监听事件
    connection.on('error', err => {
      // 这里莫名会报错, 但又不影响使用  TODO
      // console.error('\x1b[31mSSH 客户端发生底层错误：\x1b[0m', err.message)
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
    if (!linuxResult.stderr && linuxResult.stdout) {
      console.log(`\x1b[32mThis is a Linux/Unix system\x1b[0m`)
      return true
    } else {
      console.log(`\x1b[32mThis is a Windows\x1b[0m`)
      return false
    }
  } catch (linuxErr) {
    console.error(linuxErr)
  }
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
  checkFileExistsWin
}
