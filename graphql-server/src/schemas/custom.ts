import { makeExecutableSchema } from "@graphql-tools/schema";
import { ApolloServerContext, neo4jDriver } from "../utils/servers";
import { CachedOncotreeData } from "../utils/oncotree";
import NodeCache from "node-cache";
import { parseJsonSafely } from "../utils/json";
import { gql } from "apollo-server";
import { SampleContext, DashboardSampleInput } from "../generated/graphql";
import { props } from "../utils/constants";
import { connect, headers, StringCodec } from "nats";
import { OGM } from "@neo4j/graphql-ogm";
const request = require("request-promise-native");

export async function buildCustomSchema(ogm: OGM) {
  const resolvers = {
    Query: {
      async dashboardSamples(
        _source: undefined,
        {
          searchVals,
          sampleContext,
        }: { searchVals: string[]; sampleContext: SampleContext },
        { oncotreeCache }: ApolloServerContext
      ) {
        const addlOncotreeCodes = getAddlOtCodesMatchingCtOrCtdVals({
          searchVals,
          oncotreeCache,
        });

        return await queryDashboardSamples({
          searchVals,
          sampleContext,
          oncotreeCache,
          addlOncotreeCodes: Array.from(addlOncotreeCodes),
        });
      },
      async dashboardSampleCount(
        _source: undefined,
        {
          searchVals,
          sampleContext,
        }: { searchVals: string[]; sampleContext: SampleContext },
        { oncotreeCache }: ApolloServerContext
      ) {
        const addlOncotreeCodes = getAddlOtCodesMatchingCtOrCtdVals({
          searchVals,
          oncotreeCache,
        });

        return await queryDashboardSampleCount({
          searchVals,
          sampleContext,
          addlOncotreeCodes: Array.from(addlOncotreeCodes),
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
      validationStatus: String

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

    type DashboardSampleCount {
      count: Int
    }

    input SampleContext {
      fieldName: String
      values: [String!]!
    }

    type Query {
      dashboardSamples(
        searchVals: [String]
        sampleContext: SampleContext
      ): [DashboardSample!]!
      dashboardSampleCount(
        searchVals: [String]
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
      validationStatus: String

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
  searchVals,
  sampleContext,
  oncotreeCache,
  addlOncotreeCodes,
}: {
  searchVals: string[];
  sampleContext?: SampleContext;
  oncotreeCache: NodeCache;
  addlOncotreeCodes: string[];
}) {
  const partialCypherQuery = buildPartialCypherQuery({
    searchVals,
    sampleContext,
    addlOncotreeCodes,
  });

  const cypherQuery = `
  ${partialCypherQuery}
  RETURN
    sample.smileSampleId AS smileSampleId,
    sample.revisable AS revisable,

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

    oldestCC.date AS initialPipelineRunDate,

    latestT.smileTempoId AS smileTempoId,
    latestT.billed AS billed,
    latestT.costCenter AS costCenter,
    latestT.billedBy AS billedBy,
    latestT.custodianInformation AS custodianInformation,
    latestT.accessLevel AS accessLevel,

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
  LIMIT 500
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
    console.error("Error running query:", error);
  }
}

async function queryDashboardSampleCount({
  searchVals,
  sampleContext,
  addlOncotreeCodes,
}: {
  searchVals: string[];
  sampleContext?: SampleContext;
  addlOncotreeCodes: string[];
}) {
  const partialCypherQuery = buildPartialCypherQuery({
    searchVals,
    sampleContext,
    addlOncotreeCodes,
  });

  const cypherQuery = `
  ${partialCypherQuery}
  RETURN
    count(sample) AS totalCount
  `;

  const session = neo4jDriver.session();
  try {
    const result = await session.run(cypherQuery);
    return result.records[0].toObject();
  } catch (error) {
    console.error("Error running query:", error);
  }
}

function buildPartialCypherQuery({
  searchVals,
  sampleContext,
  addlOncotreeCodes,
}: {
  searchVals: string[];
  sampleContext?: SampleContext;
  addlOncotreeCodes: string[];
}) {
  function buildSearchFilter(
    variable: string,
    fields: string[],
    searchVals: string[],
    useFuzzyMatch: boolean = true
  ): string {
    const regexPattern = useFuzzyMatch
      ? `(?i).*(${searchVals.join("|")}).*`
      : `${searchVals.join("|")}`;
    return fields
      .map(
        (field) =>
          `${variable}.${field} =${useFuzzyMatch ? "~" : ""} '${regexPattern}'`
      )
      .join(" OR ");
  }

  const searchFiltersConfig = [
    {
      variable: "sm",
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
        "cmoSampleIdFields",
      ],
    },
    {
      variable: "t",
      fields: ["costCenter", "billedBy", "custodianInformation", "accessLevel"],
    },
    { variable: "bc", fields: ["date", "status"] },
    { variable: "mc", fields: ["date", "normalPrimaryId", "status"] },
    { variable: "qc", fields: ["date", "result", "reason", "status"] },
  ];

  const searchFilters =
    searchVals.length > 0
      ? searchFiltersConfig.map(
          (config) =>
            `${buildSearchFilter(config.variable, config.fields, searchVals)}`
        )
      : ["", "", "", "", ""];

  const [smFilters, tFilters, bcFilters, mcFilters, qcFilters] = searchFilters;

  const addlOncotreeCodeFilters =
    addlOncotreeCodes.length > 0
      ? ` OR ${buildSearchFilter("sm", ["oncotreeCode"], addlOncotreeCodes)}`
      : "";

  const smOrFilters = smFilters
    ? `${"(" + smFilters + addlOncotreeCodeFilters + ")"}`
    : "";

  const wesFilters =
    sampleContext?.fieldName === "genePanel"
      ? `${smFilters && " AND "}${buildSearchFilter(
          "sm",
          ["genePanel"],
          sampleContext.values
        )}`
      : "";

  const requestFilters =
    sampleContext?.fieldName === "igoRequestId"
      ? `${smOrFilters && " AND "}${buildSearchFilter(
          "sm",
          ["igoRequestId"],
          sampleContext.values,
          false
        )}`
      : "";

  const patientFilters =
    sampleContext?.fieldName === "patientId"
      ? `${buildSearchFilter("pa", ["value"], sampleContext.values, false)}`
      : "";

  const cohortFilters =
    sampleContext?.fieldName === "cohortId"
      ? `${buildSearchFilter("c", ["cohortId"], sampleContext.values, false)}`
      : "";

  let allSmFilters = "";
  if (smOrFilters || wesFilters || requestFilters) {
    allSmFilters = "WHERE " + smOrFilters + wesFilters + requestFilters;
  }

  const partialCypherQuery = `
  // all Samples have at least one SampleMetadata (SampleMetadata is required)
  MATCH (s:Sample)-[:HAS_METADATA]->(sm:SampleMetadata)

  ${allSmFilters}

  // now get the most recent import date for each Sample from the SampleMetadata (we still have all the SampleMetadata for each Sample)
  WITH s, collect(sm) AS allSampleMetadata, max(sm.importDate) AS latestImportDate

  // now only keep one of the SampleMetadata that has the most recent importDate (if there is more than one we take the first)
  WITH s, [sm IN allSampleMetadata WHERE sm.importDate = latestImportDate][0] AS latestSm

  // if the most recent SampleMetadata for a Sample has a Status attached to it
  OPTIONAL MATCH (latestSm)-[:HAS_STATUS]->(st:Status)
  WITH s, latestSm, st AS latestSt

  MATCH (s)<-[:HAS_SAMPLE]-(p:Patient)<-[:IS_ALIAS]-(pa:PatientAlias)
  ${patientFilters && `WHERE ${patientFilters}`}

  // if the Sample belongs to any Cohorts, get them - the Cohort will have a CohortComplete so get that too
  ${
    cohortFilters ? "" : "OPTIONAL "
  }MATCH (s:Sample)<-[:HAS_COHORT_SAMPLE]-(c:Cohort)-[:HAS_COHORT_COMPLETE]->(cc:CohortComplete)

  ${cohortFilters && `WHERE ${cohortFilters}`}

  // we then collect all the CohortCompletes for each Sample and get the most recent CohortComplete.date
  WITH s, latestSm, latestSt, collect(cc) AS allCohortComplete, min(cc.date) AS oldestCCDate

  // now only keep one of the CohortCompletes that has the most recent CohortComplete date (if there is more than one take the first)
  WITH s, latestSm, latestSt, [cc IN allCohortComplete WHERE cc.date = oldestCCDate][0] AS oldestCC
  
  // if the Sample has Tempos get them
  OPTIONAL MATCH (s:Sample)-[:HAS_TEMPO]->(t:Tempo)

  ${tFilters && `WHERE ${tFilters}`}

  // now get the most recent date for each Sample from the Tempos (we still have all the Tempos for each Sample)
  WITH s, latestSm, latestSt, oldestCC, collect(t) AS allTempos, max(t.date) AS latestTDate

  // now only keep one of the Tempos that has the most recent date (if there is more than one we take the first)
  WITH s, latestSm, latestSt, oldestCC, [t IN allTempos WHERE t.date = latestTDate][0] AS latestT

  // if the Tempo has any BamCompletes, get them
  OPTIONAL MATCH (latestT)-[:HAS_EVENT]->(bc:BamComplete)

  ${bcFilters && `WHERE ${bcFilters}`}

  // now get the most recent date for each BamComplete (we still have all the BamCompletes for each Tempo)
  WITH s, latestSm, latestSt, oldestCC, latestT, collect(bc) AS allBamCompletes, max(bc.date) AS latestBCDate

  // now only keep one of the BamCompletes that has the most recent date (if there is more than one we take the first)
  WITH s, latestSm, latestSt, oldestCC, latestT, [bc IN allBamCompletes WHERE bc.date = latestBCDate][0] AS latestBC

  // if the Tempo has any MafCompletes, get them
  OPTIONAL MATCH (latestT)-[:HAS_EVENT]->(mc:MafComplete)

  ${mcFilters && `WHERE ${mcFilters}`}

  // now get the most recent date for each MafComplete (we still have all the MafCompletes for each Tempo)
  WITH s, latestSm, latestSt, oldestCC, latestT, latestBC, collect(mc) AS allMafCompletes, max(mc.date) AS latestMCDate

  // now only keep one of the MafCompletes that has the most recent date (if there is more than one we take the first)
  WITH s, latestSm, latestSt, oldestCC, latestT, latestBC, [mc IN allMafCompletes WHERE mc.date = latestMCDate][0] AS latestMC

  // if the Tempo has any QcCompletes, get them
  OPTIONAL MATCH (latestT)-[:HAS_EVENT]->(qc:QcComplete)

  ${qcFilters && `WHERE ${qcFilters}`}

  // now get the most recent date for each QcComplete (we still have all the QcCompletes for each Tempo)
  WITH s, latestSm, latestSt, oldestCC, latestT, latestBC, latestMC, collect(qc) AS allQcCompletes, max(qc.date) AS latestQCDate

  // now only keep one of the QcCompletes that has the most recent date (if there is more than one we take the first)
  WITH s, latestSm, latestSt, oldestCC, latestT, latestBC, latestMC, [qc IN allQcCompletes WHERE qc.date = latestQCDate][0] AS latestQC

  // return whatever we need (TODO would it be faster if we only return the fields we need?  should we be filtering those from the start of the query?)
  WITH s AS sample,
        latestSm,
        latestSt,
        oldestCC,
        latestT,
        latestBC,
        latestMC,
        latestQC
  `;

  return partialCypherQuery;
}

function getAddlOtCodesMatchingCtOrCtdVals({
  searchVals,
  oncotreeCache,
}: {
  searchVals: string[];
  oncotreeCache: NodeCache;
}) {
  let addlOncotreeCodes: Set<string> = new Set();
  if (searchVals.length > 0) {
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
  return addlOncotreeCodes;
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
    console.log("Connected to server: ");
    console.log(natsConn.getServer());
    console.log("publishing message: ", message, "\nto topic", topic);
    const h = headers();
    h.append("Nats-Msg-Subject", topic);
    natsConn.publish(topic, sc.encode(JSON.stringify(message)), { headers: h });
  } catch (err) {
    console.log(
      `error connecting to ${JSON.stringify(natsConnProperties)}`,
      err
    );
  }
}
