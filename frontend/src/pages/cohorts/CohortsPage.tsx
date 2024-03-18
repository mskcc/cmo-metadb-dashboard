import {
  CohortCompleteOptions,
  CohortWhere,
  SampleWhere,
  SortDirection,
  useCohortsListLazyQuery,
} from "../../generated/graphql";
import { useState } from "react";
import {
  CohortSamplesDetailsColumns,
  CohortsListColumns,
  cohortSampleFilterWhereVariables,
  defaultReadOnlyColDef,
  getCohortDataFromSamples,
  handleSearch,
} from "../../shared/helpers";
import RecordsList from "../../components/RecordsList";
import { useParams } from "react-router-dom";
import { PageHeader } from "../../shared/components/PageHeader";

function cohortFilterWhereVariables(parsedSearchVals: string[]): CohortWhere[] {
  if (parsedSearchVals.length > 1) {
    return [{ cohortId_IN: parsedSearchVals }];
  } else {
    return [{ cohortId_CONTAINS: parsedSearchVals[0] }];
  }
}

export default function CohortsPage() {
  const params = useParams();
  const [userSearchVal, setUserSearchVal] = useState<string>("");
  const [parsedSearchVals, setParsedSearchVals] = useState<string[]>([]);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const dataName = "cohorts";
  const sampleQueryParamFieldName = "cohortId";
  const sampleQueryParamHeaderName = "Cohort ID";
  const sampleQueryParamValue = params[sampleQueryParamFieldName];

  return (
    <>
      <PageHeader dataName={dataName} />

      <RecordsList
        colDefs={CohortsListColumns}
        dataName={dataName}
        lazyRecordsQuery={useCohortsListLazyQuery}
        lazyRecordsQueryAddlVariables={
          {
            hasCohortCompleteCohortCompletesOptions2: {
              sort: [{ date: SortDirection.Desc }],
              limit: 1,
            },
          } as CohortCompleteOptions
        }
        queryFilterWhereVariables={cohortFilterWhereVariables}
        userSearchVal={userSearchVal}
        setUserSearchVal={setUserSearchVal}
        parsedSearchVals={parsedSearchVals}
        setParsedSearchVals={setParsedSearchVals}
        handleSearch={() => handleSearch(userSearchVal, setParsedSearchVals)}
        showDownloadModal={showDownloadModal}
        setShowDownloadModal={setShowDownloadModal}
        handleDownload={() => setShowDownloadModal(true)}
        samplesColDefs={CohortSamplesDetailsColumns}
        samplesDefaultColDef={defaultReadOnlyColDef}
        samplesQueryParam={
          sampleQueryParamValue &&
          `${sampleQueryParamHeaderName} "${sampleQueryParamValue}"`
        }
        getSamplesRowData={getCohortDataFromSamples}
        samplesParentWhereVariables={
          {
            cohortsHasCohortSampleConnection_SOME: {
              node: {
                [sampleQueryParamFieldName]: sampleQueryParamValue,
              },
            },
          } as SampleWhere
        }
        samplesRefetchWhereVariables={(samplesParsedSearchVals: string[]) => {
          return {
            cohortsHasCohortSampleConnection_SOME: {
              node: {
                [sampleQueryParamFieldName]: sampleQueryParamValue,
              },
            },
            OR: cohortSampleFilterWhereVariables(samplesParsedSearchVals),
          } as SampleWhere;
        }}
      />
    </>
  );
}
