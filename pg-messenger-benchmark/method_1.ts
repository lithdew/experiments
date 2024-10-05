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

create index on chats(from_id);
create index on chats(to_id);
create index on messages(from_id);
create index on messages(sent_at);
create index on message_recipients(message_id);
create index on message_recipients(to_id);

-- Insert 10 accounts
INSERT INTO accounts (uuid)
SELECT gen_random_uuid()
FROM generate_series(1, 10);

-- Insert chats (20 total, each account chats with every other account once)
INSERT INTO chats (from_id, to_id)
SELECT a1.id, a2.id
FROM accounts a1, accounts a2
WHERE a1.id < a2.id;

INSERT INTO chats (from_id, to_id)
SELECT a2.id, a1.id
FROM accounts a1, accounts a2
WHERE a1.id < a2.id;

-- Insert 100,000 messages using round-robin distributions
INSERT INTO messages (from_id, content)
SELECT ((seq % 10) + 1)::bigint, ''
FROM generate_series(1, 100000) AS seq;

-- Insert message recipients for each message using round-robin distribution
INSERT INTO message_recipients (message_id, to_id)
SELECT m.id, (((m.id + 5) % 10) + 1)::bigint
FROM messages m;

end $$;`;

const explain = await pg.sql<{
  "QUERY PLAN": string;
}>`explain (analyze, buffers)
select * from messages m join message_recipients r on r.message_id = m.id
where (${3}, ${4}) in (
    (m.from_id, r.to_id),
    (r.to_id, m.from_id)
)
order by m.sent_at desc
limit 1;`;

console.log(explain.rows.map((r) => r["QUERY PLAN"]).join("\n"));
