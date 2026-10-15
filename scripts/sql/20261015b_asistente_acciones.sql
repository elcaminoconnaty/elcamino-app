-- Acciones del asistente (2026-10-15). Copia de referencia; aplicada con apply_migration.
-- El asistente PROPONE (fila en 'propuesta' con la lista exacta que vería la persona) y nada se
-- ejecuta hasta que la misma persona toca Confirmar en la plataforma. Ver lib/asistente/acciones.ts.
create table if not exists public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations (id) on delete cascade,
  message_id uuid references public.assistant_messages (id) on delete set null,
  user_id uuid not null default auth.uid() references public.profiles (id),
  kind text not null,
  params jsonb not null,
  preview jsonb not null,
  status text not null default 'propuesta' check (status in ('propuesta', 'ejecutando', 'ejecutada', 'fallida', 'cancelada')),
  result jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
comment on table public.assistant_actions is
  'Lo que el asistente PROPONE hacer (p. ej. enviar contratos). Nada se ejecuta hasta que la misma persona toca Confirmar en la plataforma.';
create index if not exists assistant_actions_conv_idx on public.assistant_actions (conversation_id, created_at);

alter table public.assistant_actions enable row level security;
drop policy if exists assistant_actions_select on public.assistant_actions;
create policy assistant_actions_select on public.assistant_actions for select to authenticated
  using (public.is_team_member());
drop policy if exists assistant_actions_insert on public.assistant_actions;
create policy assistant_actions_insert on public.assistant_actions for insert to authenticated
  with check (public.is_team_member() and user_id = (select auth.uid()));
drop policy if exists assistant_actions_update on public.assistant_actions;
create policy assistant_actions_update on public.assistant_actions for update to authenticated
  using (public.is_team_member() and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.assistant_actions from anon;
revoke delete, truncate on public.assistant_actions from authenticated;

drop trigger if exists zz_audit on public.assistant_actions;
create trigger zz_audit after insert or update or delete on public.assistant_actions
  for each row execute function public.audit_row_change();
