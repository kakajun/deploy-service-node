## 总览与优先级
- 目标：提升跨平台可用性、健壮性与安全性，完善 CLI 体验与文档一致性。
- 优先级顺序：路径与脚本健壮性 → 跨平台打包/解压 → SSH 与远程执行稳定性 → 配置安全与验证 → CLI 体验与文档。

## 路径与脚本参数
- 远程路径按服务器 OS 使用正确分隔符，避免 Windows 客户端将反斜杠传到 Linux 服务器导致 SFTP 失败或路径异常。调整上传前 OS 检测并使用 `path.posix`/`path.win32`。
  - 现状：上传时未区分服务器 OS，直接 `path.join` 构造远程路径 e:\git\deploy-service-node\lib\node-deploy.js:54–61。
  - 计划：连接后先检测 OS，再构造远程 TAR 目标路径与脚本路径。
- 远程脚本参数统一加引号并做最小转义，避免目录名包含空格或特殊字符时执行失败。
  - 现状：`args.join(' ')` 未加引号 e:\git\deploy-service-node\lib\utils.js:76–85。
  - 计划：对每个参数包裹双引号并适配 Linux/Windows 的转义规则。

## 跨平台打包/解压
- 本地打包健壮化：在调用 `tar` 前探测命令是否存在；若缺失，给出清晰提示或提供 Windows 备用方案（如 PowerShell `Compress-Archive` 生成 ZIP 并同步更新远程脚本逻辑）。
  - 现状：直接执行 `tar -czf` e:\git\deploy-service-node\lib\node-deploy.js:43–49。
  - 计划：新增命令探测，支持可配置的本地打包命令（从 `deployConfig.js` 读取）。
- 远程解压后删除压缩包，减少磁盘占用；并在 Linux/Windows 脚本中统一处理备份、解压失败回滚。
  - 现状：Linux/Windows 脚本解压后未删除 TAR e:\git\deploy-service-node\lib\remote-deploy.sh:27–28；e:\git\deploy-service-node\lib\remote-deploy.cmd:61–79。
  - 计划：脚本末尾删除压缩包；失败时恢复已备份目录。

## SSH 与远程执行
- OS 检测更稳健：优先 `uname -a`，失败后在 Windows 上尝试 `ver` 或 `cmd /c echo` 以判定环境。
  - 现状：异常时返回 `undefined`，可能误判 e:\git\deploy-service-node\lib\utils.js:147–160。
  - 计划：双分支检测并返回布尔值；记录判定日志。
- `execCommand` 输出完整解码：同时解码并打印 `stdout` 与 `stderr`，按 OS 选择 `utf8`/`gbk`。
  - 现状：仅处理 `stderr`，忽略 `stdout` e:\git\deploy-service-node\lib\utils.js:86–103。
  - 计划：统一输出到控制台，区分颜色与前缀。
- 连接错误处理与重试：为瞬时网络错误增加有限重试与超时提示；底层事件日志改为 debug 级而非注释掉。
  - 现状：底层 `error` 被注释，说明存在未定位问题 e:\git\deploy-service-node\lib\utils.js:127–133。
  - 计划：加重试（如 2–3 次指数退避），并打印简洁错误信息与排查建议。

## 配置与安全
- 支持私钥登录与环境变量读取，避免在仓库内明文口令。
  - 现状：`deployConfig.js` 仅支持明文密码 e:\git\deploy-service-node\deployConfig.js:2–11。
  - 计划：新增 `PRIVATE_KEY`/`PASSPHRASE` 字段与 `process.env.*` 覆盖；优先读取环境变量。
- 配置校验：在运行前校验必填项与路径格式，给出清晰错误信息。
  - 计划：启动时进行字段存在性与类型检查（不引入第三方库，直接手写轻量校验）。

## CLI 体验
- 命令行参数增强：
  - 新增 `--config <path>`、`--dry-run`（仅打印将执行的操作）、`--help`、`--retry <n>`、`--script <path>`、`--nobuild` 已有但补充到帮助。
  - `deploy -v`/`--version` 保持；在 `--help` 中展示配置示例与注意事项。
- 版本与执行信息：增加环节耗时统计与进度提示（连接、上传、执行脚本）。

## 文档与示例
- 统一 README 与代码行为：
  - 现状：README 展示在 `scripts` 中有单独 `tar` 任务，但代码里实际是直接调用 `tar`，存在不一致 e:\git\deploy-service-node\README.md:36–45。
  - 计划：更新文档为“工具内置打包”，或支持从配置选择“沿用项目自定义打包命令”。
- 补充私钥登录示例、环境变量示例与 Windows/Linux 常见问题排查。

## 维护性与代码质量
- 修正注释与类型：`runCommand` 注释声明返回 `Promise<string>` 与实现不一致，应改为 `Promise<void>` 或改为收集输出。
  - 现状：e:\git\deploy-service-node\lib\utils.js:24–50。
- 统一 `fsPromises` 与 `fs/promises` 的用法风格；模块内命名一致。
- 增加最小级别的集成测试脚本（本地模拟打包 + 伪上传 + 命令构造校验），保证关键路径变更后不回归。

## 变更范围与交付
- 代码改动：`lib/node-deploy.js`、`lib/utils.js`、`lib/remote-deploy.sh`、`lib/remote-deploy.cmd`、`deployConfig.js`。
- 新增能力但不增加运行时依赖；仅在需要时可选引入 `dotenv`（若你同意）。
- 交付内容：完成代码改动、更新 README、添加使用示例与帮助信息；在 Windows/Linux 环境分别自测上传与脚本执行。