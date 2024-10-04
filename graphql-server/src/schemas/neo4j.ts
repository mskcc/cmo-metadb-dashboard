import neo4j from "neo4j-driver";
import { Neo4jGraphQL } from "@neo4j/graphql";
import { OGM } from "@neo4j/graphql-ogm";
import { toGraphQLTypeDefs } from "@neo4j/introspector";
import { SortDirection } from "../generated/graphql";
import { gql } from "apollo-server";
import {
  flattenedCohortFields,
  flattenedPatientFields,
  flattenedRequestFields,
  generateFieldResolvers,
  sortArrayByNestedField,
} from "../utils/flattening";
import { neo4jDriver } from "../utils/servers";

type SortOptions = { [key: string]: SortDirection }[];

export async function buildNeo4jDbSchema() {
  const sessionFactory = () =>
    neo4jDriver.session({ defaultAccessMode: neo4j.session.WRITE });

  const typeDefs = await toGraphQLTypeDefs(sessionFactory, false);
  const extendedTypeDefs = gql`
    ${typeDefs}
    extend type Request {
      importDate: String
      totalSampleCount: Int
    }

    extend type Patient {
      cmoPatientId: String
      dmpPatientId: String
      totalSampleCount: Int
      cmoSampleIds: String
      consentPartA: String
      consentPartC: String
    }

    extend type Cohort {
      totalSampleCount: Int
      smileSampleIds: [String]
      billed: String
      initialCohortDeliveryDate: String
      endUsers: String
      pmUsers: String
      projectTitle: String
      projectSubtitle: String
      status: String
      type: String
    }
  `;

  const features = {
    filters: {
      String: {
        MATCHES: true,
      },
    },
  };

  const ogm = new OGM({
    typeDefs: extendedTypeDefs,
    driver: neo4jDriver,
    features,
  });
  const neoSchema = new Neo4jGraphQL({
    typeDefs: extendedTypeDefs,
    driver: neo4jDriver,
    validate: false,
    resolvers: buildResolvers(ogm),
    features,
  });

  await ogm.init();
  const neo4jDbSchema = await neoSchema.getSchema();

  return {
    neo4jDbSchema,
    ogm,
  };
}

function buildResolvers(ogm: OGM) {
  return {
    Query: {
      async requests(_source: undefined, args: any) {
        const requests = await ogm.model("Request").find({
          where: args.where,
          options: {
            sort: args.options?.sort,
          },
          selectionSet: `{
            igoRequestId
            igoProjectId
            genePanel
            dataAnalystName
            dataAnalystEmail
            dataAccessEmails
            bicAnalysis
            investigatorEmail
            investigatorName
            isCmoRequest
            labHeadEmail
            labHeadName
            libraryType
            otherContactEmails
            piEmail
            projectManagerName
            qcAccessEmails
            smileRequestId
            hasMetadataRequestMetadata {
              importDate
            }
            hasSampleSamplesConnection {
              totalCount
            }
          }`,
        });

        if (args.options?.sort) {
          const sortOptions: SortOptions = args.options.sort;
          const sortField = Object.keys(sortOptions[0])[0];
          const sortOrder = Object.values(sortOptions[0])[0];

          if (flattenedRequestFields.includes(sortField)) {
            await sortArrayByNestedField(
              requests,
              "Request",
              sortField,
              sortOrder
            );
          }
        }

        if (args.options?.limit == null) {
          return requests;
        }
        return requests.slice(args.options.offset, args.options.limit);
      },
      async patients(_source: undefined, args: any) {
        const patients = await ogm.model("Patient").find({
          where: args.where,
          options: {
            sort: args.options?.sort,
          },
          selectionSet: `{
            smilePatientId
            hasSampleSamples {
              smileSampleId
              hasMetadataSampleMetadata {
                primaryId
                cmoSampleName
                additionalProperties
                cmoPatientId
              }
            }
            hasSampleSamplesConnection {
              totalCount
            }
            patientAliasesIsAlias {
              namespace
              value
            }
          }`,
        });

        if (args.options?.sort) {
          const sortOptions: SortOptions = args.options.sort;
          const sortField = Object.keys(sortOptions[0])[0];
          const sortOrder = Object.values(sortOptions[0])[0];

          if (flattenedPatientFields.includes(sortField)) {
            await sortArrayByNestedField(
              patients,
              "Patient",
              sortField,
              sortOrder
            );
          }
        }

        if (args.options?.limit == null) {
          return patients;
        }
        return patients.slice(args.options.offset, args.options.limit + 1);
      },
      async cohorts(_source: undefined, args: any) {
        const cohorts = await ogm.model("Cohort").find({
          where: args.where,
          options: args.options,
          selectionSet: `{
            cohortId
            smileSampleIds
            hasCohortCompleteCohortCompletes {
              date
              endUsers
              pmUsers
              projectTitle
              projectSubtitle
              status
              type
            }
            hasCohortSampleSamplesConnection {
              totalCount
            }
            hasCohortSampleSamples {
              smileSampleId
              hasTempoTempos {
                smileTempoId
                billed
              }
            }
          }`,
        });

        if (args.options?.sort) {
          const sortOptions: SortOptions = args.options.sort;
          const sortField = Object.keys(sortOptions[0])[0];
          const sortOrder = Object.values(sortOptions[0])[0];

          // We don't check for other flattened fields here because the Cohorts AG Grid opts out of the Server-Side Row Model. We only need to sort by initialCohortDeliveryDate for the initial load
          if (sortField === "initialCohortDeliveryDate") {
            await sortArrayByNestedField(
              cohorts,
              "Cohort",
              "initialCohortDeliveryDate",
              sortOrder
            );
          }
        }

        return cohorts;
      },
    },
    Request: generateFieldResolvers(flattenedRequestFields, "Request"),
    Patient: generateFieldResolvers(flattenedPatientFields, "Patient"),
    Cohort: generateFieldResolvers(flattenedCohortFields, "Cohort"),
  };
}
