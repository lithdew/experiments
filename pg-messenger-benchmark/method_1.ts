/**
Limit  (cost=1490.18..1490.18 rows=1 width=80) (actual time=20.000..20.007 rows=1 loops=1)
  Buffers: shared hit=1409
  ->  Sort  (cost=1490.18..1490.19 rows=5 width=80) (actual time=19.991..19.995 rows=1 loops=1)
        Sort Key: m.sent_at DESC
        Sort Method: top-N heapsort  Memory: 17kB
        Buffers: shared hit=1409
        ->  Hash Join  (cost=807.95..1490.16 rows=5 width=80) (actual time=9.134..17.853 rows=10000 loops=1)
              Hash Cond: (r.message_id = m.id)
              Join Filter: ((('3'::bigint = m.from_id) AND ('4'::bigint = r.to_id)) OR (('3'::bigint = r.to_id) AND ('4'::bigint = m.from_id)))
              Buffers: shared hit=1409
              ->  Bitmap Heap Scan on message_recipients r  (cost=16.58..696.17 rows=998 width=24) (actual time=0.678..4.463 rows=20000 loops=1)
                    Recheck Cond: (('4'::bigint = to_id) OR ('3'::bigint = to_id))
                    Heap Blocks: exact=637
                    Buffers: shared hit=655
                    ->  BitmapOr  (cost=16.58..16.58 rows=1000 width=0) (actual time=0.604..0.606 rows=0 loops=1)
                          Buffers: shared hit=18
                          ->  Bitmap Index Scan on message_recipients_to_id_idx  (cost=0.00..8.04 rows=500 width=0) (actual time=0.377..0.378 rows=10000 loops=1)
                                Index Cond: (to_id = '4'::bigint)
                                Buffers: shared hit=9
                          ->  Bitmap Index Scan on message_recipients_to_id_idx  (cost=0.00..8.04 rows=500 width=0) (actual time=0.224..0.224 rows=10000 loops=1)
                                Index Cond: (to_id = '3'::bigint)
                                Buffers: shared hit=9
              ->  Hash  (cost=782.47..782.47 rows=712 width=56) (actual time=8.426..8.428 rows=20000 loops=1)
                    Buckets: 32768 (originally 1024)  Batches: 1 (originally 1)  Memory Usage: 1086kB
                    Buffers: shared hit=754
                    ->  Bitmap Heap Scan on messages m  (cost=14.30..782.47 rows=712 width=56) (actual time=0.755..5.212 rows=20000 loops=1)
                          Recheck Cond: (('3'::bigint = from_id) OR ('4'::bigint = from_id))
                          Heap Blocks: exact=736
                          Buffers: shared hit=754
                          ->  BitmapOr  (cost=14.30..14.30 rows=714 width=0) (actual time=0.668..0.668 rows=0 loops=1)
                                Buffers: shared hit=18
                                ->  Bitmap Index Scan on messages_from_id_idx  (cost=0.00..6.97 rows=357 width=0) (actual time=0.384..0.384 rows=10000 loops=1)
                                      Index Cond: (from_id = '3'::bigint)
                                      Buffers: shared hit=9
                                ->  Bitmap Index Scan on messages_from_id_idx  (cost=0.00..6.97 rows=357 width=0) (actual time=0.274..0.274 rows=10000 loops=1)
                                      Index Cond: (from_id = '4'::bigint)
                                      Buffers: shared hit=9
Planning:
  Buffers: shared hit=150
Planning Time: 1.326 ms
Execution Time: 20.132 ms
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
    from_id bigint not null references accounts(id) on delete cascade on update cascade,
    content text not null
);

create table if not exists message_recipients (
    id bigint primary key generated always as identity,
    message_id bigint not null references messages(id) on delete cascade on update cascade,
    to_id bigint not null references accounts(id) on delete cascade on update cascade,
    unique(message_id, to_id) 
);


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

-- Insert 100,000 messages using round-robin distributions
INSERT INTO messages (from_id, content)
SELECT ((seq % 10) + 1)::bigint, ''
FROM generate_series(1, 100000) AS seq;

-- Insert message recipients for each message using round-robin distribution
INSERT INTO message_recipients (message_id, to_id)
SELECT m.id, (m.from_id % 10) + 1
FROM messages m;

create index on chats(from_id);
create index on chats(to_id);
create index on messages(from_id);
create index on messages(sent_at);
create index on message_recipients(message_id);
create index on message_recipients(to_id);

end $$;`;

console.time("query");
const explain = await pg.sql<{
  "QUERY PLAN": string;
}>`explain (analyze, buffers, verbose, settings)
select m.* from messages m join message_recipients r on r.message_id = m.id
where (${3}, ${4}) in (
    (m.from_id, r.to_id),
    (r.to_id, m.from_id)
)
order by m.sent_at desc
limit 1;`;
console.timeEnd("query");

console.log(explain.rows.map((r) => r["QUERY PLAN"]).join("\n"));
