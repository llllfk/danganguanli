-- 干部人事档案智能辅助系统 · 全量表结构

CREATE TABLE IF NOT EXISTS sys_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policy_history (
  id BIGSERIAL PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL DEFAULT '',
  coze_conversation_id VARCHAR(64),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  found BOOL DEFAULT FALSE,
  thinking_ms INT4 DEFAULT 0,
  provider VARCHAR(32),
  sources JSONB DEFAULT '[]'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_policy_history_conv
  ON policy_history (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS audit_records (
  id BIGSERIAL PRIMARY KEY,
  person_name VARCHAR(100) NOT NULL,
  person_code VARCHAR(50) NOT NULL,
  summary TEXT,
  issue_count INT4 DEFAULT 0,
  report JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_key VARCHAR(50) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policy_documents (
  id BIGSERIAL PRIMARY KEY,
  doc_key VARCHAR(50) UNIQUE,
  title VARCHAR(255) NOT NULL,
  source_file VARCHAR(255),
  content TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS archive_categories (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  parent_code VARCHAR(10),
  sort_order INT4 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS classify_keywords (
  id BIGSERIAL PRIMARY KEY,
  category_code VARCHAR(10) NOT NULL REFERENCES archive_categories(code),
  keyword VARCHAR(100) NOT NULL,
  UNIQUE (category_code, keyword)
);

CREATE TABLE IF NOT EXISTS persons (
  person_code VARCHAR(50) PRIMARY KEY,
  person_name VARCHAR(100) NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Durable retry queue for uploaded files when a person's database records have been deleted.
CREATE TABLE IF NOT EXISTS person_file_cleanup (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50) NOT NULL,
  file_path TEXT NOT NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (person_code, file_path)
);

-- 乱序流水件（智能整编输入）
CREATE TABLE IF NOT EXISTS archive_pieces (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50) NOT NULL REFERENCES persons(person_code),
  serial_no VARCHAR(50) NOT NULL,
  page_count INT4 NOT NULL DEFAULT 1,
  material_name VARCHAR(255),
  summary TEXT,
  form_date VARCHAR(32),
  suggested_category VARCHAR(10) REFERENCES archive_categories(code),
  confirmed_category VARCHAR(10) REFERENCES archive_categories(code),
  formal_no VARCHAR(50),
  sort_index INT4,
  status VARCHAR(20) NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (person_code, serial_no)
);

CREATE TABLE IF NOT EXISTS archive_pages (
  id BIGSERIAL PRIMARY KEY,
  piece_id BIGINT NOT NULL REFERENCES archive_pieces(id) ON DELETE CASCADE,
  page_no INT4 NOT NULL,
  file_name VARCHAR(255),
  file_path TEXT,
  UNIQUE (piece_id, page_no)
);

-- 有序整编件（审核查验输入，对应附件6）
CREATE TABLE IF NOT EXISTS ordered_archive_pieces (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50) NOT NULL REFERENCES persons(person_code),
  formal_no VARCHAR(50) NOT NULL,
  category_code VARCHAR(10) NOT NULL,
  material_name VARCHAR(255) NOT NULL,
  summary TEXT,
  form_date VARCHAR(32),
  page_count INT4 NOT NULL DEFAULT 1,
  sort_index INT4 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (person_code, formal_no)
);

CREATE TABLE IF NOT EXISTS ordered_archive_pages (
  id BIGSERIAL PRIMARY KEY,
  piece_id BIGINT NOT NULL REFERENCES ordered_archive_pieces(id) ON DELETE CASCADE,
  page_no INT4 NOT NULL,
  file_name VARCHAR(255),
  file_path TEXT,
  UNIQUE (piece_id, page_no)
);

-- 审核：字段出处（从档案材料中提取后入库）
CREATE TABLE IF NOT EXISTS audit_field_sources (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50) NOT NULL REFERENCES persons(person_code),
  field_key VARCHAR(50) NOT NULL,
  field_label VARCHAR(50) NOT NULL,
  material_name VARCHAR(255) NOT NULL,
  form_year VARCHAR(16),
  material_no VARCHAR(80),
  value TEXT NOT NULL,
  form_date VARCHAR(32),
  is_baseline BOOL DEFAULT FALSE,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 页级文字缓存：避免重复调用视觉大模型
CREATE TABLE IF NOT EXISTS archive_page_texts (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50) NOT NULL,
  piece_ref VARCHAR(80) NOT NULL,
  page_no INT4 NOT NULL DEFAULT 1,
  material_name VARCHAR(255),
  file_path TEXT,
  text_content TEXT NOT NULL DEFAULT '',
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  source VARCHAR(20) NOT NULL DEFAULT 'vision',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (person_code, piece_ref, page_no)
);

CREATE INDEX IF NOT EXISTS idx_audit_sources_person_field
  ON audit_field_sources (person_code, field_key);

-- 完整性筛查条目（规则要求的必要材料）
CREATE TABLE IF NOT EXISTS completeness_requirements (
  id BIGSERIAL PRIMARY KEY,
  category_hint VARCHAR(50) NOT NULL,
  material_pattern VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  required_for VARCHAR(50) DEFAULT 'all',
  sort_order INT4 DEFAULT 0
);

-- 人才分析
CREATE TABLE IF NOT EXISTS talent_stats (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  value_text VARCHAR(50) NOT NULL,
  tip VARCHAR(255),
  sort_order INT4 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS talent_profiles (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50) REFERENCES persons(person_code),
  display_name VARCHAR(100) NOT NULL,
  title_text VARCHAR(100),
  tags JSONB DEFAULT '[]',
  sections JSONB DEFAULT '[]',
  meta JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS talent_match_scores (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50) REFERENCES persons(person_code),
  post_name VARCHAR(100) NOT NULL,
  score INT4 NOT NULL,
  reason TEXT,
  sort_order INT4 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS talent_reminders (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50) REFERENCES persons(person_code),
  person_name VARCHAR(100) NOT NULL,
  reminder_type VARCHAR(50) NOT NULL,
  event_date DATE NOT NULL,
  note TEXT,
  editable BOOL DEFAULT FALSE,
  sort_order INT4 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS talent_chart_items (
  id BIGSERIAL PRIMARY KEY,
  chart_key VARCHAR(32) NOT NULL,
  label VARCHAR(100) NOT NULL,
  value_num NUMERIC NOT NULL DEFAULT 0,
  value_extra NUMERIC,
  color VARCHAR(32),
  pct_text VARCHAR(32),
  sort_order INT4 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS talent_departments (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  post_count INT4 DEFAULT 0,
  expanded BOOL DEFAULT FALSE,
  sort_order INT4 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS talent_posts (
  id BIGSERIAL PRIMARY KEY,
  dept_id BIGINT NOT NULL REFERENCES talent_departments(id) ON DELETE CASCADE,
  post_name VARCHAR(100) NOT NULL,
  requirements TEXT,
  sort_order INT4 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS talent_match_checks (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50) NOT NULL,
  post_name VARCHAR(100) NOT NULL,
  dept_name VARCHAR(100),
  item_name VARCHAR(100) NOT NULL,
  require_text TEXT,
  record_text TEXT,
  is_ok BOOL DEFAULT FALSE,
  sort_order INT4 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS talent_title_promo (
  id BIGSERIAL PRIMARY KEY,
  person_code VARCHAR(50),
  person_name VARCHAR(100) NOT NULL,
  meta_text TEXT,
  verdict TEXT,
  is_ok BOOL DEFAULT FALSE,
  sort_order INT4 DEFAULT 0
);
