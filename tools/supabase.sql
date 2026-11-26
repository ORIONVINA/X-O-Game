-- XO Game → Supabase
-- Dán toàn bộ file này vào Supabase: SQL Editor → New query → Run. Chạy lại nhiều lần cũng không sao.
-- Game KHÔNG được đọc hay ghi thẳng vào bảng. Nó chỉ được gọi 2 hàm ở cuối file: ghi() và bang_vang_hom_nay().

create table if not exists public.khao_sat (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rid text unique,            -- mã của từng dòng, để gửi lại không bị trùng
  uid text, src text, team text, device text,
  age text, gender text, rate_x text, rate_o text
);
create table if not exists public.van_dau (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rid text unique,
  uid text, src text, team text, device text,
  mode text, arena text, size text, result text, winner text,
  moves int, seconds int, plays int, streak int
);
create table if not exists public.su_kien (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rid text unique,
  uid text, src text, team text, device text,
  event text, role text
);
-- Bảng vàng: mỗi ngày (giờ Việt Nam) một dòng, số trận thắng của mỗi phe
create table if not exists public.bang_vang (
  ngay date primary key,
  x int not null default 0,
  o int not null default 0
);
create index if not exists van_dau_created_at on public.van_dau (created_at);
create index if not exists khao_sat_created_at on public.khao_sat (created_at);

-- Khóa các bảng: người ngoài không đọc, không sửa, không xóa được
alter table public.khao_sat  enable row level security;
alter table public.van_dau   enable row level security;
alter table public.su_kien   enable row level security;
alter table public.bang_vang enable row level security;

-- Chuyển chữ thành số an toàn (rỗng hoặc sai thì để trống)
create or replace function public.so_(t text) returns int language sql immutable as $$
  select case when t ~ '^[0-9]{1,7}$' then t::int else null end
$$;

-- Game gọi hàm này để gửi một loạt sự kiện. Trả về 'ok' khi đã lưu xong.
create or replace function public.ghi(rows jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; n int; ax int := 0; ao int := 0;
  d date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then return 'bad'; end if;
  for r in select value from jsonb_array_elements(rows) limit 200 loop
    if r->>'event' = 'khao_sat' then
      insert into khao_sat (rid, uid, src, team, device, age, gender, rate_x, rate_o)
      values (left(r->>'rid',60), left(r->>'uid',40), left(r->>'src',100), left(r->>'team',2), left(r->>'device',20),
              left(r->>'age',10), left(r->>'gender',10), left(r->>'rateX',12), left(r->>'rateO',12))
      on conflict (rid) do nothing;
    elsif r->>'event' = 'van_dau' then
      insert into van_dau (rid, uid, src, team, device, mode, arena, size, result, winner, moves, seconds, plays, streak)
      values (left(r->>'rid',60), left(r->>'uid',40), left(r->>'src',100), left(r->>'team',2), left(r->>'device',20),
              left(r->>'mode',20), left(r->>'arena',20), left(r->>'size',20), left(r->>'result',10), left(r->>'winner',2),
              so_(r->>'moves'), so_(r->>'seconds'), so_(r->>'plays'), so_(r->>'streak'))
      on conflict (rid) do nothing;
      get diagnostics n = row_count;                       -- chỉ cộng bảng vàng khi dòng thật sự mới
      if n > 0 and r->>'result' = 'win' then
        if r->>'team' = 'X' then ax := ax + 1; elsif r->>'team' = 'O' then ao := ao + 1; end if;
      end if;
    else
      insert into su_kien (rid, uid, src, team, device, event, role)
      values (left(r->>'rid',60), left(r->>'uid',40), left(r->>'src',100), left(r->>'team',2), left(r->>'device',20),
              left(r->>'event',30), left(r->>'role',30))
      on conflict (rid) do nothing;
    end if;
  end loop;
  if ax + ao > 0 then
    insert into bang_vang (ngay, x, o) values (d, ax, ao)
    on conflict (ngay) do update set x = bang_vang.x + excluded.x, o = bang_vang.o + excluded.o;
  end if;
  return 'ok';
end $$;

-- Game gọi hàm này để lấy số trận thắng hôm nay của hai phe: {"X": 12, "O": 9}
create or replace function public.bang_vang_hom_nay() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('X', coalesce(max(x), 0), 'O', coalesce(max(o), 0))
  from bang_vang where ngay = (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

revoke all on function public.ghi(jsonb) from public;
revoke all on function public.bang_vang_hom_nay() from public;
grant execute on function public.ghi(jsonb) to anon, authenticated;
grant execute on function public.bang_vang_hom_nay() to anon, authenticated;
