# DeepSeek Harness 实施任务

## 1. 固定兼容依据

- [x] 1.1 记录实施所用 DSH 版本及对应源码修订，核对官方 insert 补丁、用户级配置加载、路径解析和 Skill 发现规则；将版本及证据链接补入 design.md，并在隔离配置中验证示例补丁可被组合。
- [x] 1.2 用包含注释、自定义标签、CRLF、流式列表、空文档及文档结束标记的 fixture 验证 YAML 解析与局部编辑方案，再加入必要的 catalog 依赖和锁文件；以局部修改后无关源文本不变、表达式未执行为通过条件。

## 2. 客户端与配置生命周期

- [x] 2.1 新增 DeepSeek 适配器并注册 `deepseek`，实现 dsh/配置探测及 DSH_HOME 路径解析；通过默认、空白、绝对、相对、波浪号路径与缺失可执行文件测试。
- [x] 2.2 实现完整补丁 print 与 init、版本更新、inspect 和 remove；通过不存在/空配置、重复安装、重复移除、`--pin` 及保留无关内容测试。
- [x] 2.3 增加托管身份和冲突判断，对损坏 YAML、重复键、重复 id、同名服务、修改过的配置及无法定位的引用拒绝修改；以文件原样保留及 status/doctor 正确报错为验证结果。
- [x] 2.4 为新增诊断和计划提供受控文本，避免泄露 env、无关插件字段或解析失败原文；用带秘密值的有效与损坏配置验证文本、JSON 输出均不包含这些值。

## 3. 事务与项目资产

- [x] 3.1 将 MCP 修改接入现有 ChangePlan，处理主目录外及尚不存在的 DSH_HOME 所需路径边界；验证缺失根目录、目标符号链接、父级链接逃逸和并发修改，不降低其他客户端现有保护。
- [x] 3.2 复用项目 Skill 和 Instructions，增加仅针对 DeepSeek Skill 的 Git 根定位检查；覆盖 Git 根、子目录、worktree 文件、非 Git 目录及 `--with mcp`，验证不隐式写入父目录。
- [x] 3.3 验证组合计划的 dry-run、非交互确认、重复安装、用户修改保护及移除；用提交阶段故障验证 MCP/Skill/Instructions 一并回滚，并保留回滚失败的诊断信息。

## 4. 命令与诊断

- [x] 4.1 接通 agent/mcp 子命令、帮助和客户端列表，明确不支持的 project scope 错误；通过 user scope 的 all/auto、project scope 排除及多个探测结果的歧义回归测试。
- [x] 4.2 接通 MCP doctor 的配置、握手、必需工具和注册状态，注册检查首版返回 unsupported；验证成功为 server-ready，配置错误、超时或缺少工具为 failed，且不会自动启动 DSH 或导出配置。

## 5. 文档与验收

- [x] 5.1 仅在 README 更新支持矩阵、复制给 Agent 的接入指引、显式 user scope 示例、作用范围、共享资产移除影响及模式限制；核对所有 DeepSeek 命令与实际帮助一致。
- [x] 5.2 运行定向测试：`pnpm exec vitest run test/mcp/clients.test.ts test/mcp/registration.test.ts test/application/agent-onboarding.test.ts test/application/change-plan.test.ts test/application/mcp-doctor.test.ts test/commands/agent.test.ts test/commands/mcp.test.ts`，并包含新增 DeepSeek 专用测试文件；记录通过结果。
- [x] 5.3 在隔离临时项目和 DSH_HOME 中通过真实 CLI 验证 list、print、init dry-run、init、重复 init、status、doctor、remove、重复 remove 及不支持的 scope，覆盖文本与 JSON；确认用户真实配置未被修改。
- [x] 5.4 在记录版本的真实 DSH 标准模式中加载生成配置，实际发现并调用 `wot_status`、`wot_list`，加载 wot-ui-v2 Skill 并确认托管 Instructions 可见；记录运行时证据，缺少运行前提时保持此任务未完成。
- [x] 5.5 运行 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 和 `pnpm site:lint && pnpm site:build`，确认原有客户端、MCP 契约和 README 官网消费均无回归。
- [x] 5.6 实施及所有验收完成后使用 openspec-verify-change 核对规格与证据，修复发现的问题；确认无误后使用 openspec-archive-change 同步规格并归档，记录验证结果和支持版本。
