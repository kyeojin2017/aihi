# Supabase DB 스키마 설계 플랜

## 1. 목표
지금까지는 `localStorage`로 병원 방문/하루 증상 기록을 임시 저장했는데,
DB를 Supabase로 확정하면서 **md 기획서 전체 범위**를 기준으로 테이블 구조를 다시 잡는다.
이번 문서는 **스키마 설계 + 마이그레이션 플랜**까지만 다룬다.
실제 Supabase 프로젝트 연결/코드 교체는 계정·프로젝트가 준비된 다음 단계에서 진행한다.

## 2. 설계 원칙
- **한 계정 = 한 가족.** 로그인은 Supabase Auth로 한 명(예: 엄마)만 하고,
  그 아래 "가족구성원"을 여러 명 등록해서 각자 기록을 나눠 관리한다.
  (가족구성원 각자가 로그인하는 구조 아님 — 지금 사이드바 UI와 동일한 전제)
- 모든 기록 테이블은 `member_id`로 `family_members`를 참조한다.
- RLS(Row Level Security)로 "내 가족구성원의 기록만" 보이게 막는다 — `family_members.owner_id = auth.uid()` 를 기준으로 삼는다.
- `js/storage.js`의 함수 시그니처(`getVisits`, `addVisit`, `getSymptom`, `saveSymptom` 등)는 그대로 유지하고,
  내부 구현만 localStorage → Supabase 호출로 바꾼다. 화면 코드(`visits.js`, `symptoms.js`, `main.js`)는 손대지 않는 게 목표.

## 3. 테이블 구조

### 3.1 family_members — 가족구성원 (개인정보 포함)
md "1. 개인정보" 항목(성별/생년월일/혈액형/키/몸무게)을 가족구성원 프로필에 통합한다.
BMI는 저장하지 않고 키/몸무게로 화면에서 계산.

```sql
create table family_members (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,                 -- "본인", "배우자", "서준"
  relation     text,                          -- 본인/배우자/자녀 등
  avatar_label text,                          -- 사이드바 아바타 글자 ("나","배","아")
  gender       text,                          -- 'male' | 'female' | 'other'
  birth_date   date,
  blood_type   text,                          -- 'A+','O-' 등
  height_cm    numeric,
  weight_kg    numeric,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

### 3.2 conditions — 갖고 있는 질병과 약
```sql
create table conditions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references family_members(id) on delete cascade,
  name       text not null,        -- 질병/증상명
  memo       text,                 -- 복용약, 메모
  created_at timestamptz not null default now()
);
```

### 3.3 supplements — 복용 중인 영양제
```sql
create table supplements (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references family_members(id) on delete cascade,
  name       text not null,
  dosage     text,
  frequency  text,
  memo       text,
  created_at timestamptz not null default now()
);
```

### 3.4 symptoms — 하루 증상 기록 (건강일기 0번)
지금 localStorage 모델과 거의 동일. 날짜+구성원당 1행.
```sql
create table symptoms (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references family_members(id) on delete cascade,
  date        date not null,
  has_symptom boolean,
  tags        text[] not null default '{}',
  pain_level  smallint check (pain_level between 1 and 5),
  temperature numeric,
  action      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (member_id, date)
);
```

### 3.5 visits — 병원 방문 (건강일기 1번)
```sql
create table visits (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references family_members(id) on delete cascade,
  date             date not null,
  time             time,
  hospital         text not null,
  department       text,
  doctor           text,
  next_visit_date  date,
  treatment        text,   -- 처치 · 수액
  diagnosis_memo   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index visits_member_date_idx on visits (member_id, date desc);
```

### 3.6 prescriptions / prescription_items — 처방전 (건강일기 2번)
방문 1건에 처방전이 여러 개일 수 있고, 처방전 1건에 약이 여러 개라 2단으로 나눈다.
```sql
create table prescriptions (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references family_members(id) on delete cascade,
  visit_id     uuid references visits(id) on delete set null,
  start_date   date not null,
  end_date     date,
  caution_memo text,       -- 주의해야 할 메모 (음식 조심, 공복 복용 금지 등)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table prescription_items (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  drug_name       text not null,
  dose            text,       -- "250mg"
  frequency       text,       -- "1일 3회"
  note            text        -- "식후 30분"
);
```
중복 복용 확인 기능(다른 증상 약과 성분 겹치는지)은 별도 약 성분 DB 연동이 필요해서 스키마만 잡아두고 로직은 이후 단계.

### 3.7 checkups — 접종 및 검진 (건강일기 3번)
접종/검진을 한 테이블에 `type`으로 구분.
```sql
create table checkups (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references family_members(id) on delete cascade,
  type         text not null check (type in ('vaccine','screening')),
  category     text,        -- 필수/증상별 (접종) 또는 국가/개인 (검진)
  name         text not null,
  date         date,
  status       text,        -- 'done' | 'scheduled'
  result_memo  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

### 3.8 photos — 병원기록지 사진 (건강일기 4번)
파일 자체는 Supabase Storage 버킷(`medical-photos`, private)에 올리고, 이 테이블은 메타데이터만 관리.
업로드 경로는 `<member_id>/<파일명>` 형식으로 고정 — 스토리지 정책이 경로의 첫 폴더(=member_id)로
소유자를 확인하기 때문에 반드시 이 규칙을 지켜야 함 (자세한 정책은 `supabase/storage.sql` 참고).
```sql
create table photos (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references family_members(id) on delete cascade,
  visit_id     uuid references visits(id) on delete set null,
  date         date not null,
  storage_path text not null,   -- Supabase Storage 경로
  caption      text,
  created_at   timestamptz not null default now()
);
```

### 3.9 life_logs — 생활 바이오리듬 (md 3번)
식사/운동/수면/수분/음주/카페인/월경을 날짜+구성원당 1행으로.
```sql
create table life_logs (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references family_members(id) on delete cascade,
  date           date not null,
  meals          jsonb,          -- [{ "time":"08:00", "memo":"..." }, ...]
  exercise_min   int,
  sleep_hours    numeric,
  water_ml       int,
  alcohol        boolean,
  caffeine_mg    int,
  is_period_day  boolean,
  memo           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (member_id, date)
);
```

## 4. RLS 정책 (요약)
모든 기록 테이블은 `family_members`를 거쳐 소유자를 확인한다.

```sql
alter table family_members enable row level security;
create policy "own family members" on family_members
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- symptoms/visits/checkups/photos/life_logs/conditions/supplements 공통 패턴
alter table visits enable row level security;
create policy "own visits" on visits
  for all using (
    member_id in (select id from family_members where owner_id = auth.uid())
  ) with check (
    member_id in (select id from family_members where owner_id = auth.uid())
  );
-- 나머지 테이블도 동일 패턴으로 반복 (prescriptions는 member_id 기준, prescription_items는 prescription_id → prescriptions.member_id로 한 단계 더 조인)
```

## 5. localStorage → Supabase 매핑

| 지금 (localStorage) | Supabase |
|---|---|
| `healthDiary.visits` (memberId 문자열: "self"/"spouse"/"seojun") | `visits` 테이블, `member_id`는 `family_members.id` (uuid) |
| `healthDiary.symptoms` | `symptoms` 테이블 |
| 사이드바에 하드코딩된 가족구성원 3명 | `family_members` 3행으로 시딩, `data-member` 값을 uuid로 교체 필요 |

`js/storage.js`의 함수는 전부 **Promise를 반환하도록 async 전환**이 필요하다
(localStorage는 동기, Supabase 클라이언트는 비동기). `symptoms.js`/`visits.js`의 호출부에도
`await`가 들어가야 하므로, 이 부분은 화면 코드도 일부 손댈 수밖에 없다는 점을 미리 인지해둔다.

## 6. 진행 상태

- [x] Supabase 프로젝트 연결 (팀장님 프로젝트 `ixngwiwcfdbhtoycwkpl`)
  - `js/supabaseConfig.js` + `js/supabaseClient.js`에 URL/publishable key 설정 완료 (publishable key는 공개용이라 git 커밋해도 안전)
  - **주의**: 이 프로젝트의 직접 연결 주소(`db.ixngwiwcfdbhtoycwkpl.supabase.co`)는 IPv6 전용이라 일반 네트워크에서 안 열릴 수 있음.
    스키마 작업 등 DB에 직접 붙어야 할 때는 **Connection pooling(Transaction pooler)** 주소를 써야 함:
    `aws-0-ap-northeast-1.pooler.supabase.com:6543`, user `postgres.ixngwiwcfdbhtoycwkpl`
- [x] `supabase/schema.sql` 작성 + 실제 DB에 적용 완료 — 테이블 10개(family_members, conditions, supplements, symptoms, visits, prescriptions, prescription_items, checkups, photos, life_logs) 전부 생성, RLS 전 테이블 활성화 + 정책 1개씩 확인 완료
- [x] 로그인 화면 추가 (`login.html` + `js/login.js`, Supabase Auth 이메일/비밀번호 — 매직링크는 보류)
  - `js/auth.js`가 `index.html` 진입 시 세션 체크 후 비로그인 상태면 `login.html`로 리다이렉트, 아바타 클릭 시 로그아웃
- [x] `supabase/storage.sql` 작성 + 적용 완료 — `medical-photos` 버킷(private) 생성, 소유자 기준 접근 정책 적용
- [ ] `family_members` 시딩 (본인/배우자/서준) — RLS가 `owner_id = auth.uid()` 기준이라 로그인 붙기 전에는 시딩 불가
- [ ] `js/storage.js`를 Supabase 호출로 교체 (함수 시그니처 유지, 내부만 async/await + supabase-js 쿼리로 교체)
- [ ] `symptoms.js`/`visits.js`의 `Storage.xxx()` 호출부에 `await` 추가, 저장 중 로딩 상태 표시
- [ ] 사진 업로드는 Supabase Storage 버킷 연동 (그 다음 단계, `photos` 테이블과 함께)

DB 비밀번호는 어디에도 커밋하지 않았음 — 필요할 때마다 팀장님께 다시 확인.
