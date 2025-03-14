#!/usr/bin/env node
const { NodeSSH } = require('node-ssh')
const path = require('path')
const { exec } = require('child_process') // 引入 child_process 模块用于执行本地命令
const fs = require('fs') // 引入 fs 模块用于文件操作
const { program } = require('commander') // 引入 commander 库
const rootPath = process.cwd().replace(/\\/g, '/')

// 检查文件是否存在
function checkFileExists(filePath, fileName) {
  if (!fs.existsSync(filePath)) {
    console.error(`\x1b[31m文件 ${fileName} 不存在，请参照模板配置文件于根目录。\x1b[0m`);
    process.exit(1); // 退出脚本
  }
}

// 使用 process.cwd() 获取当前工作目录
const deployConfigPath = rootPath+'/deployConfig.js';
const remoteShPath =rootPath+ '/remote-deploy.sh';

// 检查 deployConfig 和 remoteSh 文件是否存在
checkFileExists(deployConfigPath, 'deployConfig');
checkFileExists(remoteShPath, 'remoteSh');

const deployConfig = require(deployConfigPath); // 引入配置文件
const remoteSh = remoteShPath;

// 初始化 SSH 客户端
const ssh = new NodeSSH()

// 执行本地命令的函数
function runLocalCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`\x1b[31m执行本地命令失败：${error.message}\x1b[0m`)
        console.error(`\x1b[31mSTDERR: ${stderr}\x1b[0m`)
        return reject(error)
      }
      console.log(`\x1b[32mSTDOUT: ${stdout}\x1b[0m`)
      resolve(stdout)
    })
  })
}

// 配置 commander
program
  .version('1.0.1', '-v, --version', '查看当前版本')
  .description('前端一键自动化部署插件, 实现脚本自定义')

// 解析命令行参数
program.parse(process.argv)

// 获取解析后的参数
const options = program.opts()

// 如果没有提供其他命令，则执行部署流程
if (!options.version) {
  (async () => {
    try {
      // 执行本地打包命令
      console.log('\x1b[32m开始打包前端项目...\x1b[0m')
      await runLocalCommand('npm run build')
      console.log('\x1b[32m前端项目打包完成！\x1b[0m')
      // 打包成 tar 文件（如果需要）
      console.log('\x1b[32m正在将打包后的文件压缩为 tar 文件...\x1b[0m')
      await runLocalCommand(
        `tar -czf ${deployConfig.LOCAL_TAR_FILE} ${deployConfig.REMOTE_DISTNAME}`
      )
      console.log('\x1b[32m文件压缩完成！\x1b[0m')

      // 连接到远程服务器
      console.log('\x1b[32m正在连接到远程服务器...\x1b[0m')
      try {
        await ssh.connect({
          host: deployConfig.REMOTE_HOST,
          username: deployConfig.REMOTE_USER,
          password: deployConfig.REMOTE_PASSWORD,
          port: deployConfig.REMOTE_PORT
        })
        console.log('\x1b[32m连接成功！\x1b[0m')
      } catch (connectError) {
        console.error(
          `\x1b[31m连接到远程服务器失败：${connectError.message}\x1b[0m`
        )
        process.exit(1) // 退出脚本
      }

      // 传输文件到远程服务器
      console.log('\x1b[32m正在将文件传输到服务器...\x1b[0m')
      await ssh.putFile(
        deployConfig.LOCAL_TAR_FILE,
        `${deployConfig.REMOTE_DIR}${path.basename(deployConfig.LOCAL_TAR_FILE)}`
      )
      console.log('\x1b[32m文件传输完成！\x1b[0m')

      // 传输远程脚本文件到远程服务器
      console.log('\x1b[32m正在将远程脚本文件传输到服务器...\x1b[0m')
      await ssh.putFile(
        remoteSh,
        `${deployConfig.REMOTE_DIR}remote-deploy.sh`
      )
      console.log('\x1b[32m远程脚本文件传输完成！\x1b[0m')

      // 获取当前时间戳
      const CURRENT_TIMESTAMP = new Date().toISOString().replace(/[-:.TZ]/g, '')

      // 在远程服务器上执行远程脚本
      console.log('\x1b[32m正在远程服务器上执行脚本...\x1b[0m')
      const { stdout, stderr } = await ssh.execCommand(
        `bash remote-deploy.sh ${deployConfig.REMOTE_DIR} ${deployConfig.REMOTE_BACKDIR} ${deployConfig.REMOTE_DISTNAME} ${deployConfig.LOCAL_TAR_FILE} ${CURRENT_TIMESTAMP}`,
        {
          cwd: deployConfig.REMOTE_DIR
        }
      )
      console.log(`STDOUT: ${stdout}`)
      console.log(`\x1b[34mSTDERR: ${stderr}\x1b[0m`)
      console.log('\x1b[32m脚本执行完毕！\x1b[0m')
    } catch (error) {
      console.error(`\x1b[31m发生错误：${error.message}\x1b[0m`)
    } finally {
      // 断开连接
      ssh.dispose()
    }
  })()
}