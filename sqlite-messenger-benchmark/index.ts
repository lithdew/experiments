import { createClient } from "@libsql/client";

const db = createClient({
  url: ":memory:",
});

await db.execute(`pragma synchronous = wal;`);

await db.execute(`create table if not exists accounts (
    id integer primary key
);`);

await db.execute(`create table if not exists chats (
    id integer primary key,
    from_id integer not null references accounts(id) on delete cascade on update cascade,
    to_id integer not null references accounts(id) on delete cascade on update cascade,
    last_read_at integer,
    unique(from_id, to_id)
);`);

await db.execute(`create table if not exists messages (
    id integer primary key,
    sent_at integer not null default (unixepoch()),
    from_id integer not null references accounts(id) on delete cascade on update cascade,
    content text not null
);`);

await db.execute(`create table if not exists message_recipients (
    id integer primary key,
    message_id integer not null references messages(id) on delete cascade on update cascade,
    to_id integer not null references accounts(id) on delete cascade on update cascade,
    unique(message_id, to_id) 
);`);

for (let i = 1; i <= 10; i++) {
  await db.execute({
    sql: `INSERT INTO accounts(id) VALUES ($1);`,
    args: [i],
  });
}

await db.execute(
  `INSERT INTO chats (from_id, to_id) SELECT a.id, (a.id % 10) + 1 FROM accounts a`
);
await db.execute(
  `INSERT INTO chats (from_id, to_id) SELECT (a.id % 10) + 1, a.id FROM accounts a`
);

for (let i = 1; i <= 100_000; i++) {
  await db.execute({
    sql: `INSERT INTO messages (from_id, content) VALUES ($1, $1);`,
    args: [(i % 10) + 1],
  });
}

await db.execute(
  `INSERT INTO message_recipients (message_id, to_id) SELECT m.id, (m.from_id % 10) + 1 FROM messages m;`
);

await db.execute(`create index chats_by_from_id on chats (from_id);`);
await db.execute(`create index chats_by_to_id on chats (to_id);`);
await db.execute(`create index messages_by_from_id on messages (from_id);`);
await db.execute(`create index messages_by_sent_at on messages (sent_at);`);
await db.execute(
  `create index message_recipients_by_message_id on message_recipients (message_id);`
);
await db.execute(
  `create index message_recipients_by_to_id on message_recipients (to_id);`
);

console.time("query");
const explain = await db.execute({
  sql: `select m.* from messages m
where exists (
    select * from message_recipients r
    where r.message_id = m.id and ($1, $2) in (
        (m.from_id, r.to_id),
        (r.to_id, m.from_id)
    )
)
order by m.sent_at desc
limit 1;`,
  args: [3, 4],
});
console.timeEnd("query");

console.log(explain.toJSON());
