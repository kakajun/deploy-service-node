const fs = require('fs/promises'); // 使用 fs.promises 提升异步操作体验
const { exec } = require('child_process');
const { NodeSSH } = require('node-ssh');
const path = require('path');
/**
 * 检查文件是否存在
 * @param {string} filePath - 文件路径
 * @param {string} fileName - 文件名（用于提示）
 */
const checkFileExists=  async function (filePath, fileName) {
  try {
  return  await fs.access(filePath);
  } catch (error) {
    console.error(`\x1b[31m文件 ${fileName} 不存在，请参照模板配置文件于根目录。\x1b[0m`);
    process.exit(1);
  }
}

/**
 * 执行本地命令
 * @param {string} command - 命令字符串
 * @returns {Promise<string>} - 命令输出
 */
async function runLocalCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`\x1b[31m执行本地命令失败：${error.message}\x1b[0m`);
        console.error(`\x1b[31mSTDERR: ${stderr}\x1b[0m`);
        return reject(error);
      }
      console.log(`\x1b[32mSTDOUT: ${stdout}\x1b[0m`);
      resolve(stdout);
    });
  });
}


/**
 * 传输文件到远程服务器
 * @param {NodeSSH} ssh - SSH 客户端实例
 * @param {string} localFilePath - 本地文件路径
 * @param {string} remoteFilePath - 远程文件路径
 */
async function transferFileToRemote(ssh, localFilePath, remoteFilePath) {
  try {
    await ssh.putFile(localFilePath, remoteFilePath);
    console.log(`\x1b[32m文件传输完成：${remoteFilePath}\x1b[0m`);
  } catch (error) {
    console.error(`\x1b[31m文件传输失败：${error.message}\x1b[0m`);
    throw error;
  }
}

/**
 * 在远程服务器上执行脚本
 * @param {NodeSSH} ssh - SSH 客户端实例
 * @param {string} scriptPath - 脚本路径
 * @param {Array<string>} args - 脚本参数
 */
async function executeRemoteScript(ssh, scriptPath, args) {
  const command = `bash ${scriptPath} ${args.join(' ')}`;
  try {
    const { stdout, stderr } = await ssh.execCommand(command, { cwd: path.dirname(scriptPath) });
    console.log(`STDOUT: ${stdout}`);
    console.log(`\x1b[34mSTDERR: ${stderr}\x1b[0m`);
    console.log('\x1b[32m脚本执行完毕！\x1b[0m');
  } catch (error) {
    console.error(`\x1b[31m远程脚本执行失败：${error.message}\x1b[0m`);
    throw error;
  }
}


/**
 * 初始化 SSH 客户端并连接到远程服务器
 * @param {Object} config - 远程服务器配置
 * @returns {Promise<NodeSSH>} - SSH 客户端实例
 */
async function connectToRemoteServer(config) {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: config.REMOTE_HOST,
      username: config.REMOTE_USER,
      password: config.REMOTE_PASSWORD,
      port: config.REMOTE_PORT,
    });
    console.log('\x1b[32m连接成功！\x1b[0m');
    return ssh;
  } catch (error) {
    console.error(`\x1b[31m连接到远程服务器失败：${error.message}\x1b[0m`);
    throw error;
  }
}

module.exports = {
  checkFileExists,
  runLocalCommand,
  transferFileToRemote,
  executeRemoteScript,
  connectToRemoteServer
}
