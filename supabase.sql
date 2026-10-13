-- Spusť v Supabase: SQL Editor -> New query -> Run

create table if not exists public.matches (
  id       text primary key,
  round    int  not null,
  idx      int  not null,
  a        jsonb,
  b        jsonb,
  winner   text,
  votes    jsonb not null default '{"mliko":null,"danca":null}',
  comments jsonb not null default '[]'
);

alter table public.matches enable row level security;
create policy "open access" on public.matches
  for all to anon using (true) with check (true);

-- atomické přidání komentáře (bez přepsání cizích komentářů)
create or replace function public.add_comment(p_id text, p_comment jsonb)
returns void language sql as $$
  update public.matches set comments = comments || jsonb_build_array(p_comment) where id = p_id;
$$;

-- realtime
alter publication supabase_realtime add table public.matches;
