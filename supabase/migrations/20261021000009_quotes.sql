-- =============================================================
-- 舞研アプリ：きょうのひとこと
-- アプリを開くたびに、ホームにランダムで1つ表示する。幹部がアプリから追加・編集できる
-- =============================================================
create table public.quotes (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (char_length(body) between 1 and 200),
  signature  text,                -- 「〜より」の部分（任意）
  active     boolean not null default true,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.quotes enable row level security;
revoke all on public.quotes from anon;
create policy quotes_select on public.quotes for select to authenticated
  using (public.is_active_member());
create policy quotes_write on public.quotes for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- 最初のひとこと（オリジナル）
insert into public.quotes (body, signature) values
  ('ステップを間違えたら、それはもう新しい振り付けなんだよ。', 'フロアの片すみより'),
  ('ルンバの1拍目は、ちょっとだけ待ってみるくらいがちょうどいい。', null),
  ('いちばん大事な筋肉は、笑ったときに使うやつ。', null),
  ('鏡の中の自分に、今日もおつかれと言っておこう。', null),
  ('ホールドがきれいな日は、だいたい全部うまくいく。', null),
  ('音楽より先に走らない。でも置いていかれない。', 'ワルツの心得'),
  ('パートナーの足を踏んだ回数だけ、仲良くなれる。たぶん。', null),
  ('練習着が乾かない季節も、ちゃんと踊ってえらい。', null),
  ('背筋をのばすと、だいたいの悩みは小さく見える。', null),
  ('今日の「できない」は、来月の「できた」の下書き。', null),
  ('チャチャチャの「チャチャ」は、楽しいって意味だと思う。', null),
  ('つま先から、自信は立ち上がる。', null),
  ('ターンで目が回ったら、一回休んで水を飲もう。', 'フロアの片すみより'),
  ('いい姿勢は、タダで手に入るいちばんの衣装。', null),
  ('拍手は、もらうより先に送ると増える。', null),
  ('大会の朝は、いつもより一口多くごはんを食べよう。', null),
  ('リードもフォローも、相手を見ることから始まる。', null),
  ('部費の振込は、早いほどみんながうれしい。', '財務係のつぶやき'),
  ('借りた備品は、借りたときよりちょっときれいにして返そう。', '備品係のつぶやき'),
  ('今日も踊れたなら、それでもう十分いい日。', null);
