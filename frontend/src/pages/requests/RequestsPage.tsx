import {
  RequestWhere,
  SortDirection,
  useRequestsListLazyQuery,
} from "../../generated/graphql";
import { useState } from "react";
import {
  RequestsListColumns,
  SampleMetadataDetailsColumns,
  handleSearch,
} from "../../shared/helpers";
import RecordsList from "../../components/RecordsList";
import { useParams } from "react-router-dom";

const typeNames = [
  "igoProjectId",
  "igoRequestId",
  "projectManagerName",
  "investigatorName",
  "piEmail",
  "dataAnalystName",
  "dataAnalystEmail",
  "genePanel",
  "labHeadName",
  "labHeadEmail",
  "qcAccessEmails",
  "dataAccessEmails",
  "otherContactEmails",
];

const queryTerms = typeNames.map((tn) => `${tn}_MATCHES`);

function requestFilterWhereVariables(
  parsedSearchVals: string[]
): RequestWhere[] {
  return parsedSearchVals.flatMap((searchVal) =>
    queryTerms.map((queryTerm) => ({ [queryTerm]: `(?i).*${searchVal}.*` }))
  );
}

export default function RequestsPage() {
  const params = useParams();
  const [userSearchVal, setUserSearchVal] = useState<string>("");
  const [parsedSearchVals, setParsedSearchVals] = useState<string[]>([]);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const dataName = "requests";
  const sampleQueryParamFieldName = "igoRequestId";
  const sampleQueryParamValue = params[sampleQueryParamFieldName];
  const defaultSort = [{ importDate: SortDirection.Desc }];

  return (
    <RecordsList
      colDefs={RequestsListColumns}
      dataName={dataName}
      lazyRecordsQuery={useRequestsListLazyQuery}
      queryFilterWhereVariables={requestFilterWhereVariables}
      defaultSort={defaultSort}
      userSearchVal={userSearchVal}
      setUserSearchVal={setUserSearchVal}
      parsedSearchVals={parsedSearchVals}
      setParsedSearchVals={setParsedSearchVals}
      handleSearch={() => handleSearch(userSearchVal, setParsedSearchVals)}
      showDownloadModal={showDownloadModal}
      setShowDownloadModal={setShowDownloadModal}
      handleDownload={() => setShowDownloadModal(true)}
      samplesColDefs={SampleMetadataDetailsColumns}
      sampleContext={
        sampleQueryParamValue
          ? {
              fieldName: sampleQueryParamFieldName,
              values: [sampleQueryParamValue],
            }
          : undefined
      }
    />
  );
}
