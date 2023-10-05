import { Express, Request } from "express";
import { buildResolvers } from "./resolvers";
import { buildProps } from "./buildProps";

const fetch = require("node-fetch");
const gql = require("graphql-tag");
const ApolloClient = require("apollo-client").ApolloClient;
const createHttpLink = require("apollo-link-http").createHttpLink;
const setContext = require("apollo-link-context").setContext;
const InMemoryCache = require("apollo-cache-inmemory").InMemoryCache;

const path = require("path");
const { Neo4jGraphQL } = require("@neo4j/graphql");
const { ApolloServer } = require("apollo-server-express");
const { toGraphQLTypeDefs } = require("@neo4j/introspector");
const neo4j = require("neo4j-driver");

const http = require("http");
const bodyParser = require("body-parser");
const express = require("express");
const {
  ApolloServerPluginDrainHttpServer,
  ApolloServerPluginLandingPageLocalDefault,
} = require("apollo-server-core");
const { OGM } = require("@neo4j/graphql-ogm");

const props = buildProps();

const driver = neo4j.driver(
  props.neo4j_graphql_uri,
  neo4j.auth.basic(props.neo4j_username, props.neo4j_password)
);

const sessionFactory = () =>
  driver.session({ defaultAccessMode: neo4j.session.WRITE });

// OracleDB connection requires `node-oracledb` on Thick mode & the Oracle Instant Client, which is unavailable for M1 Macs
let oracledb: any = null;
const os = require("os");
if (os.arch() !== "arm64") {
  oracledb = require("oracledb");
  oracledb.initOracleClient();
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
}

async function main() {
  const app: Express = express();
  app.use(express.static(path.resolve(__dirname, "../build")));
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(express.json({ limit: "50mb" })); // increase to support bulk searching

  if (os.arch() !== "arm64" && oracledb !== null) {
    app.get("/crosswalk", async (req, res) => {
      const connection = await oracledb.getConnection({
        user: props.oracle_user,
        password: props.oracle_password,
        connectString: props.oracle_connect_string,
      });

      const result = await connection.execute(
        "SELECT CMO_ID, DMP_ID, PT_MRN FROM CRDB_CMO_LOJ_DMP_MAP WHERE '9LHE08' IN (DMP_ID, PT_MRN, CMO_ID)"
      );

      res.send(result.rows);
      await connection.close();
      return;
    });
  }

  // for health check
  app.get("/", (req, res) => {
    res.sendStatus(200);
  });

  const httpLink = createHttpLink({
    uri: "http://localhost:4001/graphql",
    fetch: fetch,
  });

  const client = new ApolloClient({
    link: httpLink,
    cache: new InMemoryCache(),
  });

  const httpServer = http.createServer(app);
  const typeDefs = await toGraphQLTypeDefs(sessionFactory, false);
  const ogm = new OGM({ typeDefs, driver });
  const neoSchema = new Neo4jGraphQL({
    typeDefs,
    driver,
    config: {
      skipValidateTypeDefs: true,
    },
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      ApolloServerPluginLandingPageLocalDefault({ embed: true }),
    ],
    resolvers: buildResolvers(ogm, client),
  });

  Promise.all([neoSchema.getSchema(), ogm.init()]).then(async ([schema]) => {
    const server = new ApolloServer({
      schema,
      // context: ({ req }: { req: Request }) => {
      //   const token = req.headers.authorization || "";
      //   const roles = req.headers.roles || "";

      //   console.log("token", token);
      //   console.log("roles", roles);
      // },
    });
    await server.start();
    server.applyMiddleware({ app });
    await new Promise((resolve) => httpServer.listen({ port: 4001 }, resolve));
    console.log(
      `🚀 Server ready at http://localhost:4001${server.graphqlPath}`
    );
  });
}

main();
