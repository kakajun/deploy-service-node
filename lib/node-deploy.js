#!/usr/bin/env node
const path = require('path');
const fsPromises = require('fs/promises');
const rootPath = process.cwd().replace(/\\/g, '/');
const pkg = require('../package.json');
const localRemoteSh = path.join(__dirname, './remote-deploy.sh');

const {
  checkFileExists,
  runLocalCommand,
  transferFileToRemote,
  executeRemoteScript,
  connectToRemoteServer
} = require('./utils');

const DEPLOY_CONFIG_PATH = `${rootPath}/deployConfig.js`;
const REMOTE_SH_PATH = `${rootPath}/remote-deploy.sh`;

(async () => {
  let ssh;
  try {
    // 检查是否传入了版本查看参数
    const versionFlagIndex = process.argv.indexOf('-v');
    const versionLongFlagIndex = process.argv.indexOf('--version');

    if (versionFlagIndex > -1 || versionLongFlagIndex > -1) {
      console.log(`当前版本: ${pkg.version}`);
      process.exit(0); // 结束程序
    } else {
      // 检查配置文件是否存在
      await checkFileExists(DEPLOY_CONFIG_PATH, 'deployConfig');
      let remoteSh = REMOTE_SH_PATH;
      if (!(await fsPromises.stat(remoteSh).catch(() => false))) {
        remoteSh = localRemoteSh;
      }
      const deployConfig = require(DEPLOY_CONFIG_PATH);
      console.log('\x1b[32m开始打包前端项目...\x1b[0m');
      await runLocalCommand('npm run build');
      console.log('\x1b[32m前端项目打包完成！\x1b[0m');
      console.log('\x1b[32m正在将打包后的文件压缩为 tar 文件...\x1b[0m');
      await runLocalCommand(
        `tar -czf ${deployConfig.LOCAL_TAR_FILE} ${deployConfig.REMOTE_DISTNAME}`
      );
      console.log('\x1b[32m文件压缩完成！\x1b[0m');
      console.log('\x1b[32m正在连接到远程服务器...\x1b[0m');
      ssh = await connectToRemoteServer(deployConfig);
      console.log('\x1b[32m正在将文件传输到服务器...\x1b[0m');
      await transferFileToRemote(
        ssh,
        deployConfig.LOCAL_TAR_FILE,
        `${deployConfig.REMOTE_DIR}${path.basename(deployConfig.LOCAL_TAR_FILE)}`
      );
      console.log('\x1b[32m正在将远程脚本文件传输到服务器...\x1b[0m');
      await transferFileToRemote(
        ssh,
        remoteSh,
        `${deployConfig.REMOTE_DIR}remote-deploy.sh`
      );
      const CURRENT_TIMESTAMP = new Date().toISOString().replace(/[-:.TZ]/g, '');
      console.log('\x1b[32m正在远程服务器上执行脚本...\x1b[0m');
      await executeRemoteScript(ssh, `${deployConfig.REMOTE_DIR}remote-deploy.sh`, [
        deployConfig.REMOTE_DIR,
        deployConfig.REMOTE_BACKDIR,
        deployConfig.REMOTE_DISTNAME,
        deployConfig.LOCAL_TAR_FILE,
        CURRENT_TIMESTAMP,
      ]);
    }
  } catch (error) {
    console.error(`\x1b[31m发生错误：${error.message}\x1b[0m`);
  } finally {
    if (ssh && ssh.isConnected()) {
      ssh.dispose();
    }
  }
})();
