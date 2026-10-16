# DeepSeek 桌面项目级接入任务

## 1. 验证桌面桥接前提

- [x] 1.1 在隔离 DSH_HOME 中使用桌面 `0.2.0-rc.2` 验证宿主模块解析及可等待的 Agent 创建事件；记录可用的公开挂载接口与源码修订，不修改用户实际配置。
- [x] 1.2 用最小桥接在同一桌面宿主挂载两个 Agent 作用域的官方 MCP 客户端；实际调用工具，验证第三个未配置 Agent 看不到工具，并验证销毁/失败不会泄漏连接；不通过则保持本变更未完成，不以 CLI patch 替代。

## 2. 声明、登记与配置编辑

- [x] 2.1 实现项目 JSON 声明与摘要登记校验，测试默认/固定版本、未知 schema、额外字段、任意命令、损坏内容和源文本不泄漏。
- [x] 2.2 扩展 YAML 编辑以管理唯一桥接条目及多项目登记，覆盖注释/标签保留、重复安装、更新单项目、旧用户条目兼容、同名冲突和用户修改保护。
- [x] 2.3 实现 Git 根与真实目录匹配，测试普通子目录、worktree、非 Git 项目、路径前缀碰撞、符号链接、嵌套独立仓库及项目移动。

## 3. 桥接运行时与发布产物

- [x] 3.1 实现桥接对已登记项目的受限读取和按 Agent 挂载，以新建/恢复会话测试确认首次工具调用前完成加载，服务 cwd 与版本均属于该项目。
- [x] 3.2 实现去重、取消、启动失败、同名全局服务检测、Agent 销毁及桥接卸载清理，验证无全局回退、无部分工具残留、无子进程泄漏。
- [x] 3.3 将桥接产物纳入构建和包 files；运行 `pnpm build`、`pnpm pack --pack-destination /tmp`，在临时安装中验证复制产物可由宿主解析，不依赖开发目录或临时 npx 缓存。

## 4. CLI、事务及兼容

- [x] 4.1 扩展 DeepSeek 的 project/user scope、桌面发现及 all/auto 行为，更新测试以验证默认 project、显式 user 和多个客户端歧义；原有客户端回归通过。
- [x] 4.2 把项目声明、用户桥接、项目登记与项目资产组成一个 ChangePlan；测试 dry-run、非交互确认、并发修改、跨根链接逃逸、写入失败回滚及回滚失败诊断。
- [x] 4.3 实现项目独立移除、最后登记清理及双范围冲突指引；测试 A 移除不影响 B、重复移除、修改过的共享文件保留，以及迁移不删除项目资产。
- [x] 4.4 接通项目 print、status、doctor；测试缺失/过期登记、桥接损坏、已知不兼容、配置冲突、握手超时/缺工具；成功保留 `server-ready`，不声称客户端已加载。

## 5. 文档与验收

- [x] 5.1 仅精简更新 README 通用接入流程中的 project 默认值、首次桥接重启、本机登记和迁移提示；核对命令帮助，不新增 DeepSeek 独立长教程。
- [x] 5.2 运行 `pnpm exec vitest run test/mcp test/application test/commands/agent.test.ts test/commands/mcp.test.ts test/commands/deepseek.test.ts`，新增项目及桥接测试置于这些目录中；记录结果。
- [x] 5.3 在隔离目录通过真实 CLI 验证两种 scope 的 list、print、dry-run、init、重复安装、status、doctor、remove 及冲突迁移；记录文本/JSON 输出、文件与退出码。
- [x] 5.4 在同一桌面宿主进程中验证 A/B 项目不同版本、C 未登记、子目录、恢复与销毁、配置变更后重新打开会话、移除 A 后 B 仍可用；实际调用 `wot_status`、`wot_list` 并核对项目 Skill/Instructions。记录版本与运行时证据，不能仅用独立 MCP 握手替代。
- [x] 5.5 运行 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 及 `pnpm site:lint && pnpm site:build`；全部通过后使用 openspec-verify-change 核验，按 openspec-archive-change 同步主规格并归档。
