# 干部人事档案智能辅助系统（HR AI）

按《Coze项目代码结构规范》搭建的 **Next.js 15 App Router** 全栈应用，对应需求中的四大模块：

1. 政策问答（知识库限定答复）
2. 智能整编（分类 / 排序 / 导出 Excel）
3. 审核查验（三龄两历比对 + 完整性筛查 + 当日记录）
4. 人才综合分析（4 个演示页 + 动效；节点提醒可假编辑）

## 技术栈

- Next.js 15 + React 19 + TypeScript
- Tailwind CSS 4
- PostgreSQL（`DATABASE_URL`，Coze 自动注入；本地可空，走内存态）
- S3 兼容对象存储（`COZE_STORAGE_*`）
- Excel 导出：`xlsx`

## 本地运行

```bash
cd 代码
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`（默认进入政策问答）。

## 目录说明

```
app/                  # App Router 页面与 API
components/           # UI / 业务组件
lib/                  # db / storage / ai / 规则引擎 / 知识库
types/                # 全局类型
scripts/schema.sql    # 可选建表脚本
```

## 与需求对齐说明

| 需求点 | 实现 |
|--------|------|
| 政策问答不出知识库 | `lib/data/policy-kb.ts` 检索；无命中返回「未找到相关政策依据」 |
| 近期提问真实 | `/api/policy/history` 内存记录 |
| 管理知识库看原文 | `/policy/knowledge` |
| 整编三栏 + 导出 | `/archive` + `/api/archive/*` |
| 系统读取等摆设按钮 | 已禁用占位 |
| 规则可改即用 | 修正规则弹窗写回 `/api/*/rules` |
| 审核 8 项 + AI 意见 + 完整性 | `/audit` |
| 当日核验记录统计 | `/audit/records` |
| 人才分析仅展示 | `/talent*`；节点三时间可改 |

## Coze 部署

1. 在扣子创建「网页应用」编程项目，上传本目录代码
2. 对话中启用数据库 / 对象存储（如需持久化）
3. 执行 `scripts/schema.sql`（可选）
4. 构建：`npm run build`，启动：`npm start`

> 原任务书选型为 Vue + Dify + Ollama；本仓库按 Coze 强制规范改为 Next.js，业务能力在前端 + Route Handler 内落地，便于在 Coze 沙箱直接运行。
