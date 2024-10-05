/**
Limit  (cost=685.87..685.87 rows=1 width=48) (actual time=18.359..18.362 rows=1 loops=1)
  Buffers: shared hit=31287
  ->  Sort  (cost=685.87..686.06 rows=74 width=48) (actual time=18.353..18.355 rows=1 loops=1)
        Sort Key: m.sent_at DESC
        Sort Method: top-N heapsort  Memory: 17kB
        Buffers: shared hit=31287
        ->  Nested Loop  (cost=16.79..685.50 rows=74 width=48) (actual time=0.283..16.839 rows=10000 loops=1)
              Buffers: shared hit=31287
              ->  Nested Loop  (cost=16.49..659.86 rows=74 width=8) (actual time=0.276..4.764 rows=10000 loops=1)
                    Buffers: shared hit=1287
                    ->  Bitmap Heap Scan on chats c  (cost=8.33..12.35 rows=1 width=8) (actual time=0.037..0.038 rows=2 loops=1)
                          Recheck Cond: ((('3'::bigint = from_id) AND ('4'::bigint = to_id)) OR (('4'::bigint = from_id) AND ('3'::bigint = to_id)))
                          Heap Blocks: exact=1
                          Buffers: shared hit=3
                          ->  BitmapOr  (cost=8.33..8.33 rows=1 width=0) (actual time=0.021..0.022 rows=0 loops=1)
                                Buffers: shared hit=2
                                ->  Bitmap Index Scan on chats_from_id_to_id_key  (cost=0.00..4.16 rows=1 width=0) (actual time=0.017..0.017 rows=1 loops=1)
                                      Index Cond: ((from_id = '3'::bigint) AND (to_id = '4'::bigint))
                                      Buffers: shared hit=1
                                ->  Bitmap Index Scan on chats_from_id_to_id_key  (cost=0.00..4.16 rows=1 width=0) (actual time=0.001..0.001 rows=1 loops=1)
                                      Index Cond: ((from_id = '4'::bigint) AND (to_id = '3'::bigint))
                                      Buffers: shared hit=1
                    ->  Bitmap Heap Scan on chat_messages cm  (cost=8.17..642.51 rows=500 width=16) (actual time=0.195..1.665 rows=5000 loops=2)
                          Recheck Cond: (chat_id = c.id)
                          Heap Blocks: exact=1274
                          Buffers: shared hit=1284
                          ->  Bitmap Index Scan on chat_messages_chat_id_idx  (cost=0.00..8.04 rows=500 width=0) (actual time=0.138..0.138 rows=5000 loops=2)
                                Index Cond: (chat_id = c.id)
                                Buffers: shared hit=10
              ->  Index Scan using messages_pkey on messages m  (cost=0.29..0.35 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=10000)
                    Index Cond: (id = cm.message_id)
                    Buffers: shared hit=30000
Planning:
  Buffers: shared hit=157
Planning Time: 1.108 ms
Execution Time: 18.464 ms
 */

import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();

await pg.sql`do $$ begin

create table if not exists accounts (
    id bigint primary key generated always as identity,
    uuid text unique not null default gen_random_uuid()
);

create table if not exists chats (
    id bigint primary key generated always as identity,
    from_id bigint not null references accounts(id) on delete cascade on update cascade,
    to_id bigint not null references accounts(id) on delete cascade on update cascade,
    last_read_at timestamptz,
    unique(from_id, to_id)
);

create table if not exists messages (
    id bigint primary key generated always as identity,
    sent_at timestamptz not null default date_trunc('milliseconds', now()),
    content text not null
);

create table if not exists chat_messages (
    id bigint primary key generated always as identity,
    chat_id bigint not null references chats(id) on delete cascade on update cascade,
    message_id bigint not null references messages(id) on delete cascade on update cascade,
    unique(chat_id, message_id) 
);

create index on chats(from_id, to_id);
create index on chats(to_id, from_id);
create index on messages(sent_at DESC);
create index on chat_messages(chat_id);
create index on chat_messages(message_id);

-- Insert 10 accounts
INSERT INTO accounts (uuid)
SELECT gen_random_uuid()
FROM generate_series(1, 10);

-- Insert chats (20 total, each account chats with every other account once)
INSERT INTO chats (from_id, to_id)
SELECT a.id, (a.id % 10) + 1
FROM accounts a;

INSERT INTO chats (from_id, to_id)
SELECT (a.id % 10) + 1, a.id
FROM accounts a;

-- Insert 100,000 messages
INSERT INTO messages (content)
SELECT '' FROM generate_series(1, 100000);

-- Insert chat_messages
INSERT INTO chat_messages (chat_id, message_id)
SELECT c.id, m.id
FROM chats c, messages m
WHERE c.id = (m.id % 20) + 1;

end $$;`;

// await pg.sql`SET enable_nestloop = off;`;

const explain = await pg.sql<{
  "QUERY PLAN": string;
}>`explain (analyze, buffers)
select * from messages m
join chat_messages cm on cm.message_id = m.id
join chats c on c.id = cm.chat_id
where (${3}, ${4}) in (
    (c.from_id, c.to_id),
    (c.to_id, c.from_id)
)
order by m.sent_at desc
limit 1;`;

console.log(explain.rows.map((r) => r["QUERY PLAN"]).join("\n"));
