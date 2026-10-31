import { query } from "@/lib/db";

type FieldRow = {
  person_code: string;
  field_key: string;
  value: string;
  is_baseline: boolean;
  material_name: string | null;
  form_date: string | null;
  material_no: string | null;
};

async function listBaselineFields(personCode?: string) {
  const r = await query<FieldRow>(
    personCode
      ? `SELECT person_code, field_key, value, is_baseline,
                material_name, form_date, material_no
         FROM audit_field_sources
         WHERE person_code = $1
         ORDER BY field_key, is_baseline DESC, form_date NULLS LAST, id`
      : `SELECT person_code, field_key, value, is_baseline,
                material_name, form_date, material_no
         FROM audit_field_sources
         ORDER BY person_code, field_key, is_baseline DESC, form_date NULLS LAST, id`,
    personCode ? [personCode] : []
  );
  return r.rows;
}

function pickBaseline(rows: FieldRow[], personCode: string, key: string) {
  const list = rows.filter(
    (x) => x.person_code === personCode && x.field_key === key
  );
  return list.find((x) => x.is_baseline) || list[0] || null;
}

function normalizeEdu(raw: string) {
  const v = raw || "";
  if (/研究生|硕士|博士/.test(v)) return "研究生";
  if (/本科|大学/.test(v)) return "本科";
  if (/大专|专科/.test(v)) return "大专";
  if (/中专|中技/.test(v)) return "中专";
  if (/高中/.test(v)) return "高中";
  if (/初中/.test(v)) return "初中";
  return v || "其他";
}

function ageFromBirth(birth: string, now = new Date()) {
  const m = birth.match(/(\d{4})[-/.年]?(\d{1,2})?[-/.月]?(\d{1,2})?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2] || 1) - 1;
  const d = Number(m[3] || 1);
  const b = new Date(y, mo, d);
  let age = now.getFullYear() - b.getFullYear();
  const md = now.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

function ageBucket(age: number) {
  if (age >= 56) return "56岁以上";
  if (age >= 46) return "46-55岁";
  if (age >= 36) return "36-45岁";
  return "35岁以下";
}

const AGE_COLORS: Record<string, string> = {
  "56岁以上": "#A878D0",
  "46-55岁": "#F0A04B",
  "36-45岁": "#4A9FD9",
  "35岁以下": "#3DB883",
};

const EDU_COLORS: Record<string, string> = {
  本科: "#4A9FD9",
  研究生: "#3DB883",
  大专: "#F0A04B",
  中专: "#E8704B",
  初中: "#E85C60",
  高中: "#A878D0",
  其他: "#94a3b8",
};

/** 有档案或审核提取记录的人员 */
export async function listArchivePersons() {
  const r = await query<{ person_code: string; person_name: string }>(
    `SELECT p.person_code, p.person_name
     FROM persons p
     WHERE EXISTS (SELECT 1 FROM audit_field_sources a WHERE a.person_code = p.person_code)
        OR EXISTS (SELECT 1 FROM ordered_archive_pieces o WHERE o.person_code = p.person_code)
        OR EXISTS (SELECT 1 FROM archive_pieces ap WHERE ap.person_code = p.person_code)
     ORDER BY p.person_code`
  );
  return r.rows.map((row) => ({
    code: row.person_code,
    name: row.person_name,
  }));
}

export async function listTalentStats() {
  const persons = await listArchivePersons();
  const pieces = await query<{ n: string }>(
    `SELECT (
        (SELECT count(*) FROM archive_pieces) +
        (SELECT count(*) FROM ordered_archive_pieces)
      )::text AS n`
  );
  const posts = await query<{ n: string }>(
    `SELECT count(*)::text n FROM talent_posts`
  );
  const depts = await query<{ n: string }>(
    `SELECT count(*)::text n FROM talent_departments`
  );
  return [
    {
      title: "在档人员",
      value: String(persons.length),
      tip: "有档案/审核提取记录",
    },
    {
      title: "材料件数",
      value: pieces.rows[0]?.n || "0",
      tip: "乱序件+有序件",
    },
    {
      title: "岗位总数",
      value: posts.rows[0]?.n || "0",
      tip: "组织岗位配置",
    },
    {
      title: "部门单位",
      value: depts.rows[0]?.n || "0",
      tip: "组织部门配置",
    },
  ];
}

export async function listTalentCharts() {
  const fields = await listBaselineFields();
  const persons = [...new Set(fields.map((f) => f.person_code))];

  const ageCount: Record<string, number> = {
    "56岁以上": 0,
    "46-55岁": 0,
    "36-45岁": 0,
    "35岁以下": 0,
  };
  const eduCount: Record<string, number> = {};

  for (const code of persons) {
    const birth = pickBaseline(fields, code, "birth")?.value || "";
    const age = ageFromBirth(birth);
    if (age != null) ageCount[ageBucket(age)] += 1;

    const edu = normalizeEdu(pickBaseline(fields, code, "education")?.value || "");
    if (edu) eduCount[edu] = (eduCount[edu] || 0) + 1;
  }

  // 职称：从有序材料名称统计（含“工程师/职称/资格”）
  const titleMats = await query<{ material_name: string }>(
    `SELECT material_name FROM ordered_archive_pieces
     WHERE material_name ILIKE '%职称%' OR material_name ILIKE '%工程师%'
        OR material_name ILIKE '%资格%'`
  );
  const rankCount: Record<string, number> = {
    正高级: 0,
    副高级: 0,
    中级: 0,
    初级: 0,
    无职称: 0,
  };
  if (persons.length && !titleMats.rows.length) {
    rankCount["无职称"] = persons.length;
  } else {
    for (const code of persons) {
      const mats = await query<{ material_name: string }>(
        `SELECT material_name FROM ordered_archive_pieces WHERE person_code = $1`,
        [code]
      );
      const text = mats.rows.map((m) => m.material_name).join("|");
      if (/正高|教授级/.test(text)) rankCount["正高级"] += 1;
      else if (/副高|高级工程师|副教授/.test(text)) rankCount["副高级"] += 1;
      else if (/中级|工程师[^级]|讲师/.test(text)) rankCount["中级"] += 1;
      else if (/初级|助理工程师|助工/.test(text)) rankCount["初级"] += 1;
      else if (/职称|资格|工程师/.test(text)) rankCount["中级"] += 1;
      else rankCount["无职称"] += 1;
    }
  }

  // 专业：从学历/学位材料名粗分
  const majorCount: Record<string, number> = {};
  for (const code of persons) {
    const mats = await query<{ material_name: string }>(
      `SELECT material_name FROM ordered_archive_pieces
       WHERE person_code = $1 AND category_code LIKE '04%'`,
      [code]
    );
    const text = mats.rows.map((m) => m.material_name).join("|");
    let major = "其他";
    if (/水利|水电/.test(text)) major = "水利水电类";
    else if (/土木|建筑/.test(text)) major = "建筑土木类";
    else if (/计算机|信息/.test(text)) major = "计算机信息类";
    else if (/经济|管理/.test(text)) major = "经济管理类";
    else if (mats.rows.length) major = "综合/未细分";
    majorCount[major] = (majorCount[major] || 0) + 1;
  }

  const totalEdu = Object.values(eduCount).reduce((a, b) => a + b, 0) || 1;

  return {
    age: Object.entries(ageCount)
      .filter(([, n]) => n > 0)
      .map(([label, count]) => ({
        label,
        count,
        color: AGE_COLORS[label] || "#4A9FD9",
      })),
    rank: Object.entries(rankCount).map(([label, total]) => ({
      label,
      total,
      eligible: 0,
    })),
    edu: Object.entries(eduCount).map(([label, count]) => ({
      label,
      count,
      pct: `${((count / totalEdu) * 100).toFixed(1)}%`,
      color: EDU_COLORS[label] || "#94a3b8",
    })),
    major: Object.entries(majorCount).map(([label, count]) => ({
      label,
      count,
    })),
  };
}

export async function getTalentPortrait(personCode = "00001") {
  const persons = await listArchivePersons();
  let code = personCode;
  let name =
    persons.find((p) => p.code === code)?.name ||
    persons.find((p) => p.name === personCode)?.name;
  if (!name) {
    const byName = persons.find((p) => p.name.includes(personCode));
    if (byName) {
      code = byName.code;
      name = byName.name;
    }
  }
  if (!name) {
    // 仅代码命中
    const hit = persons.find((p) => p.code === personCode);
    if (hit) {
      code = hit.code;
      name = hit.name;
    }
  }
  if (!name) return null;

  const fields = await listBaselineFields(code);
  const birth = pickBaseline(fields, code, "birth");
  const work = pickBaseline(fields, code, "work");
  const party = pickBaseline(fields, code, "party");
  const edu = pickBaseline(fields, code, "education");
  const degree = pickBaseline(fields, code, "degree");
  const exp = pickBaseline(fields, code, "experience");
  const recognition = pickBaseline(fields, code, "recognition");

  const mats = await query<{
    material_name: string;
    form_date: string | null;
    formal_no: string | null;
    category_code: string;
  }>(
    `SELECT material_name, form_date, formal_no, category_code
     FROM ordered_archive_pieces
     WHERE person_code = $1
     ORDER BY form_date NULLS LAST, sort_index NULLS LAST`,
    [code]
  );

  const timeline = mats.rows
    .filter((m) =>
      /履历|毕业|学位|任免|职称|入党|登记|合同|聘/.test(m.material_name)
    )
    .slice(-12)
    .reverse()
    .map((m) => ({
      date: (m.form_date || "").slice(0, 7) || "-",
      text: m.material_name,
      source: `来源：${m.material_name}${m.form_date ? `（${m.form_date.slice(0, 4)}）` : ""}`,
    }));

  if (!timeline.length && exp?.value) {
    timeline.push({
      date: "-",
      text: exp.value,
      source: `来源：${exp.material_name || "审核提取"}`,
    });
  }

  const titleMats = mats.rows.filter((m) =>
    /职称|资格|工程师/.test(m.material_name)
  );
  const promotion = titleMats.map((m, i) => ({
    date: (m.form_date || "").slice(0, 7) || "-",
    label: m.material_name,
    pending: i === titleMats.length - 1 && titleMats.length === 1,
  }));

  const assessments = mats.rows
    .filter((m) => /考核/.test(m.material_name))
    .map((m) => ({
      year: (m.form_date || "").slice(0, 4) || "-",
      result: "见材料",
      note: m.material_name,
    }));

  const awards = mats.rows
    .filter((m) => /奖励|表彰|先进|荣誉/.test(m.material_name))
    .map((m) => ({
      year: (m.form_date || "").slice(0, 4) || "-",
      title: m.material_name,
      source: `来源：${m.formal_no || m.material_name}`,
    }));

  const trendYears = [
    ...new Set(assessments.map((a) => a.year).filter((y) => y !== "-")),
  ].sort();
  const trend = trendYears.map((year) => ({
    year,
    level: "称职",
  }));

  const jobTitle =
    titleMats[titleMats.length - 1]?.material_name ||
    (/工程师/.test(mats.rows.map((m) => m.material_name).join("|"))
      ? "工程师"
      : "");

  return {
    personCode: code,
    name,
    title: `${code} · ${jobTitle || "在档人员"}`,
    tags: [
      edu?.value ? normalizeEdu(edu.value) : "",
      party?.value ? "党员" : "",
      jobTitle ? "有职称材料" : "",
    ].filter(Boolean),
    sections: ["基本信息", "任职经历", "考核奖惩"],
    gender: "",
    ethnicity: "",
    dob: birth?.value || "",
    political: party?.value ? "中共党员" : "",
    joinParty: party?.value || "",
    workStart: work?.value || "",
    education: edu?.value || "",
    degree: degree?.value || "",
    jobTitle,
    position: "",
    contractLevel: "",
    archiveStatus: recognition?.value || (mats.rows.length ? "有序档案在库" : "已提取"),
    timeline,
    promotion,
    assessments,
    trend,
    awards,
  };
}

export async function listMatchScores(personCode = "00001") {
  const r = await query<{
    post_name: string;
    score: number;
    reason: string | null;
  }>(
    `SELECT post_name, score, reason
     FROM talent_match_scores
     WHERE person_code = $1
     ORDER BY sort_order, id`,
    [personCode]
  );
  return r.rows.map((row) => ({
    post: row.post_name,
    score: row.score,
    reason: row.reason || "",
  }));
}

function yearsSince(dateStr: string) {
  const age = ageFromBirth(dateStr);
  return age;
}

function computeVerify(
  portrait: Awaited<ReturnType<typeof getTalentPortrait>>,
  postName: string,
  deptName: string,
  req: string
) {
  if (!portrait) return [];
  const needYears = (() => {
    const m = req.match(/(\d+)\s*年/);
    return m ? Number(m[1]) : null;
  })();
  const years = portrait.workStart ? yearsSince(portrait.workStart) : null;
  const needBachelor = /本科|研究生/.test(req);
  const eduOk = needBachelor
    ? /本科|大学|研究生|硕士|博士/.test(portrait.education)
    : !!portrait.education || !req;

  return [
    {
      item: "学历",
      require: needBachelor
        ? "本科及以上"
        : /大专|专科/.test(req)
          ? "大专及以上"
          : "见岗位要求",
      record: portrait.education || "档案未提取",
      ok: eduOk,
      postName,
      deptName,
    },
    {
      item: "工作年限",
      require: needYears != null ? `${needYears} 年及以上` : "见岗位要求",
      record:
        years != null
          ? `${years} 年（${portrait.workStart} 起）`
          : "档案未提取参加工作时间",
      ok:
        needYears == null
          ? true
          : years != null && years >= needYears,
      postName,
      deptName,
    },
    {
      item: "政治面貌",
      require: /党员/.test(req) ? "中共党员" : "不限",
      record: portrait.political || "档案未提取",
      ok: !/党员/.test(req) || !!portrait.joinParty,
      postName,
      deptName,
    },
    {
      item: "职称材料",
      require: /中级|高级|初级/.test(req) ? "具备相应职称材料" : "不限",
      record: portrait.jobTitle || "未见职称材料",
      ok: !/中级|高级|初级/.test(req) || !!portrait.jobTitle,
      postName,
      deptName,
    },
  ];
}

export async function listMatchBoard(personCode?: string) {
  const stats = await listTalentStats();
  const persons = await listArchivePersons();
  const code = personCode || persons[0]?.code || "00001";
  const portrait = await getTalentPortrait(code);

  const summary = [
    {
      label: "岗位总数",
      value: stats.find((s) => s.title.includes("岗位"))?.value || "0",
      tip: "组织岗位配置",
      tone: "blue" as const,
    },
    {
      label: "在档人员",
      value: String(persons.length),
      tip: "有档案记录",
      tone: "green" as const,
    },
    {
      label: "部门单位",
      value: stats.find((s) => s.title.includes("部门"))?.value || "0",
      tip: "组织部门配置",
      tone: "orange" as const,
    },
  ];

  const depts = await query<{
    id: string;
    name: string;
    post_count: number;
    expanded: boolean;
  }>(
    `SELECT id::text, name, post_count, expanded
     FROM talent_departments ORDER BY sort_order, id`
  );

  const departments = [];
  for (const d of depts.rows) {
    const posts = await query<{
      post_name: string;
      requirements: string | null;
    }>(
      `SELECT post_name, requirements FROM talent_posts
       WHERE dept_id = $1::bigint ORDER BY sort_order, id`,
      [d.id]
    );
    departments.push({
      name: d.name,
      count: posts.rows.length || d.post_count || 0,
      expanded: d.expanded,
      posts: posts.rows.map((p) => ({
        name: p.post_name,
        req: p.requirements || "",
      })),
    });
  }

  // 取第一个有要求的岗位做默认核验
  let postName = "";
  let deptName = "";
  let req = "";
  for (const d of departments) {
    if (d.posts.length) {
      postName = d.posts[0].name;
      deptName = d.name;
      req = d.posts[0].req;
      break;
    }
  }

  const stored = await query<{
    item_name: string;
    require_text: string | null;
    record_text: string | null;
    is_ok: boolean;
    post_name: string;
    dept_name: string | null;
  }>(
    `SELECT item_name, require_text, record_text, is_ok, post_name, dept_name
     FROM talent_match_checks
     WHERE person_code = $1
     ORDER BY sort_order, id`,
    [code]
  );

  const verifyRows =
    stored.rows.length > 0
      ? stored.rows.map((c) => ({
          item: c.item_name,
          require: c.require_text || "",
          record: c.record_text || "",
          ok: c.is_ok,
          postName: c.post_name,
          deptName: c.dept_name || "",
        }))
      : computeVerify(portrait, postName, deptName, req);

  const okN = verifyRows.filter((v) => v.ok).length;
  const score =
    verifyRows.length > 0 ? Math.round((okN / verifyRows.length) * 100) : 0;
  const storedScores = await listMatchScores(code);
  const scores =
    storedScores.length > 0 && storedScores.some((s) => s.score > 0)
      ? storedScores
      : postName
        ? [
            {
              post: postName,
              score,
              reason: `${okN}/${verifyRows.length} 项条件符合（按档案提取计算）`,
            },
          ]
        : [];

  return {
    summary,
    departments,
    persons,
    selectedPersonCode: code,
    verifyRows,
    scores,
  };
}

export async function listReminders() {
  const fields = await listBaselineFields();
  const persons = await listArchivePersons();
  const out: Array<{
    id: string;
    personCode: string;
    personName: string;
    type: string;
    date: string;
    note: string;
    editable: boolean;
  }> = [];

  for (const p of persons) {
    const birth = pickBaseline(fields, p.code, "birth")?.value;
    if (birth) {
      const m = birth.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const retire = `${Number(m[1]) + 60}-${m[2]}-${m[3]}`;
        out.push({
          id: `retire-${p.code}`,
          personCode: p.code,
          personName: p.name,
          type: "retire",
          date: retire,
          note: "按出生时间+60年推算",
          editable: false,
        });
      }
    }
    const work = pickBaseline(fields, p.code, "work")?.value;
    if (work) {
      // 试用期满：参加工作后 1 年（历史节点）
      const m = work.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        out.push({
          id: `probation-${p.code}`,
          personCode: p.code,
          personName: p.name,
          type: "probation",
          date: `${Number(m[1]) + 1}-${m[2]}-${m[3]}`,
          note: "按参加工作时间+1年推算试用期满",
          editable: false,
        });
      }
    }
  }

  // 库内可编辑提醒（仅限有档案人员）
  const codes = new Set(persons.map((p) => p.code));
  const r = await query<{
    id: string;
    person_code: string | null;
    person_name: string;
    reminder_type: string;
    event_date: string;
    note: string | null;
    editable: boolean;
  }>(
    `SELECT id::text, person_code, person_name, reminder_type,
            event_date::text, note, editable
     FROM talent_reminders
     ORDER BY sort_order, event_date`
  );
  for (const row of r.rows) {
    if (row.person_code && !codes.has(row.person_code)) continue;
    out.push({
      id: row.id,
      personCode: row.person_code || "",
      personName: row.person_name,
      type: row.reminder_type,
      date: row.event_date.slice(0, 10),
      note: row.note || "",
      editable: row.editable,
    });
  }

  return out;
}

export async function listTitlePromo() {
  const persons = await listArchivePersons();
  const out = [];
  for (const p of persons) {
    const mats = await query<{ material_name: string; form_date: string | null }>(
      `SELECT material_name, form_date FROM ordered_archive_pieces
       WHERE person_code = $1 AND (
         material_name ILIKE '%职称%' OR material_name ILIKE '%资格%' OR material_name ILIKE '%工程师%'
       )
       ORDER BY form_date NULLS LAST`,
      [p.code]
    );
    const last = mats.rows[mats.rows.length - 1];
    const hasMid = mats.rows.some((m) => /中级|工程师/.test(m.material_name));
    const hasSenior = mats.rows.some((m) => /副高|高级|正高/.test(m.material_name));
    out.push({
      id: `title-${p.code}`,
      code: p.code,
      name: p.name,
      meta: last
        ? `${last.material_name}${last.form_date ? `（${last.form_date.slice(0, 7)}）` : ""}`
        : "未见职称材料",
      verdict: hasSenior
        ? "已具备高级相关材料"
        : hasMid
          ? "已具备中级相关材料"
          : "暂不满足晋级材料条件",
      ok: hasMid || hasSenior,
    });
  }
  return out;
}

export async function updateReminderDate(id: string, date: string) {
  if (!/^\d+$/.test(id)) {
    throw new Error("推算节点不可编辑");
  }
  const r = await query<{
    id: string;
    person_name: string;
    reminder_type: string;
    event_date: string;
    note: string | null;
    editable: boolean;
  }>(
    `UPDATE talent_reminders
     SET event_date = $1::date
     WHERE id = $2::bigint AND editable = TRUE
     RETURNING id::text, person_name, reminder_type, event_date::text, note, editable`,
    [date, id]
  );
  const row = r.rows[0];
  if (!row) throw new Error("不可编辑或不存在");
  return {
    id: row.id,
    personName: row.person_name,
    type: row.reminder_type,
    date: row.event_date.slice(0, 10),
    note: row.note || "",
    editable: row.editable,
  };
}
