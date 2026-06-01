-- Camada de segurança por dispositivo + PIN mestre.
-- O PIN nunca deve ser salvo em texto puro. As RPCs abaixo usam pgcrypto/crypt
-- com bcrypt (gen_salt('bf', 12)); o app nao compara nem usa valor_hash diretamente.

create extension if not exists pgcrypto;

create table if not exists public.dispositivos_autorizados (
    id uuid primary key default gen_random_uuid(),
    usuario_id text null,
    nome_usuario text null,
    device_id text not null unique,
    nome_dispositivo text,
    ativo boolean not null default true,
    bloqueado_em timestamptz null,
    ultimo_acesso timestamptz null,
    criado_em timestamptz not null default now()
);

create index if not exists idx_dispositivos_autorizados_device_id
    on public.dispositivos_autorizados (device_id);

create index if not exists idx_dispositivos_autorizados_ativo
    on public.dispositivos_autorizados (ativo);

create table if not exists public.logs_seguranca (
    id uuid primary key default gen_random_uuid(),
    acao text not null,
    usuario_responsavel text,
    device_id_afetado text,
    detalhes text,
    criado_em timestamptz not null default now()
);

create index if not exists idx_logs_seguranca_criado_em
    on public.logs_seguranca (criado_em desc);

create table if not exists public.configuracoes_seguranca (
    id uuid primary key default gen_random_uuid(),
    chave text not null unique,
    valor_hash text null,
    algoritmo text not null default 'bcrypt',
    atualizado_por text,
    atualizado_em timestamptz not null default now(),
    criado_em timestamptz not null default now()
);

alter table public.configuracoes_seguranca
    add column if not exists algoritmo text not null default 'bcrypt',
    add column if not exists atualizado_por text,
    add column if not exists atualizado_em timestamptz not null default now(),
    add column if not exists criado_em timestamptz not null default now();

alter table public.configuracoes_seguranca
    alter column valor_hash drop not null;

insert into public.configuracoes_seguranca (chave, valor_hash, algoritmo, atualizado_por)
values ('pin_mestre', null, 'bcrypt', 'migration')
on conflict (chave) do update
set
    algoritmo = 'bcrypt',
    -- Se havia valor temporario/legado, invalida para obrigar criacao de novo hash seguro via RPC.
    valor_hash = case
        when public.configuracoes_seguranca.valor_hash like '$2%' then public.configuracoes_seguranca.valor_hash
        else null
    end,
    atualizado_em = now(),
    atualizado_por = 'migration';

create or replace function public.pin_mestre_configurado()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.configuracoes_seguranca
        where chave = 'pin_mestre'
          and algoritmo = 'bcrypt'
          and valor_hash like '$2%'
    );
$$;

create or replace function public.validar_pin_mestre(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_hash text;
begin
    if p_pin is null or length(trim(p_pin)) < 4 then
        return false;
    end if;

    select valor_hash
      into v_hash
      from public.configuracoes_seguranca
     where chave = 'pin_mestre'
       and algoritmo = 'bcrypt'
     limit 1;

    if v_hash is null or v_hash not like '$2%' then
        return false;
    end if;

    return v_hash = crypt(trim(p_pin), v_hash);
end;
$$;

create or replace function public.set_pin_mestre(p_pin text, p_usuario text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_pin is null or length(trim(p_pin)) < 4 then
        raise exception 'PIN deve ter pelo menos 4 dígitos.';
    end if;

    insert into public.configuracoes_seguranca (chave, valor_hash, algoritmo, atualizado_por, atualizado_em)
    values ('pin_mestre', crypt(trim(p_pin), gen_salt('bf', 12)), 'bcrypt', coalesce(p_usuario, 'Sistema'), now())
    on conflict (chave) do update
    set valor_hash = excluded.valor_hash,
        algoritmo = 'bcrypt',
        atualizado_por = excluded.atualizado_por,
        atualizado_em = now();

    return true;
end;
$$;

grant execute on function public.pin_mestre_configurado() to anon, authenticated;
grant execute on function public.validar_pin_mestre(text) to anon, authenticated;
grant execute on function public.set_pin_mestre(text, text) to anon, authenticated;

alter table public.dispositivos_autorizados enable row level security;
alter table public.logs_seguranca enable row level security;
alter table public.configuracoes_seguranca enable row level security;

-- O app atual usa anon key e nao possui auth real; estas policies mantem compatibilidade.
-- Quando houver login real, substituir por policies baseadas em auth.uid() ou RPC/Edge Function.
drop policy if exists "app_dispositivos_select" on public.dispositivos_autorizados;
create policy "app_dispositivos_select"
on public.dispositivos_autorizados for select
to anon, authenticated
using (true);

drop policy if exists "app_dispositivos_insert" on public.dispositivos_autorizados;
create policy "app_dispositivos_insert"
on public.dispositivos_autorizados for insert
to anon, authenticated
with check (true);

drop policy if exists "app_dispositivos_update" on public.dispositivos_autorizados;
create policy "app_dispositivos_update"
on public.dispositivos_autorizados for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "app_logs_insert" on public.logs_seguranca;
create policy "app_logs_insert"
on public.logs_seguranca for insert
to anon, authenticated
with check (true);

drop policy if exists "app_configuracoes_seguranca_select" on public.configuracoes_seguranca;
drop policy if exists "app_configuracoes_seguranca_insert" on public.configuracoes_seguranca;
drop policy if exists "app_configuracoes_seguranca_update" on public.configuracoes_seguranca;
-- Sem policies diretas em configuracoes_seguranca: o acesso ocorre somente pelas RPCs
-- pin_mestre_configurado, validar_pin_mestre e set_pin_mestre.
