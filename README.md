# 干部人事档案智能辅助系统（HR AI）

按《Coze项目代码结构规范》搭建的 **Next.js 15 App Router** 全栈应用。  
**全部业务数据从 PostgreSQL 读取**，运行前必须配置 `DATABASE_URL` 并执行灌库。

## 技术栈

- Next.js 15 + React 19 + TypeScript + Tailwind CSS 4
- PostgreSQL（强制）
- Excel 导出：`xlsx`

## 政策问答（扣子智能体）

已接入智能体 `COZE_BOT_ID=7700834694778617891`（绑定「档案政策知识库」）。

在 `.env.local` 配置：

```env
COZE_API_TOKEN=你的个人访问令牌
COZE_BOT_ID=7700834694778617891
# 智能整编：视觉提取材料名/形成日期（另建视觉理解 Bot 并发布 API）
COZE_VISION_BOT_ID=
```

`/api/policy/ask` 优先调用扣子 `/v3/chat`；失败时回退本地 `policy_documents` 表。

### 智能整编 · 扣子视觉

点「开始分类」时会先对**每件首页 JPG**调用视觉 Bot：上传文件 → `/v3/chat` 多模态 → 写回 `material_name` / `form_date`，再按关键词分类。

1. 扣子中新建单 Agent，模型选 **豆包·视觉理解**（或其它视觉模型）
2. 提示词可沿用「只输出 JSON：materialName / formDate / summary」
3. 发布为 **API**，把 Bot ID 填入 `COZE_VISION_BOT_ID`
4. 令牌需具备 `chat` + `uploadFile` 权限

## 数据库

```bash
cd 代码
# 配置 .env.local 中的 DATABASE_URL
npm run db:seed   # 建表 + 从需求附件灌入政策/档案/审核/人才数据
npm run dev
```

灌库内容包括：

| 表 | 来源 |
|----|------|
| `policy_documents` | 附件1 政策 docx 全文（34 份） |
| `business_rules` | 附件4/5/7/8 规则全文 |
| `archive_categories` / `classify_keywords` | 十大类与分类关键词 |
| `archive_pieces` / `archive_pages` | 附件3 乱序样本件与页文件 |
| `audit_field_sources` | 三龄两历提取出处 |
| `completeness_requirements` | 完整性筛查要求 |
| `talent_*` | 人才分析展示数据 |

健康检查：`GET /api/health` 应返回 `database: true` 及各表计数。

## 模块路由

| 路由 | 数据来源 |
|------|----------|
| `/policy` | `policy_documents` + `policy_history` |
| `/archive` | `archive_pieces` / 分类关键词 / 排序写回库 |
| `/audit` | `audit_field_sources` + 完整性规则 + `archive_pieces` |
| `/audit/records` | `audit_records`（当日） |
| `/talent*` | `talent_stats` / `profiles` / `match_scores` / `reminders` |

## 档案文件存储（S3）

智能整编上传的 JPG 写入对象存储，路径形如 `s3://{bucket}/archive/{人员代码}/{流水号}/{文件名}.jpg`。  
查看原图走 `/api/archive/page-image`，从 S3 拉取。

扣子编程会自动注入（本地开发可手动写入 `.env.local`）：

```env
COZE_STORAGE_URL=
COZE_STORAGE_AK=
COZE_STORAGE_SK=
COZE_STORAGE_BUCKET=
```

未配置时上传落到本地 `data/uploads`；种子附件仍可读 `public/archive`。

## Coze 部署

1. 配置 `DATABASE_URL`（及上述存储变量，扣子环境通常已注入）
2. 执行 `npm run db:seed`（或等价 SQL）
3. `npm run build` / `npm start`
