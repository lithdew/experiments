import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();

await pg.sql`create table if not exists accounts (
    id bigint primary key generated always as identity,
    uuid text unique not null default gen_random_uuid()
);`;

await pg.sql`create table if not exists roles (
    id bigint primary key generated always as identity,
    parent_id bigint references roles(id) on delete cascade on update cascade,
    uuid text unique not null default gen_random_uuid(),
    name text not null
);`;

await pg.sql`create table if not exists account_roles (
    account_id bigint not null references accounts(id) on delete cascade on update cascade,
    role_id bigint not null references roles(id) on delete cascade on update cascade,
    primary key (account_id, role_id)
);`;

await pg.sql`create table if not exists permissions (
    id bigint primary key generated always as identity,
    uuid text unique not null default gen_random_uuid(),
    collection text not null,
    action text not null check (action in ('create', 'read', 'update', 'delete'))
);`;

await pg.sql`create table if not exists role_permissions (
    role_id bigint not null references roles(id) on delete cascade on update cascade,
    permission_id bigint not null references permissions(id) on delete cascade on update cascade,
    primary key (role_id, permission_id)
);`;

await pg.sql`create table if not exists roles_closure (
    ancestor_id bigint references roles(id) on delete cascade on update cascade,
    descendant_id bigint references roles(id) on delete cascade on update cascade,
    primary key (ancestor_id, descendant_id)
);`;

const createRole = async (input: { parentId?: string; name: string }) =>
  pg.sql<{ uuid: string }>`with role as (
    insert into roles (parent_id, name) values (
        (select p.id from roles p where p.uuid = ${input.parentId ?? null}),
        ${input.name}
    )
    returning *
)
insert into roles_closure (ancestor_id, descendant_id)
select role.id as ancestor_id, role.id as descendant_id from role
union all
select p.ancestor_id, c.descendant_id from role,
(select * from roles_closure union all select role.id as ancestor_id, role.id as descendant_id from role) p,
(select * from roles_closure union all select role.id as ancestor_id, role.id as descendant_id from role) c
where p.descendant_id = role.parent_id and c.ancestor_id = role.id
returning (select role.uuid from role);`.then((o) => o.rows.at(0)?.uuid);

const deleteRole = async (input: {
  roleId: string;
}) => pg.sql`with deleted_role as (
    delete from roles where roles.uuid = ${input.roleId} returning *
)
delete from roles_closure o
using deleted_role
where exists(
    select * from roles_closure p, roles_closure c
    where p.ancestor_id = o.ancestor_id and c.descendant_id = o.descendant_id
    and p.descendant_id = deleted_role.parent_id and c.ancestor_id = deleted_role.id
);`;

const createPermission = (input: {
  collection: string;
  action: "create" | "read" | "update" | "delete";
}) =>
  pg.sql`insert into permissions (collection, action) values (${input.collection}, ${input.action});`;

const assignRoleToAccount = (input: {
  accountId: string;
  roleId: string;
}) => pg.sql`insert into account_roles (account_id, role_id) values (
    (select id from accounts where uuid = ${input.accountId}),
    (select id from roles where uuid = ${input.roleId})
) on conflict (account_id, role_id) do nothing;`;

const assignPermissionToRole = (input: {
  roleId: string;
  permissionId: string;
}) => pg.sql`insert into role_permissions (role_id, permission_id) values (
    (select id from roles where uuid = ${input.roleId}),
    (select id from permissions where uuid = ${input.permissionId})
) on conflict (role_id, permission_id) do nothing;`;

const anon = await createRole({ name: "anon" });
const user = await createRole({ parentId: anon, name: "user" });
const mod = await createRole({ parentId: user, name: "mod" });
const admin = await createRole({ parentId: mod, name: "admin" });

await deleteRole({ roleId: admin! });
await deleteRole({ roleId: mod! });
await deleteRole({ roleId: user! });
await deleteRole({ roleId: anon! });

console.dir(await pg.sql`select * from roles_closure`.then((o) => o.rows), {
  depth: Infinity,
});

