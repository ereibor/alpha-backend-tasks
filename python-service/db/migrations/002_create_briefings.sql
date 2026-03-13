create table if not exists briefings (
    id              serial primary key,
    company_name    varchar(200)    not null,
    ticker          varchar(20)     not null,
    sector          varchar(200),
    analyst_name    varchar(160),
    summary         text            not null,
    recommendation  text            not null,
    is_generated    boolean         not null default false,
    generated_html  text,
    created_at      timestamptz     not null default now(),
    updated_at      timestamptz     not null default now()
);

create index if not exists idx_briefings_ticker on briefings (ticker);

create table if not exists briefing_key_points (
    id            serial primary key,
    briefing_id   integer  not null references briefings(id) on delete cascade,
    text          text     not null,
    display_order integer  not null default 0
);

create index if not exists idx_briefing_key_points_briefing_id on briefing_key_points (briefing_id);

create table if not exists briefing_risks (
    id            serial primary key,
    briefing_id   integer  not null references briefings(id) on delete cascade,
    text          text     not null,
    display_order integer  not null default 0
);

create index if not exists idx_briefing_risks_briefing_id on briefing_risks (briefing_id);

create table if not exists briefing_metrics (
    id            serial primary key,
    briefing_id   integer      not null references briefings(id) on delete cascade,
    name          varchar(120) not null,
    value         varchar(120) not null,
    display_order integer      not null default 0,
    constraint uq_briefing_metric_name_per_briefing unique (briefing_id, name)
);

create index if not exists idx_briefing_metrics_briefing_id on briefing_metrics (briefing_id);