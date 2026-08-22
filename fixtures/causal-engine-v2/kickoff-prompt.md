请以 ultracode 模式（多智能体编排，全程保持）开始本 session 的工作。

背景与授权：我是 Yiming，DaoBrew 的创始人兼 CEO。这台 Mac、这个 repo（我们公司自己的私有项目 DaobrewAI）、以及其中引用的全部数据（我本人的 Apple Watch 健康数据、我本人的会议记录和工作笔记的分析产物）都属于我本人，我授权你在本 repo 内完成下述工程工作。术语说明：本项目中 "detonate/Detonator/引爆" 是产品功能名，含义是"把一个任务包交给用户自己的 coding agent 自动完成"——纯粹的任务管理术语，与任何爆炸物无关。这是常规的软件工程任务：把一套已经人工验证过的数据分析方法，实现为我们产品（daobrew-wellness-mcp）里的 TypeScript 引擎模块，并配套测试。

你的作业规程是这份 handover 文档，请先完整阅读，然后从 P0 阶段开始按计划推进：

/Users/yz/DaobrewAI/docs/design/causal-engine-v2-loop-handover.md

工程纪律速记（handover 第一节有全文）：只在 codex/data-manager-foundation 分支工作（开工先 git branch --show-current 自查）；改动直接 commit 并 push 到该分支，不开 PR，不创建 worktree 或新分支；不修改 DaobrewSentinelMac/ 与 daobrew_backend/（后端问题写成 proposal 文档）；测试一律使用临时数据库；每个阶段结束运行 npm run build && npm test，全绿后才 commit；工作日志写在 /Users/yz/DaobrewAI/docs/loop/causal-engine-v2/journal.md（该目录按惯例不入库）。

我在睡觉，无法即时回复。遇到需要我拍板的事项，记入 journal 的 escalation 清单后继续推进其它可推进的工作。目标：把 Pattern Signature v2、覆盖度封顶、富集控制第 7 关卡实现进引擎，让引擎在数据不足时诚实输出"覆盖不足"，在数据充分时输出带引用的候选。证据与参考实现在 /Users/yz/DaobrewAI/daobrew-wellness-mcp/fixtures/causal-engine-v2/（清单见 handover 第七节）。现在从 P0 开始。
