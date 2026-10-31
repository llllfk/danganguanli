/**
 * 全量灌库：从需求附件 + seed JSON 写入 PostgreSQL
 * 用法：node scripts/seed-all.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import pg from "pg";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const projectRoot = path.resolve(root, "..");
const reqDir = path.join(projectRoot, "需求", "附件1-8");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i)]) {
      process.env[t.slice(0, i)] = t.slice(i + 1);
    }
  }
}

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}

function extractDocxText(docxPath) {
  // 纯 Node：读 zip 内 document.xml
  const AdmZip = (() => {
    try {
      return require("adm-zip");
    } catch {
      return null;
    }
  })();

  // 无 adm-zip 时用 PowerShell/.NET 或 python
  try {
    const py = `
import zipfile, xml.etree.ElementTree as ET, sys
p=sys.argv[1]
with zipfile.ZipFile(p) as z:
    root=ET.fromstring(z.read('word/document.xml'))
paras=[]
for para in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
    texts=[t.text or '' for t in para.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')]
    line=''.join(texts).strip()
    if line: paras.append(line)
sys.stdout.buffer.write('\\n'.join(paras).encode('utf-8'))
`;
    const out = execFileSync("python", ["-c", py, docxPath], {
      maxBuffer: 20 * 1024 * 1024,
    });
    return out.toString("utf8");
  } catch (e) {
    if (AdmZip) {
      const zip = new AdmZip(docxPath);
      const xml = zip.readAsText("word/document.xml");
      return xml
        .replace(/<w:p[^>]*>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    throw e;
  }
}

const CATEGORIES = [
  ["0100", "第一类 履历类材料", null, 10],
  ["0200", "第二类 自传和思想类材料", null, 20],
  ["0300", "第三类 考核鉴定类材料", null, 30],
  ["0401", "第四类（4-1）学历学位材料", "04", 41],
  ["0402", "第四类（4-2）专业技术职务材料", "04", 42],
  ["0403", "第四类（4-3）学术评鉴材料", "04", 43],
  ["0404", "第四类（4-4）教育培训材料", "04", 44],
  ["0500", "第五类 政审审计审核类材料", null, 50],
  ["0600", "第六类 党团类材料", null, 60],
  ["0700", "第七类 表彰奖励类材料", null, 70],
  ["0800", "第八类 处分处理类材料", null, 80],
  ["0901", "第九类（9-1）工资材料", "09", 91],
  ["0902", "第九类（9-2）任免材料", "09", 92],
  ["0903", "第九类（9-3）出国（境）材料", "09", 93],
  ["0904", "第九类（9-4）会议代表材料", "09", 94],
  ["1000", "第十类 其他材料", null, 100],
];

const KEYWORDS = [
  ["0100", ["履历表", "简历表", "履历书", "职工登记表"]],
  ["0200", ["自传", "思想汇报", "个人有关事项"]],
  ["0300", ["年度考核", "考核登记表", "考核评价表", "鉴定", "民主评议"]],
  ["0401", ["毕业生登记表", "学位授予", "学习成绩表", "毕业证", "学位证", "学生登记表", "高考"]],
  ["0402", ["专业技术资格", "职称", "任职资格", "聘任", "职业资格"]],
  ["0403", ["科研成果", "论文", "院士", "博士生导师"]],
  ["0404", ["培训登记", "进修", "培训结业", "初任培训"]],
  ["0500", ["政审", "专项审核", "审核认定", "任免审批表（全国干部人事档案专项", "基本信息审核认定"]],
  ["0600", ["入党志愿书", "入党申请书", "转正申请书", "入团志愿书", "党员登记表", "团员"]],
  ["0700", ["表彰", "奖励", "荣誉", "嘉奖"]],
  ["0800", ["处分", "违纪", "调查报告", "本人检查"]],
  ["0901", ["工资", "调资", "薪级"]],
  ["0902", ["任免审批表", "劳动合同", "就业人员登记表", "任职"]],
  ["0903", ["出国", "出境", "护照"]],
  ["0904", ["党代会", "人代会", "会议代表"]],
  ["1000", ["体检", "其他"]],
];

const RULES = {
  classify: fs.existsSync(path.join(reqDir, "附件4-人事档案材料分类规则.docx"))
    ? "见附件4，应用 classify_keywords 表"
    : "",
  sort: `干部人事档案材料排序规则
1/2/3/7/10类：按材料形成时间从早到晚
4/9类：先按小类集中，再按形成时间从早到晚
5类：处罚材料按批复→结论→调查→证明→本人检查；其余按时间；专项任免审批表在前、认定表在后
6类：入团材料（志愿书→申请书→登记表→退团）在前，入党材料（志愿书→申请书→转正→登记表）在后
8类：批复→处分决定→本人意见→调查报告→证明→本人检查`,
  audit: `信息比对规则
姓名：全档案交叉核对
出生时间：以最早形成材料记载为准；不一致提示「出生日期信息记载不一致」
参加工作时间：以身份对应原始审批材料为基准比对
入党时间：以入党志愿书接收预备党员时间为准
学历：以各阶段毕业生登记表为准
学位：以学位授予材料为准
工作经历：以专项审核《干部任免审批表》为准
组织认定：有《干部基本信息审核认定表》提示已认定，否则未检出`,
  completeness: `材料完整性筛查规则
1类：须有《干部履历表》
3类：年度考核登记表须自首次年度起连续
4-1：各阶段毕业生登记表；本科及以上须学位授予材料及毕业证/学位证复印件
4-2：有职称人员须专业技术资格评定表
5类：须有《干部任免审批表（全国干部人事档案专项审核工作专用）》
6类：党员须有入党志愿书、入党申请书、转正申请书
9-2：须有劳动合同书、辽宁省就业人员登记表`,
};

async function main() {
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("connected");

  // 旧库可能缺列：先按依赖顺序删表再建
  await client.query(`
    DROP TABLE IF EXISTS ordered_archive_pages CASCADE;
    DROP TABLE IF EXISTS ordered_archive_pieces CASCADE;
    DROP TABLE IF EXISTS archive_pages CASCADE;
    DROP TABLE IF EXISTS archive_pieces CASCADE;
    DROP TABLE IF EXISTS audit_field_sources CASCADE;
    DROP TABLE IF EXISTS sys_users CASCADE;
    DROP TABLE IF EXISTS classify_keywords CASCADE;
    DROP TABLE IF EXISTS completeness_requirements CASCADE;
    DROP TABLE IF EXISTS talent_reminders CASCADE;
    DROP TABLE IF EXISTS talent_match_scores CASCADE;
    DROP TABLE IF EXISTS talent_profiles CASCADE;
    DROP TABLE IF EXISTS talent_stats CASCADE;
    DROP TABLE IF EXISTS policy_documents CASCADE;
    DROP TABLE IF EXISTS business_rules CASCADE;
    DROP TABLE IF EXISTS archive_categories CASCADE;
    DROP TABLE IF EXISTS persons CASCADE;
  `);

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await client.query(schema);
  console.log("schema ok");

  // 默认登录账号
  {
    const { randomBytes, scryptSync } = await import("node:crypto");
    const hashPassword = (password) => {
      const salt = randomBytes(16).toString("hex");
      const hash = scryptSync(password, salt, 64).toString("hex");
      return `scrypt$${salt}$${hash}`;
    };
    for (const [phone, displayName, password, role] of [
      ["13800000001", "系统管理员", "Admin@123", "admin"],
      ["13800000002", "档案员", "User@123", "user"],
    ]) {
      await client.query(
        `INSERT INTO sys_users (username, display_name, password_hash, role)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (username) DO NOTHING`,
        [phone, displayName, hashPassword(password), role]
      );
    }
    console.log("sys_users: phone accounts seeded");
  }

  // categories
  for (const [code, name, parent, sort] of CATEGORIES) {
    await client.query(
      `INSERT INTO archive_categories (code, name, parent_code, sort_order) VALUES ($1,$2,$3,$4)`,
      [code, name, parent, sort]
    );
  }

  // keywords
  for (const [code, words] of KEYWORDS) {
    for (const w of words) {
      await client.query(
        `INSERT INTO classify_keywords (category_code, keyword) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [code, w]
      );
    }
  }

  // rules from 附件 if possible
  for (const [key, file] of [
    ["classify", "附件4-人事档案材料分类规则.docx"],
    ["sort", "附件5-人事档案材料排序规则.docx"],
    ["audit", "附件7-人事档案材料信息比对规则.docx"],
    ["completeness", "附件8-人事档案材料完整性筛查规则.docx"],
  ]) {
    const fp = path.join(reqDir, file);
    let content = RULES[key];
    if (fs.existsSync(fp)) {
      try {
        content = extractDocxText(fp);
        console.log("rule extracted:", file, content.length, "chars");
      } catch (e) {
        console.warn("rule extract fail", file, e.message);
      }
    }
    await client.query(
      `INSERT INTO business_rules (rule_key, content) VALUES ($1,$2)`,
      [key, content]
    );
  }

  // policy docs from 附件1
  const policyDir = path.join(reqDir, "附件1-档案政策知识库");
  if (fs.existsSync(policyDir)) {
    const files = fs
      .readdirSync(policyDir)
      .filter((f) => f.toLowerCase().endsWith(".docx"))
      .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
    let n = 0;
    for (const file of files) {
      const fp = path.join(policyDir, file);
      let content = "";
      try {
        content = extractDocxText(fp);
      } catch (e) {
        console.warn("policy extract fail", file, e.message);
        continue;
      }
      if (!content || content.length < 20) continue;
      const title = file.replace(/\.docx$/i, "");
      const docKey = `f${String(++n).padStart(3, "0")}`;
      await client.query(
        `INSERT INTO policy_documents (doc_key, title, source_file, content)
         VALUES ($1,$2,$3,$4)`,
        [docKey, title, file, content]
      );
    }
    console.log("policy_documents:", n);
  }

  // person
  await client.query(
    `INSERT INTO persons (person_code, person_name, meta) VALUES ($1,$2,$3)`,
    ["00001", "张三", JSON.stringify({ sample: true })]
  );

  // archive pieces + pages from disk sample
  const pieces = JSON.parse(
    fs.readFileSync(path.join(__dirname, "seed", "archive-pieces.json"), "utf8")
  );
  const sampleDir = path.join(reqDir, "附件3-人事档案测试样本-张三00001-乱序");
  for (const p of pieces) {
    let pageCount = 1;
    let pages = [];
    const folder = path.join(sampleDir, p.serialNo);
    if (fs.existsSync(folder)) {
      pages = fs
        .readdirSync(folder)
        .filter((f) => /\.jpe?g$/i.test(f))
        .sort();
      pageCount = pages.length || 1;
    }
    const ins = await client.query(
      `INSERT INTO archive_pieces
        (person_code, serial_no, page_count, material_name, summary, form_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,'uploaded')
       RETURNING id`,
      ["00001", p.serialNo, pageCount, p.materialName, p.summary, p.formDate]
    );
    const pieceId = ins.rows[0].id;
    // 真实分类答案写入 suggested 的参考字段暂存 meta：先只存材料名，分类由引擎按关键词写回
    // 额外：把标准分类存到 formal_no 临时不用；用 confirmed 空表示未核定
    for (let i = 0; i < (pages.length || 1); i++) {
      const fileName = pages[i] || `${p.serialNo}-${String(i + 1).padStart(3, "0")}.jpg`;
      await client.query(
        `INSERT INTO archive_pages (piece_id, page_no, file_name, file_path)
         VALUES ($1,$2,$3,$4)`,
        [
          pieceId,
          i + 1,
          fileName,
          pages[i] ? path.join(folder, pages[i]) : null,
        ]
      );
    }
  }
  // 把期望分类写入一张参考表字段：更新 material 时用 category 作为 ground-truth 存 meta via formal placeholder
  // 改用：seed 时把 category 写入 suggested_category 的「标准答案」列 — 实际分类由引擎覆盖；
  // 这里额外存到 persons.meta 不合适。改为 archive_pieces 增加前先写入 expected in summary? 
  // 更好：分类关键词引擎会根据 material_name 分类。seed 的 category 仅用于校验，写入 formal_no 前缀 'EXPECT:' 太脏。
  // 直接：不预填 suggested，由 classify API 根据关键词+材料名写库。
  console.log("archive_pieces:", pieces.length);

  // 附件6 有序样本 → ordered_archive_*（审核查验数据源）
  const orderedMeta = JSON.parse(
    fs.readFileSync(path.join(__dirname, "seed", "ordered-pieces.json"), "utf8")
  );
  const orderedRoot = path.join(
    reqDir,
    "附件6-人事档案测试样本-张三00001-有序"
  );
  let orderedIdx = 0;
  for (const p of orderedMeta) {
    orderedIdx += 1;
    const catFolder = `00001-${p.category === "1000" ? "1001" : p.category}`;
    const pieceDir = path.join(orderedRoot, catFolder, p.formalNo);
    let pages = [];
    if (fs.existsSync(pieceDir) && fs.statSync(pieceDir).isDirectory()) {
      pages = fs
        .readdirSync(pieceDir)
        .filter((f) => /\.jpe?g$/i.test(f))
        .sort();
    } else {
      // 个别类目直接放页文件，如 0404
      const catDir = path.join(orderedRoot, catFolder);
      if (fs.existsSync(catDir)) {
        pages = fs
          .readdirSync(catDir)
          .filter(
            (f) =>
              /\.jpe?g$/i.test(f) &&
              (f.startsWith(p.formalNo) || f.includes(p.formalNo))
          )
          .sort();
        if (!pages.length) {
          pages = fs
            .readdirSync(catDir)
            .filter((f) => /\.jpe?g$/i.test(f))
            .sort();
        }
      }
    }
    const pageCount = pages.length || 1;
    const baseDir =
      fs.existsSync(pieceDir) && fs.statSync(pieceDir).isDirectory()
        ? pieceDir
        : path.join(orderedRoot, catFolder);
    const ins = await client.query(
      `INSERT INTO ordered_archive_pieces
        (person_code, formal_no, category_code, material_name, summary, form_date, page_count, sort_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        "00001",
        p.formalNo,
        p.category,
        p.materialName,
        p.summary,
        p.formDate,
        pageCount,
        orderedIdx,
      ]
    );
    const pieceId = ins.rows[0].id;
    for (let i = 0; i < pageCount; i++) {
      const fileName =
        pages[i] || `${p.formalNo}-${String(i + 1).padStart(3, "0")}.jpg`;
      const filePath = pages[i] ? path.join(baseDir, pages[i]) : null;
      await client.query(
        `INSERT INTO ordered_archive_pages (piece_id, page_no, file_name, file_path)
         VALUES ($1,$2,$3,$4)`,
        [pieceId, i + 1, fileName, filePath]
      );
    }
  }
  console.log("ordered_archive_pieces:", orderedMeta.length);

  // audit sources
  const sources = JSON.parse(
    fs.readFileSync(path.join(__dirname, "seed", "audit-sources.json"), "utf8")
  );
  for (const s of sources) {
    await client.query(
      `INSERT INTO audit_field_sources
        (person_code, field_key, field_label, material_name, form_year, material_no, value, form_date, is_baseline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        "00001",
        s.fieldKey,
        s.fieldLabel,
        s.materialName,
        s.formYear,
        s.materialNo,
        s.value,
        s.formDate,
        s.isBaseline,
      ]
    );
  }
  console.log("audit_field_sources:", sources.length);

  // completeness requirements
  const comps = [
    ["1类", "干部履历表", "须有《干部履历表》", "all", 1],
    ["3类", "年度考核", "年度考核登记表须自首次年度起连续", "all", 2],
    ["4-1类", "毕业生登记表", "须有各阶段毕业生登记表", "all", 3],
    ["4-1类", "学位授予", "本科及以上须学位授予材料", "bachelor+", 4],
    ["4-1类", "毕业证", "须有毕业证/学位证复印件", "bachelor+", 5],
    ["4-2类", "专业技术资格", "有职称人员须专业技术资格评定表", "titled", 6],
    ["5类", "专项审核", "须有《干部任免审批表（全国干部人事档案专项审核工作专用）》", "all", 7],
    ["6类", "入党志愿书", "党员须有入党志愿书", "party", 8],
    ["6类", "入党申请书", "党员须有入党申请书", "party", 9],
    ["6类", "转正申请书", "党员须有转正申请书", "party", 10],
    ["9-2类", "劳动合同", "须有劳动合同书", "all", 11],
    ["9-2类", "就业人员登记表", "须有辽宁省就业人员登记表", "all", 12],
  ];
  for (const [hint, pattern, desc, req, sort] of comps) {
    await client.query(
      `INSERT INTO completeness_requirements
        (category_hint, material_pattern, description, required_for, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [hint, pattern, desc, req, sort]
    );
  }

  // talent
  const stats = [
    ["在库人才", "1,286", "较上月 +12", 1],
    ["高潜干部", "86", "画像完备率 92%", 2],
    ["人岗匹配待办", "23", "本周新增 5", 3],
    ["临期节点", "17", "30日内到期", 4],
  ];
  for (const [title, value, tip, sort] of stats) {
    await client.query(
      `INSERT INTO talent_stats (title, value_text, tip, sort_order) VALUES ($1,$2,$3,$4)`,
      [title, value, tip, sort]
    );
  }
  await client.query(
    `INSERT INTO talent_profiles (person_code, display_name, title_text, tags, sections)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)`,
    [
      "00001",
      "张三",
      "00001 · 科员",
      JSON.stringify(["管理骨干", "理工背景", "党员", "中级职称", "英语良好"]),
      JSON.stringify(["能力雷达", "经历时间轴", "培训与考核"]),
    ]
  );
  const matches = [
    ["综合管理岗", 92, "履历完整 · 考核优秀", 1],
    ["专业技术岗", 84, "职称匹配 · 培训充分", 2],
    ["党建工作岗", 78, "党团材料齐全", 3],
  ];
  for (const [post, score, reason, sort] of matches) {
    await client.query(
      `INSERT INTO talent_match_scores (person_code, post_name, score, reason, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      ["00001", post, score, reason, sort]
    );
  }
  const reminders = [
    ["00001", "张三", "retire", "2042-05-12", "退休时间", true, 1],
    ["00001", "张三", "probation", "2011-01-01", "试用期满时间", true, 2],
    ["00001", "张三", "contract", "2027-07-01", "合同到期时间", true, 3],
    ["00002", "李四", "probation", "2026-11-01", "试用期满", false, 4],
    ["00003", "王五", "retire", "2026-12-15", "退休临近", false, 5],
  ];
  for (const [code, name, type, date, note, editable, sort] of reminders) {
    if (code !== "00001") {
      await client.query(
        `INSERT INTO persons (person_code, person_name) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [code, name]
      );
    }
    await client.query(
      `INSERT INTO talent_reminders
        (person_code, person_name, reminder_type, event_date, note, editable, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [code, name, type, date, note, editable, sort]
    );
  }

  const counts = await client.query(`
    SELECT 'policy_documents' t, count(*)::int n FROM policy_documents
    UNION ALL SELECT 'archive_pieces', count(*)::int FROM archive_pieces
    UNION ALL SELECT 'audit_field_sources', count(*)::int FROM audit_field_sources
    UNION ALL SELECT 'talent_stats', count(*)::int FROM talent_stats
    UNION ALL SELECT 'business_rules', count(*)::int FROM business_rules
  `);
  console.log("counts:", Object.fromEntries(counts.rows.map((r) => [r.t, r.n])));
  await client.end();
  console.log("seed done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
