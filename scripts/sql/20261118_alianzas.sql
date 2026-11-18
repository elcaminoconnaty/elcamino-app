-- Caminos en alianza (2026-11-18). Primer caso: Camino Francés Septiembre 2027 con Power the Muv.
--
-- Reparto acordado con Nico: ECN cobra primero un % de agenciamiento sobre el costo del camino y
-- lo que queda de utilidad se reparte entre ECN y el aliado (70/30 en el caso de Power the Muv).
-- Cada inscripción guarda de parte de quién llegó el peregrino.

alter table public.departures
  add column if not exists alliance_partner text,
  add column if not exists alliance_agency_fee_pct numeric(5,2) not null default 0,
  add column if not exists alliance_partner_share_pct numeric(5,2) not null default 0;

comment on column public.departures.alliance_partner is 'Nombre del aliado si el camino es en alianza (null = camino propio de ECN).';
comment on column public.departures.alliance_agency_fee_pct is '% de agenciamiento que ECN cobra sobre el costo del camino antes de repartir la utilidad.';
comment on column public.departures.alliance_partner_share_pct is '% de la utilidad (después del agenciamiento) que le toca al aliado. El resto es de ECN.';

alter table public.registrations
  add column if not exists referred_by text;

alter table public.registrations
  drop constraint if exists registrations_referred_by_check;
alter table public.registrations
  add constraint registrations_referred_by_check check (referred_by is null or referred_by in ('ecn', 'aliado'));

comment on column public.registrations.referred_by is 'De parte de quién llegó el peregrino en un camino en alianza: ecn | aliado (null = sin definir).';

update public.departures
   set alliance_partner = 'Power the Muv',
       alliance_agency_fee_pct = 15,
       alliance_partner_share_pct = 30
 where id = '0b675201-9dec-4a87-b0ed-211496352500';
