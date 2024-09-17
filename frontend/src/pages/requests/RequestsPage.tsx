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

function requestFilterWhereVariables(
  parsedSearchVals: string[]
): RequestWhere[] {
  if (parsedSearchVals.length > 1) {
    // search term 08944_b 16167

    // these are just the string names of the members of RequestWhere but we want to be able to make these usable..
    var typenames = [
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
    var queryTerms = typenames.map((tn) => {
      return `${tn}` + "_MATCHES";
    });

    // query terms looks like: [
    //     "igoProjectId_MATCHES",
    //     "igoRequestId_MATCHES",
    //     "projectManagerName_MATCHES",
    //     "investigatorName_MATCHES",
    //     "piEmail_MATCHES",
    //     "dataAnalystName_MATCHES",
    //     "dataAnalystEmail_MATCHES",
    //     "genePanel_MATCHES",
    //     "labHeadName_MATCHES",
    //     "labHeadEmail_MATCHES",
    //     "qcAccessEmails_MATCHES",
    //     "dataAccessEmails_MATCHES",
    //     "otherContactEmails_MATCHES"
    // ]

    // goal is to build a list of the above query terms for every parsed search value entered by the user...
    // ex: [ {igoProjectId_MATCHES: searchTerm1}, {igoProjectId_MATCHES: searchTerm2}, {igoRequestId_MATCHES: searchTerm1}, {igoRequestId_MATCHES: searchTerm2},  etc]

    let compiledQuery = new Array();

    for (var i = 0; i < queryTerms.length; i++) {
      for (var j = 0; j < parsedSearchVals.length; j++) {
        console.log("query term....", queryTerms[i]);
        let val = parsedSearchVals[j];
        // `${queryTerms[i]}`: val
        let m = `\{ ${queryTerms[i]} \: \"${val}\" \}`;
        compiledQuery.push(m);
      }
    }

    console.log("\n\nCOMPILED QUERY TERMS!");
    console.log(queryTerms);

    console.log("compiled query", compiledQuery);

    // this type of WHERE clause means we're only allow exact matches and not using the regex pattern matching
    return [
      { igoProjectId_IN: parsedSearchVals },
      { igoRequestId_IN: parsedSearchVals },
      { projectManagerName_IN: parsedSearchVals },
      { investigatorName_IN: parsedSearchVals },
      { investigatorEmail_IN: parsedSearchVals },
      { piEmail_IN: parsedSearchVals },
      { dataAnalystName_IN: parsedSearchVals },
      { dataAnalystEmail_IN: parsedSearchVals },
      { genePanel_IN: parsedSearchVals },
      { labHeadName_IN: parsedSearchVals },
      { labHeadEmail_IN: parsedSearchVals },
      { qcAccessEmails_IN: parsedSearchVals },
      { dataAccessEmails_IN: parsedSearchVals },
      { otherContactEmails_IN: parsedSearchVals },
    ];
  }

  /// we want to be able to match on a regex OR match on CONTAINS...
  if (parsedSearchVals.length === 1) {
    return [
      { igoProjectId_CONTAINS: parsedSearchVals[0] },
      { igoRequestId_CONTAINS: parsedSearchVals[0] },
      { projectManagerName_CONTAINS: parsedSearchVals[0] },
      { investigatorName_CONTAINS: parsedSearchVals[0] },
      { investigatorEmail_CONTAINS: parsedSearchVals[0] },
      { piEmail_CONTAINS: parsedSearchVals[0] },
      { dataAnalystName_CONTAINS: parsedSearchVals[0] },
      { dataAnalystEmail_CONTAINS: parsedSearchVals[0] },
      { genePanel_CONTAINS: parsedSearchVals[0] },
      { labHeadName_CONTAINS: parsedSearchVals[0] },
      { labHeadEmail_CONTAINS: parsedSearchVals[0] },
      { qcAccessEmails_CONTAINS: parsedSearchVals[0] },
      { dataAccessEmails_CONTAINS: parsedSearchVals[0] },
      { otherContactEmails_CONTAINS: parsedSearchVals[0] },
      // matches
      { igoProjectId_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { igoRequestId_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { projectManagerName_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { investigatorName_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { investigatorEmail_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { piEmail_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { dataAnalystName_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { dataAnalystEmail_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { genePanel_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { labHeadName_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { labHeadEmail_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { qcAccessEmails_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { dataAccessEmails_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
      { otherContactEmails_MATCHES: `(?i)${parsedSearchVals[0]}.*` },
    ];
  }

  return [];
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
