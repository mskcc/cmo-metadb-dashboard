import { useDashboardSamplesLazyQuery } from "../generated/graphql";
import AutoSizer from "react-virtualized-auto-sizer";
import { Button, Col, Container } from "react-bootstrap";
import { Dispatch, SetStateAction, useCallback, useMemo, useRef } from "react";
import { DownloadModal } from "./DownloadModal";
import { UpdateModal } from "./UpdateModal";
import { AlertModal } from "./AlertModal";
import { buildTsvString } from "../utils/stringBuilders";
import {
  SampleChange,
  defaultColDef,
  isValidCostCenter,
} from "../shared/helpers";
import { AgGridReact } from "ag-grid-react";
import { AgGridReact as AgGridReactType } from "ag-grid-react/lib/agGridReact";
import { useState } from "react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import "ag-grid-enterprise";
import {
  CellValueChangedEvent,
  ColDef,
  IGetRowsParams,
} from "ag-grid-community";
import { ErrorMessage, Toolbar } from "../shared/tableElements";
import styles from "./records.module.scss";
import { getUserEmail } from "../utils/getUserEmail";
import { openLoginPopup } from "../utils/openLoginPopup";
import { Title } from "../shared/components/Title";
import { BreadCrumb } from "../shared/components/BreadCrumb";
import { useParams } from "react-router-dom";
import { DataName } from "../shared/types";
import { parseUserSearchVal } from "../utils/parseSearchQueries";

const POLLING_INTERVAL = 5000; // 5s
const CACHE_BLOCK_SIZE = 500;
const MAX_ROWS_EXPORT = 5000;
const MAX_ROWS_EXPORT_EXCEED_ALERT =
  "You can only download up to 5,000 rows of data at a time. Please refine your search and try again. If you need the full dataset, contact the SMILE team at cmosmile@mskcc.org.";
const COST_CENTER_VALIDATION_ALERT =
  "Please update your Cost Center/Fund Number input as #####/##### (5 digits, a forward slash, then 5 digits). For example: 12345/12345.";

export interface SampleContext {
  fieldName: string;
  values: string[];
}

interface ISampleListProps {
  columnDefs: ColDef[];
  setUnsavedChanges?: (unsavedChanges: boolean) => void;
  parentDataName?: DataName;
  sampleContext?: SampleContext;
  userEmail?: string | null;
  setUserEmail?: Dispatch<SetStateAction<string | null>>;
  customToolbarUI?: JSX.Element;
}

// TODOs
// - Replace usage of the old `samples` variable
// - Fix random rows' height expanding when loading new rows
// - Investigate console error "AG Grid: ImmutableService only works with ClientSideRowModel"
// - Test

export default function SamplesList({
  columnDefs,
  parentDataName,
  sampleContext,
  setUnsavedChanges,
  userEmail,
  setUserEmail,
  customToolbarUI,
}: ISampleListProps) {
  const [userSearchVal, setUserSearchVal] = useState<string>("");
  const [sampleCount, setSampleCount] = useState(0);

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [alertContent, setAlertContent] = useState<string | null>(null);

  const [changes, setChanges] = useState<SampleChange[]>([]);
  const [editMode, setEditMode] = useState(true);

  const gridRef = useRef<AgGridReactType>(null);
  const params = useParams();
  const hasParams = Object.keys(params).length > 0;

  const [, { error, data, fetchMore, refetch, startPolling, stopPolling }] =
    useDashboardSamplesLazyQuery({
      variables: {
        searchVals: [],
        sampleContext,
        limit: CACHE_BLOCK_SIZE,
        offset: 0,
      },
      pollInterval: POLLING_INTERVAL,
    });

  const samples = data?.dashboardSamples;

  const createDatasource = useCallback(
    ({ userSearchVal, sampleContext }) => {
      return {
        getRows: (params: IGetRowsParams) => {
          const { startRow, endRow, successCallback, failCallback } = params;

          const fetchInput = {
            searchVals: parseUserSearchVal(userSearchVal),
            sampleContext,
            limit: endRow - startRow,
            offset: startRow,
          };

          const thisFetch =
            startRow === 0
              ? refetch(fetchInput)
              : fetchMore({
                  variables: fetchInput,
                });

          return thisFetch
            .then((result) => {
              successCallback(
                result.data.dashboardSamples,
                result.data.dashboardSampleCount.totalCount
              );

              setSampleCount(result.data.dashboardSampleCount.totalCount);
            })
            .catch(() => {
              failCallback();
            });
        },
      };
    },
    [refetch, fetchMore]
  );

  const datasource = useMemo(() => {
    return createDatasource({ userSearchVal, sampleContext });
    // Exclude userSearchVal to avoid re-renders as user types a new search input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createDatasource]);

  async function handleSearch(userSearchVal: string) {
    const newDatasource = await createDatasource({
      userSearchVal,
      sampleContext,
    });
    gridRef.current?.api.setDatasource(newDatasource); // triggers a refresh
  }

  if (error) return <ErrorMessage error={error} />;

  async function onCellValueChanged(params: CellValueChangedEvent) {
    if (!editMode) return;

    const primaryId = params.data.primaryId;
    const fieldName = params.colDef.field!;
    const { oldValue, newValue, node: rowNode } = params;

    // prevent registering a change if no actual changes are made
    const noChangeInVal = rowNode.data[fieldName] === newValue;
    const noChangeInEmptyCell = !rowNode.data[fieldName] && !newValue;
    if (noChangeInVal || noChangeInEmptyCell) {
      const updatedChanges = changes.filter(
        (c) => !(c.primaryId === primaryId && c.fieldName === fieldName)
      );
      setChanges(updatedChanges);
      if (updatedChanges.length === 0) setUnsavedChanges?.(false);
      gridRef.current?.api?.refreshCells({ rowNodes: [rowNode] });
      return;
    }

    // add/update the billedBy cell to/in the changes array
    if (fieldName === "billed" && setUserEmail) {
      let currUserEmail = userEmail;

      if (!currUserEmail) {
        currUserEmail = await new Promise<string | null>((resolve) => {
          window.addEventListener("message", handleLogin);

          function handleLogin(event: MessageEvent) {
            if (event.data === "success") {
              getUserEmail().then((email) => {
                window.removeEventListener("message", handleLogin);
                resolve(email);
              });
            }
          }

          openLoginPopup();
        });

        if (!currUserEmail) return;
        setUserEmail(currUserEmail);
      }

      const currUsername = currUserEmail.split("@")[0];

      setChanges((changes) => {
        const billedBy = changes.find(
          (c) => c.primaryId === primaryId && c.fieldName === "billedBy"
        );
        if (billedBy) {
          billedBy.newValue = currUsername;
        } else {
          changes.push({
            primaryId,
            fieldName: "billedBy",
            oldValue: "",
            newValue: currUsername,
            rowNode,
          });
        }
        return [...changes];
      });
    }

    // add/update the edited cell to/in the changes array
    setChanges((changes) => {
      const change = changes.find(
        (c) => c.primaryId === primaryId && c.fieldName === fieldName
      );
      if (change) {
        change.newValue = newValue;
      } else {
        changes.push({ primaryId, fieldName, oldValue, newValue, rowNode });
      }
      return [...changes];
    });

    // validate Cost Center inputs
    if (fieldName === "costCenter" && !isValidCostCenter(newValue)) {
      setAlertContent(COST_CENTER_VALIDATION_ALERT);
    }

    setUnsavedChanges?.(true);
    gridRef.current?.api?.refreshCells({ rowNodes: [rowNode] });
  }

  const handleDiscardChanges = () => {
    setEditMode(false);

    setTimeout(() => {
      startPolling(POLLING_INTERVAL);
    }, 10000);

    setUnsavedChanges?.(false);
    setChanges([]);
    setTimeout(() => {
      setEditMode(true);
    }, 0);
  };

  return (
    <>
      <Container fluid>
        {!hasParams && <BreadCrumb currPageTitle="samples" />}
        <Title
          text={
            hasParams
              ? `Viewing ${parentDataName?.slice(0, -1)} ${
                  Object.values(params)?.[0]
                }'s samples`
              : "Samples"
          }
        />
      </Container>

      {showDownloadModal && (
        <DownloadModal
          loader={() => {
            const allColumns = gridRef.current?.columnApi?.getAllGridColumns();
            return sampleCount <= CACHE_BLOCK_SIZE
              ? Promise.resolve(
                  buildTsvString(samples!, columnDefs, allColumns)
                )
              : refetch({ limit: MAX_ROWS_EXPORT }).then((result) =>
                  buildTsvString(
                    result.data.dashboardSamples!,
                    columnDefs,
                    allColumns
                  )
                );
          }}
          onComplete={() => {
            setShowDownloadModal(false);
            // Reset the limit back to the default value of MAX_ROWS_TABLE.
            // Otherwise, polling will use the most recent value MAX_ROWS_EXPORT
            refetch({ limit: CACHE_BLOCK_SIZE });
          }}
          exportFileName={[
            parentDataName?.slice(0, -1),
            Object.values(params)?.[0],
            "samples.tsv",
          ]
            .filter(Boolean)
            .join("_")}
        />
      )}

      {showUpdateModal && (
        <UpdateModal
          changes={changes}
          samples={samples!}
          onSuccess={handleDiscardChanges}
          onHide={() => setShowUpdateModal(false)}
          onOpen={() => stopPolling()}
        />
      )}

      <AlertModal
        show={!!alertContent}
        onHide={() => setAlertContent(null)}
        title={"Warning"}
        content={alertContent}
      />

      <Toolbar
        dataName={"samples"}
        userSearchVal={userSearchVal}
        setUserSearchVal={setUserSearchVal}
        handleSearch={(userSearchVal) => handleSearch(userSearchVal)}
        matchingResultsCount={`${
          sampleCount ? sampleCount.toLocaleString() : "Loading"
        } matching samples`}
        handleDownload={() => {
          if (sampleCount > MAX_ROWS_EXPORT) {
            setAlertContent(MAX_ROWS_EXPORT_EXCEED_ALERT);
          } else {
            setShowDownloadModal(true);
          }
        }}
        customUILeft={customToolbarUI}
        customUIRight={
          changes.length > 0 ? (
            <>
              <Col md="auto">
                <Button
                  className={"btn btn-secondary"}
                  onClick={handleDiscardChanges}
                  size={"sm"}
                >
                  Discard Changes
                </Button>{" "}
                <Button
                  className={"btn btn-success"}
                  onClick={() => {
                    const hasInvalidCostCenter = changes.some(
                      (c) =>
                        c.fieldName === "costCenter" &&
                        !isValidCostCenter(c.newValue)
                    );
                    if (hasInvalidCostCenter) {
                      setAlertContent(COST_CENTER_VALIDATION_ALERT);
                    } else {
                      setShowUpdateModal(true);
                    }
                  }}
                  size={"sm"}
                >
                  Submit Updates
                </Button>
              </Col>
            </>
          ) : undefined
        }
      />

      <AutoSizer>
        {({ width }) => (
          <div
            className={`ag-theme-alpine ${
              hasParams ? styles.popupTableHeight : styles.tableHeight
            }`}
            style={{ width: width }}
          >
            <AgGridReact
              rowModelType="infinite"
              datasource={datasource}
              cacheBlockSize={CACHE_BLOCK_SIZE}
              getRowId={(d) => {
                return d.data.primaryId;
              }}
              rowClassRules={{
                unlocked: function (params) {
                  return params.data?.revisable === true;
                },
                locked: function (params) {
                  return params.data?.revisable === false;
                },
                "validation-error": function (params) {
                  return (
                    params.data?.revisable === true &&
                    (params.data?.validationStatus === false ||
                      params.data?.validationStatus === undefined)
                  );
                },
              }}
              columnDefs={columnDefs}
              rowData={samples!}
              onCellEditRequest={onCellValueChanged}
              readOnlyEdit={true}
              defaultColDef={defaultColDef}
              ref={gridRef}
              context={{
                getChanges: () => changes,
              }}
              enableRangeSelection={true}
              onGridReady={(params) => {
                params.api.sizeColumnsToFit();
              }}
              onFirstDataRendered={(params) => {
                params.columnApi.autoSizeAllColumns();
              }}
              tooltipShowDelay={0}
              tooltipHideDelay={60000}
              onFilterChanged={(params) => {
                setSampleCount(params.api.getDisplayedRowCount());
              }}
              onRowDataUpdated={() => {
                setSampleCount(data?.dashboardSampleCount?.totalCount || 0);
              }}
              onGridColumnsChanged={() => handleSearch(userSearchVal)}
            />
          </div>
        )}
      </AutoSizer>
    </>
  );
}
