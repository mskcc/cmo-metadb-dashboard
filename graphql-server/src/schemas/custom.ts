import { makeExecutableSchema } from "@graphql-tools/schema";
import { ApolloServerContext, neo4jDriver } from "../utils/servers";
import { CachedOncotreeData } from "../utils/oncotree";
import NodeCache from "node-cache";
import { parseJsonSafely } from "../utils/json";
import { gql } from "apollo-server";
import {
  DashboardSampleInput,
  QueryDashboardSampleCountArgs,
  QueryDashboardSamplesArgs,
} from "../generated/graphql";
import { props } from "../utils/constants";
import { connect, headers, StringCodec } from "nats";
import { OGM } from "@neo4j/graphql-ogm";
const request = require("request-promise-native");

export async function buildCustomSchema(ogm: OGM) {
  const resolvers = {
    Query: {
      async dashboardSamples(
        _source: undefined,
        { searchVals, sampleContext, limit }: QueryDashboardSamplesArgs,
        { oncotreeCache }: ApolloServerContext
      ) {
        const addlOncotreeCodes = getAddlOtCodesMatchingCtOrCtdVals({
          searchVals,
          oncotreeCache,
        });

        const partialCypherQuery = buildPartialCypherQuery({
          searchVals,
          sampleContext,
          addlOncotreeCodes,
        });

        return await queryDashboardSamples({
          partialCypherQuery,
          limit,
          oncotreeCache,
        });
      },
      async dashboardSampleCount(
        _source: undefined,
        { searchVals, sampleContext }: QueryDashboardSampleCountArgs,
        { oncotreeCache }: ApolloServerContext
      ) {
        const addlOncotreeCodes = getAddlOtCodesMatchingCtOrCtdVals({
          searchVals,
          oncotreeCache,
        });

        const partialCypherQuery = buildPartialCypherQuery({
          searchVals,
          sampleContext,
          addlOncotreeCodes,
        });

        return await queryDashboardSampleCount({
          partialCypherQuery,
        });
      },
    },
    Mutation: {
      async updateDashboardSamples(
        _source: undefined,
        { newDashboardSamples }: { newDashboardSamples: DashboardSampleInput[] }
      ) {
        updateAllSamplesConcurrently(newDashboardSamples, ogm);

        // Here, we're returning newDashboardSamples for simplicity. However, if we were to follow
        // GraphQL's convention, we'd return the actual resulting data from the database update. This
        // means we'd wait for SMILE services to finish processing the data changes, then query that
        // data to return it to the frontend. For more context, see:
        // https://www.apollographql.com/docs/react/performance/optimistic-ui/#optimistic-mutation-lifecycle
        return newDashboardSamples;
      },
    },
  };

  const typeDefs = gql`
    type DashboardSampleCount {
      totalCount: Int
    }

    type DashboardSample {
      # (s:Sample)
      smileSampleId: String!
      revisable: Boolean

      # (s:Sample)-[:HAS_METADATA]->(sm:SampleMetadata)
      ## Root-level fields
      primaryId: String!
      cmoSampleName: String
      importDate: String
      cmoPatientId: String
      investigatorSampleId: String
      sampleType: String
      species: String
      genePanel: String
      baitSet: String
      preservation: String
      tumorOrNormal: String
      sampleClass: String
      oncotreeCode: String
      collectionYear: String
      sampleOrigin: String
      tissueLocation: String
      sex: String
      ## Custom fields
      recipe: String
      ## (sm:SampleMetadata)-[:HAS_STATUS]->(s:Status)
      validationReport: String
      validationStatus: Boolean

      # Oncotree API
      cancerType: String
      cancerTypeDetailed: String

      ## (s:Sample)-[:HAS_TEMPO]->(t:Tempo)
      ## Root-level fields
      billed: Boolean
      costCenter: String
      billedBy: String
      custodianInformation: String
      accessLevel: String
      ## Custom fields
      initialPipelineRunDate: String
      embargoDate: String
      ## (t:Tempo)-[:HAS_EVENT]->(bc:BamComplete)
      bamCompleteDate: String
      bamCompleteStatus: String
      ## (t:Tempo)-[:HAS_EVENT]->(mc:MafComplete)
      mafCompleteDate: String
      mafCompleteNormalPrimaryId: String
      mafCompleteStatus: String
      # (t:Tempo)-[:HAS_EVENT]->(qc:QcComplete)
      qcCompleteDate: String
      qcCompleteResult: String
      qcCompleteReason: String
      qcCompleteStatus: String
    }

    input SampleContext {
      fieldName: String
      values: [String!]!
    }

    type Query {
      dashboardSamples(
        searchVals: [String!]
        sampleContext: SampleContext
        limit: Int!
      ): [DashboardSample!]!
      dashboardSampleCount(
        searchVals: [String!]
        sampleContext: SampleContext
      ): DashboardSampleCount!
    }

    # We have to define a separate "input" type and can't reuse DashboardSample.
    # For more context, see: https://stackoverflow.com/q/41743253
    input DashboardSampleInput {
      changedFieldNames: [String!]!

      # (s:Sample)
      smileSampleId: String!
      revisable: Boolean

      # (s:Sample)-[:HAS_METADATA]->(sm:SampleMetadata)
      ## Root-level fields
      primaryId: String!
      cmoSampleName: String
      importDate: String
      cmoPatientId: String
      investigatorSampleId: String
      sampleType: String
      species: String
      genePanel: String
      baitSet: String
      preservation: String
      tumorOrNormal: String
      sampleClass: String
      oncotreeCode: String
      collectionYear: String
      sampleOrigin: String
      tissueLocation: String
      sex: String
      ## Custom fields
      recipe: String
      ## (sm:SampleMetadata)-[:HAS_STATUS]->(s:Status)
      validationReport: String
      validationStatus: Boolean

      # Oncotree API
      cancerType: String
      cancerTypeDetailed: String

      ## (s:Sample)-[:HAS_TEMPO]->(t:Tempo)
      ## Root-level fields
      billed: Boolean
      costCenter: String
      billedBy: String
      custodianInformation: String
      accessLevel: String
      ## Custom fields
      initialPipelineRunDate: String
      embargoDate: String
      ## (t:Tempo)-[:HAS_EVENT]->(bc:BamComplete)
      bamCompleteDate: String
      bamCompleteStatus: String
      ## (t:Tempo)-[:HAS_EVENT]->(mc:MafComplete)
      mafCompleteDate: String
      mafCompleteNormalPrimaryId: String
      mafCompleteStatus: String
      # (t:Tempo)-[:HAS_EVENT]->(qc:QcComplete)
      qcCompleteDate: String
      qcCompleteResult: String
      qcCompleteReason: String
      qcCompleteStatus: String
    }

    type Mutation {
      updateDashboardSamples(
        newDashboardSamples: [DashboardSampleInput]
      ): [DashboardSample]
    }
  `;

  return makeExecutableSchema({
    typeDefs: typeDefs,
    resolvers: resolvers,
  });
}

async function queryDashboardSamples({
  partialCypherQuery,
  limit,
  oncotreeCache,
}: {
  partialCypherQuery: string;
  limit: QueryDashboardSamplesArgs["limit"];
  oncotreeCache: NodeCache;
}) {
  const cypherQuery = `
    ${partialCypherQuery}
    RETURN
      s.smileSampleId AS smileSampleId,
      s.revisable AS revisable,

      latestSm.primaryId AS primaryId,
      latestSm.cmoSampleName AS cmoSampleName,
      latestSm.importDate AS importDate,
      latestSm.cmoPatientId AS cmoPatientId,
      latestSm.investigatorSampleId AS investigatorSampleId,
      latestSm.sampleType AS sampleType,
      latestSm.species AS species,
      latestSm.genePanel AS genePanel,
      latestSm.baitSet AS baitSet,
      latestSm.preservation AS preservation,
      latestSm.tumorOrNormal AS tumorOrNormal,
      latestSm.sampleClass AS sampleClass,
      latestSm.oncotreeCode AS oncotreeCode,
      latestSm.collectionYear AS collectionYear,
      latestSm.sampleOrigin AS sampleOrigin,
      latestSm.tissueLocation AS tissueLocation,
      latestSm.sex AS sex,
      latestSm.cmoSampleIdFields AS cmoSampleIdFields,

      oldestCCDate AS initialPipelineRunDate,

      t.smileTempoId AS smileTempoId,
      t.billed AS billed,
      t.costCenter AS costCenter,
      t.billedBy AS billedBy,
      t.custodianInformation AS custodianInformation,
      t.accessLevel AS accessLevel,

      latestBC.date AS bamCompleteDate,
      latestBC.status AS bamCompleteStatus,

      latestMC.date AS mafCompleteDate,
      latestMC.normalPrimaryId AS mafCompleteNormalPrimaryId,
      latestMC.status AS mafCompleteStatus,

      latestQC.date AS qcCompleteDate,
      latestQC.result AS qcCompleteResult,
      latestQC.reason AS qcCompleteReason,
      latestQC.status AS qcCompleteStatus

    ORDER BY importDate DESC
    LIMIT ${limit}
  `;

  const session = neo4jDriver.session();
  try {
    const result = await session.run(cypherQuery);

    return result.records.map((record) => {
      const recordObject = record.toObject();
      const otCache = recordObject.oncotreeCode
        ? (oncotreeCache.get(recordObject.oncotreeCode) as CachedOncotreeData)
        : null;

      return {
        ...recordObject,
        recipe: parseJsonSafely(recordObject.cmoSampleIdFields)?.recipe,
        embargoDate: recordObject.initialPipelineRunDate
          ? new Date(
              new Date(recordObject.initialPipelineRunDate).setMonth(
                new Date(recordObject.initialPipelineRunDate).getMonth() + 18
              )
            ).toISOString()
          : null,
        cancerType: otCache?.mainType,
        cancerTypeDetailed: otCache?.name,
      };
    });
  } catch (error) {
    console.error("Error with queryDashboardSamples:", error);
  }
}

async function queryDashboardSampleCount({
  partialCypherQuery,
}: {
  partialCypherQuery: string;
}) {
  const cypherQuery = `
    ${partialCypherQuery}
    RETURN
      count(s) AS totalCount
  `;

  const session = neo4jDriver.session();
  try {
    const result = await session.run(cypherQuery);
    return result.records[0].toObject();
  } catch (error) {
    console.error("Error with queryDashboardSampleCount:", error);
  }
}

function buildSearchFilters({
  variable,
  fields,
  searchVals,
  useFuzzyMatch = true,
}: {
  variable: string;
  fields: string[];
  searchVals: string[];
  useFuzzyMatch?: boolean;
}): string {
  if (useFuzzyMatch) {
    return fields
      .map(
        (field) => `${variable}.${field} =~ '(?i).*(${searchVals.join("|")}).*'`
      )
      .join(" OR ");
  } else {
    return fields
      .flatMap((field) =>
        searchVals.map((val) => `${variable}.${field} = '${val}'`)
      )
      .join(" OR ");
  }
}

const searchFiltersConfig = [
  {
    variable: "latestSm",
    fields: [
      "primaryId",
      "cmoSampleName",
      "importDate",
      "cmoPatientId",
      "investigatorSampleId",
      "sampleType",
      "species",
      "genePanel",
      "baitSet",
      "preservation",
      "tumorOrNormal",
      "sampleClass",
      "oncotreeCode",
      "collectionYear",
      "sampleOrigin",
      "tissueLocation",
      "sex",
      "cmoSampleIdFields", // for searching recipe
    ],
  },
  {
    variable: "t",
    fields: ["costCenter", "billedBy", "custodianInformation", "accessLevel"],
  },
  { variable: "latestBC", fields: ["date", "status"] },
  { variable: "latestMC", fields: ["date", "normalPrimaryId", "status"] },
  { variable: "latestQC", fields: ["date", "result", "reason", "status"] },
];

function buildPartialCypherQuery({
  searchVals,
  sampleContext,
  addlOncotreeCodes,
}: {
  searchVals: QueryDashboardSampleCountArgs["searchVals"];
  sampleContext?: QueryDashboardSampleCountArgs["sampleContext"];
  addlOncotreeCodes: string[];
}) {
  // Build search filters given user's search values input. For example:
  // latestSm.primaryId =~ '(?i).*(someInput).*' OR latestSm.cmoSampleName =~ '(?i).*(someInput).* OR ...
  const searchFilters = searchVals?.length
    ? searchFiltersConfig
        .map((c) =>
          buildSearchFilters({
            variable: c.variable,
            fields: c.fields,
            searchVals,
          })
        )
        .join(" OR ")
    : "";

  // Add add'l Oncotree codes to search if user inputted "cancerTypeDetailed" or "cancerType" values
  const addlOncotreeCodeFilters = addlOncotreeCodes.length
    ? ` OR ${buildSearchFilters({
        variable: "latestSm",
        fields: ["oncotreeCode"],
        searchVals: addlOncotreeCodes,
        useFuzzyMatch: false,
      })}`
    : "";

  const fullSearchFilters = searchFilters
    ? `(${searchFilters}${addlOncotreeCodeFilters})`
    : "";

  // Filters for the WES Samples view on Samples page
  const wesContext =
    sampleContext?.fieldName === "genePanel"
      ? `${fullSearchFilters && " AND "}${buildSearchFilters({
          variable: "latestSm",
          fields: ["genePanel"],
          searchVals: sampleContext.values,
        })}`
      : "";

  // Filters for the Request Samples view
  const requestContext =
    sampleContext?.fieldName === "igoRequestId"
      ? `${fullSearchFilters && " AND "}latestSm.igoRequestId = '${
          sampleContext.values[0]
        }'`
      : "";

  // Filters for the Patient Samples view
  const patientContext =
    sampleContext?.fieldName === "patientId"
      ? `pa.value = '${sampleContext.values[0]}'`
      : "";

  // Filters for the Cohort Samples view
  const cohortContext =
    sampleContext?.fieldName === "cohortId"
      ? `c.cohortId = '${sampleContext.values[0]}'`
      : "";

  const partialCypherQuery = `
    // Get Sample and the most recent SampleMetadata
    MATCH (s:Sample)-[:HAS_METADATA]->(sm:SampleMetadata)
    WITH s, collect(sm) AS allSampleMetadata, max(sm.importDate) AS latestImportDate
    WITH s, [sm IN allSampleMetadata WHERE sm.importDate = latestImportDate][0] AS latestSm

    // Get SampleMetadata's Status
    OPTIONAL MATCH (latestSm)-[:HAS_STATUS]->(st:Status)
    WITH s, latestSm, st AS latestSt

    // Filters for Patient Samples view, if applicable
    ${
      patientContext &&
      `MATCH (s)<-[:HAS_SAMPLE]-(p:Patient)<-[:IS_ALIAS]-(pa:PatientAlias) WHERE ${patientContext}`
    }

    // Filters for Cohort Samples view, if applicable
    ${
      cohortContext ? "" : "OPTIONAL "
    }MATCH (s:Sample)<-[:HAS_COHORT_SAMPLE]-(c:Cohort)-[:HAS_COHORT_COMPLETE]->(cc:CohortComplete)
    ${cohortContext && `WHERE ${cohortContext}`}

    // Get the oldest CohortComplete date ("Initial Pipeline Run Date" in Cohort Samples view)
    WITH s, latestSm, latestSt, min(cc.date) AS oldestCCDate

    // Get Tempo data
    OPTIONAL MATCH (s:Sample)-[:HAS_TEMPO]->(t:Tempo)
    WITH s, latestSm, latestSt, oldestCCDate, t

    // Get the most recent BamComplete event
    OPTIONAL MATCH (t)-[:HAS_EVENT]->(bc:BamComplete)
    WITH s, latestSm, latestSt, oldestCCDate, t, collect(bc) AS allBamCompletes, max(bc.date) AS latestBCDate
    WITH s, latestSm, latestSt, oldestCCDate, t, [bc IN allBamCompletes WHERE bc.date = latestBCDate][0] AS latestBC

    // Get the most recent MafComplete event
    OPTIONAL MATCH (t)-[:HAS_EVENT]->(mc:MafComplete)
    WITH s, latestSm, latestSt, oldestCCDate, t, latestBC, collect(mc) AS allMafCompletes, max(mc.date) AS latestMCDate
    WITH s, latestSm, latestSt, oldestCCDate, t, latestBC, [mc IN allMafCompletes WHERE mc.date = latestMCDate][0] AS latestMC

    // Get the most recent QcComplete event
    OPTIONAL MATCH (t)-[:HAS_EVENT]->(qc:QcComplete)
    WITH s, latestSm, latestSt, oldestCCDate, t, latestBC, latestMC, collect(qc) AS allQcCompletes, max(qc.date) AS latestQCDate
    WITH s, latestSm, latestSt, oldestCCDate, t, latestBC, latestMC, [qc IN allQcCompletes WHERE qc.date = latestQCDate][0] AS latestQC

    WITH
      s,
      latestSm,
      latestSt,
      oldestCCDate,
      t,
      latestBC,
      latestMC,
      latestQC
    
    ${
      fullSearchFilters || wesContext || requestContext
        ? `WHERE ${fullSearchFilters}${wesContext}${requestContext}`
        : ""
    }
  `;

  return partialCypherQuery;
}

function getAddlOtCodesMatchingCtOrCtdVals({
  searchVals,
  oncotreeCache,
}: {
  searchVals: QueryDashboardSamplesArgs["searchVals"];
  oncotreeCache: NodeCache;
}) {
  let addlOncotreeCodes: Set<string> = new Set();
  if (searchVals?.length) {
    oncotreeCache.keys().forEach((code) => {
      const { name, mainType } = (oncotreeCache.get(
        code
      ) as CachedOncotreeData)!;
      searchVals.forEach((val) => {
        if (
          name?.toLowerCase().includes(val?.toLowerCase()) ||
          mainType?.toLowerCase().includes(val?.toLowerCase())
        ) {
          addlOncotreeCodes.add(code);
        }
      });
    });
  }
  return Array.from(addlOncotreeCodes);
}

async function updateSampleMetadata(
  newDashboardSample: DashboardSampleInput,
  ogm: OGM
) {
  return new Promise(async (resolve) => {
    const sampleManifest = await request(
      props.smile_sample_endpoint + newDashboardSample.primaryId,
      {
        json: true,
      }
    );

    Object.keys(newDashboardSample).forEach((key) => {
      if (key in sampleManifest) {
        sampleManifest[key] =
          newDashboardSample[key as keyof DashboardSampleInput];
      }
    });

    // Ensure validator and label generator use latest status data added during validation
    delete sampleManifest["status"];

    // Ensure isCmoSample is set in sample's 'additionalProperties' if not already present.
    // This ensures that cmo samples get sent to the label generator after validation as
    // some of the older SMILE samples do not have this additionalProperty set
    if (sampleManifest["additionalProperties"]["isCmoSample"] == null) {
      const requestId = sampleManifest["additionalProperties"]["igoRequestId"];
      let req = ogm.model("Request");
      const rd = await req.find({
        where: { igoRequestId: requestId },
      });
      sampleManifest["additionalProperties"]["isCmoSample"] =
        rd[0]["isCmoRequest"].toString();
    }

    publishNatsMessage(
      props.pub_validate_sample_update,
      JSON.stringify(sampleManifest)
    );

    await ogm.model("Sample").update({
      where: { smileSampleId: sampleManifest.smileSampleId },
      update: { revisable: false },
    });

    resolve(null);
  });
}

async function updateTempo(newDashboardSample: DashboardSampleInput) {
  return new Promise((resolve) => {
    const dataForTempoBillingUpdate = {
      primaryId: newDashboardSample.primaryId,
      billed: newDashboardSample.billed,
      billedBy: newDashboardSample.billedBy,
      costCenter: newDashboardSample.costCenter,
      accessLevel: newDashboardSample.accessLevel,
      custodianInformation: newDashboardSample.custodianInformation,
    };

    publishNatsMessage(
      props.pub_tempo_sample_billing,
      JSON.stringify(dataForTempoBillingUpdate)
    );

    resolve(null);
  });
}

const editableSampleMetadataFields = new Set([
  "cmoPatientId",
  "investigatorSampleId",
  "sampleType",
  "preservation",
  "tumorOrNormal",
  "sampleClass",
  "oncotreeCode",
  "collectionYear",
  "sampleOrigin",
  "tissueLocation",
  "sex",
]);

const editableTempoFields = new Set([
  "billed",
  "costCenter",
  "billedBy",
  "custodianInformation",
  "accessLevel",
]);

async function updateAllSamplesConcurrently(
  newDashboardSamples: DashboardSampleInput[],
  ogm: OGM
) {
  const allPromises = newDashboardSamples.map(async (dashboardSample) => {
    try {
      const metadataChanged = dashboardSample.changedFieldNames.some((field) =>
        editableSampleMetadataFields.has(field)
      );
      const tempoChanged = dashboardSample.changedFieldNames.some((field) =>
        editableTempoFields.has(field)
      );

      const promises = [];
      if (metadataChanged) {
        promises.push(updateSampleMetadata(dashboardSample, ogm));
      }
      if (tempoChanged) {
        promises.push(updateTempo(dashboardSample));
      }

      return Promise.all(promises);
    } catch (error) {
      console.error(
        `Failed to update sample with primaryId ${dashboardSample.primaryId}. Error:`,
        error
      );
      throw error; // ensure Promise.allSettled captures the error
    }
  });

  await Promise.allSettled(allPromises);
}

async function publishNatsMessage(topic: string, message: string) {
  const sc = StringCodec();

  const tlsOptions = {
    keyFile: props.nats_key_pem,
    certFile: props.nats_cert_pem,
    caFile: props.nats_ca_pem,
    rejectUnauthorized: false,
  };

  const natsConnProperties = {
    servers: [props.nats_url],
    user: props.nats_username,
    pass: props.nats_password,
    tls: tlsOptions,
  };

  try {
    const natsConn = await connect(natsConnProperties);
    console.log(
      `Publishing message to NATS server at ${natsConn.getServer()} under topic ${topic}: `,
      message
    );
    const h = headers();
    h.append("Nats-Msg-Subject", topic);
    natsConn.publish(topic, sc.encode(JSON.stringify(message)), { headers: h });
  } catch (err) {
    console.error(
      `error connecting to ${JSON.stringify(natsConnProperties)}`,
      err
    );
  }
}
