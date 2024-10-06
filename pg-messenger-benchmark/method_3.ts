// Have a 'chats' table.
// All participants of a chat have their ID stored in 'chat_participants'.
// There is a link from 'chats' to 'messages' called 'chat_messages'.
// 'chat_messages' holds when a message is sent at, alongside who sent the message.

/**
Limit  (cost=0.86..5.92 rows=1 width=48) (actual time=0.077..0.085 rows=1 loops=1)
  Output: m.id, m.content, cm.sent_at
  Buffers: shared hit=8 read=3
  ->  Nested Loop  (cost=0.86..40487.86 rows=8000 width=48) (actual time=0.064..0.070 rows=1 loops=1)
        Output: m.id, m.content, cm.sent_at
        Inner Unique: true
        Buffers: shared hit=8 read=3
        ->  Nested Loop Semi Join  (cost=0.57..37766.42 rows=8000 width=16) (actual time=0.054..0.060 rows=1 loops=1)
              Output: cm.sent_at, cm.message_id
              Buffers: shared hit=5 read=3
              ->  Index Scan using chat_messages_sent_at_id_idx on public.chat_messages cm  (cost=0.42..6388.42 rows=100000 width=24) (actual time=0.015..0.016 rows=2 loops=1)
                    Output: cm.id, cm.chat_id, cm.message_id, cm.from_id, cm.sent_at
                    Buffers: shared hit=1 read=3
              ->  Index Only Scan using chat_participants_chat_id_participant_id_key on public.chat_participants cp  (cost=0.15..0.31 rows=1 width=8) (actual time=0.016..0.016 rows=0 loops=2)
                    Output: cp.chat_id, cp.participant_id
                    Index Cond: (cp.chat_id = cm.chat_id)
                    Filter: (cp.participant_id = ANY ('{3,4}'::bigint[]))
                    Rows Removed by Filter: 2
                    Heap Fetches: 4
                    Buffers: shared hit=4
        ->  Index Scan using messages_pkey on public.messages m  (cost=0.29..0.34 rows=1 width=40) (actual time=0.007..0.007 rows=1 loops=1)
              Output: m.id, m.content
              Index Cond: (m.id = cm.message_id)
              Buffers: shared hit=3
Settings: search_path = 'public', enable_seqscan = 'off'
Planning:
  Buffers: shared hit=155 read=1
Planning Time: 1.196 ms
Execution Time: 0.146 ms
 */

import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();

await pg.sql`do $$
declare
      chat_id bigint;
      from_id bigint;
      to_id bigint;
      message_id bigint;
      seq int;
begin

create table if not exists accounts (
    id bigint primary key generated always as identity,
    uuid text unique not null default gen_random_uuid()
);

create table if not exists chats (
    id bigint primary key generated always as identity
);

create table chat_participants (
    id bigint primary key generated always as identity,
    chat_id bigint references chats(id) on delete cascade on update cascade,
    participant_id bigint references accounts(id) on delete cascade on update cascade,
    unique(chat_id, participant_id)
);

create table if not exists messages (
    id bigint primary key generated always as identity,
    content text not null
);
    
create table if not exists chat_messages (
      id bigint primary key generated always as identity,
      chat_id bigint not null references chats(id) on delete cascade on update cascade,
      message_id bigint not null references messages(id) on delete cascade on update cascade,
      from_id bigint not null references accounts(id) on delete cascade on update cascade,
      sent_at timestamptz not null default date_trunc('milliseconds', now()),
      unique(chat_id, message_id)
);


-- Insert 10 accounts
INSERT INTO accounts (uuid)
SELECT gen_random_uuid()
FROM generate_series(1, 10);

-- Insert chats (20 total, each account chats with every other account once)
-- Insert chat participants for each chat
FOR from_id IN 1..10 LOOP
      to_id := (from_id % 10) + 1;
      INSERT INTO chats DEFAULT VALUES RETURNING id INTO chat_id;
      INSERT INTO chat_participants (chat_id, participant_id) VALUES (chat_id, from_id);
      INSERT INTO chat_participants (chat_id, participant_id) VALUES (chat_id, to_id);
END LOOP;

-- Insert 100,000 messages using round-robin distributions
FOR seq IN 1..100000 LOOP
      from_id := ((seq - 1) % 10) + 1;
      chat_id := ((seq - 1) % 10) + 1;
      
      INSERT INTO messages (content) VALUES ('')
      RETURNING id INTO message_id;

      INSERT INTO chat_messages (chat_id, from_id, message_id) VALUES (chat_id, from_id, message_id);
END LOOP;

create index on chat_messages(sent_at DESC, id);

end $$;`;

// await pg.sql`SET enable_nestloop = off;`;

const explain = await pg.sql<{
  "QUERY PLAN": string;
}>`explain (analyze, buffers, verbose, settings)
select m.* from chat_messages cm
join messages m on m.id = cm.message_id
where exists (
    select * from chat_participants cp
    where cp.chat_id = cm.chat_id
    and cp.participant_id in (${3}, ${4})
)
order by cm.sent_at desc
limit 1;`;

console.log(explain.rows.map((r) => r["QUERY PLAN"]).join("\n"));
