import {
  Kysely,
  PostgresAdapter,
  DummyDriver,
  PostgresIntrospector,
  PostgresQueryCompiler,
  expressionBuilder,
  ExpressionWrapper,
  type OperationNode,
} from "kysely";

const db = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const exampleClause = expressionBuilder<any, any>().exists(
  db
    .selectFrom("accounts")
    .selectAll()
    .where("accounts.banned", "=", false)
    .where("accounts.id", "in", [123, 456])
);

const exampleClauseNode = exampleClause.toOperationNode();

const serializedExampleClauseNode = JSON.stringify(exampleClauseNode);

const deserializedExampleClauseNode = JSON.parse(
  serializedExampleClauseNode
) as OperationNode;

console.log("Example serialized WHERE clause:");
console.log(serializedExampleClauseNode);
console.log();

const exampleCompiledQuery = db
  .selectFrom("accounts")
  .where(
    new ExpressionWrapper<any, any, boolean>(deserializedExampleClauseNode)
  )
  .compile();

console.log("Example query with WHERE clause:");
console.log({
  sql: exampleCompiledQuery.sql,
  parameters: exampleCompiledQuery.parameters,
});
