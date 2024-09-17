import fetch from "node-fetch";
import NodeCache from "node-cache";
import { props } from "./constants";
import {
  InputMaybe,
  SampleMetadataWhere,
  SampleWhere,
} from "../generated/graphql";
import { GraphQLWhereArg } from "@neo4j/graphql/dist/types";

/**
 * Source: https://oncotree.mskcc.org/#/home?tab=api
 */
export type OncotreeTumorType = {
  children: Record<string, unknown>;
  code: string;
  color: string;
  externalReferences: Record<string, unknown>;
  history: string[];
  level: number;
  mainType: string;
  name: string;
  parent: string;
  precursors: string[];
  revocations: string[];
  tissue: string;
};

export type CachedOncotreeData =
  | Pick<OncotreeTumorType, "name" | "mainType">
  | undefined;

export async function fetchAndCacheOncotreeData(oncotreeCache: NodeCache) {
  const data = await fetchOncotreeData();
  if (data) {
    await updateOncotreeCache(data, oncotreeCache);
  }
}

async function fetchOncotreeData() {
  try {
    const response = await fetch(props.oncotree_api, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch the Oncotree API: ${response.statusText}`
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("Unknown error occurred while fetching Oncotree data");
    }
    return null;
  }
}

async function updateOncotreeCache(
  oncotreeData: OncotreeTumorType[],
  oncotreeCache: NodeCache
) {
  // Restructure data for node-cache to store multiple k-v pairs in one go with mset()
  const parsedData = oncotreeData.map((obj) => {
    return {
      key: obj.code,
      val: {
        name: obj.name,
        mainType: obj.mainType,
      } as CachedOncotreeData,
    };
  });

  // Cache codes found in Neo4j but not from Oncotree API (likely due to codes to being renamed).
  // Otherwise, we'll continously fetch the Oncotree API for non-existent codes without stopping
  const existingCodes = await getOncotreeCodesFromNeo4j();
  const fetchedCodes = new Set(parsedData.map((obj) => obj.key));
  if (existingCodes) {
    for (const existingCode of existingCodes) {
      if (!fetchedCodes.has(existingCode)) {
        parsedData.push({
          key: existingCode,
          val: {
            name: "N/A",
            mainType: "N/A",
          } as CachedOncotreeData,
        });
      }
    }
  }

  oncotreeCache.mset(parsedData);
}

async function getOncotreeCodesFromNeo4j() {
  const session = neo4jDriver.session();
  try {
    const result = await session.writeTransaction((tx) =>
      tx.run(`
        MATCH (s:SampleMetadata) RETURN DISTINCT s.oncotreeCode AS oncotreeCode
      `)
    );
    return new Set(
      result.records.map((record) => record.get("oncotreeCode")).filter(Boolean)
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  } finally {
    await session.close();
  }
}

export function includeCancerTypeFieldsInSearch(
  where: InputMaybe<SampleWhere>,
  oncotreeCache: NodeCache
) {
  const customWhere = { ...where };

  // Extract the list of SampleMetadata filters from the search query. For example:
  // [
  //    { "cmoSampleName_CONTAINS": "01234_A_1" },
  //    { "importDate_CONTAINS": "01234_A_1" },
  //    { "investigatorSampleId_CONTAINS": "01234_A_1" },
  //    ...
  // ]
  const sampleMetadataFilters =
    // Other views handler
    customWhere?.OR?.find((filter) => filter.hasMetadataSampleMetadata_SOME)
      ?.hasMetadataSampleMetadata_SOME?.OR ||
    // Request Samples view handler
    customWhere?.hasMetadataSampleMetadata_SOME?.OR;

  if (sampleMetadataFilters?.length) {
    // Extract the user query: searchValues equal ["someValue"] for a single-value search
    // and ["val1", "val2", "val3", ...] for a bulk search
    const searchInput = Object.values(sampleMetadataFilters[0])[0] as
      | string
      | string[];
    const searchValues = Array.isArray(searchInput)
      ? searchInput
      : [searchInput];

    // Search through the oncotreeCache for matching cancerType or cancerTypeDetailed values.
    // If there is a match, add the corresponding Oncotree code to the original search query
    oncotreeCache.keys().forEach((code) => {
      const { name, mainType } = (oncotreeCache.get(
        code
      ) as CachedOncotreeData)!;
      if (
        searchValues.some(
          (val) =>
            name?.toLowerCase().includes(val?.toLowerCase()) ||
            mainType?.toLowerCase().includes(val?.toLowerCase())
        )
      ) {
        sampleMetadataFilters?.push({ oncotreeCode_IN: [code] });
      }
    });
  }

  return customWhere as GraphQLWhereArg;
}
