import AutoSizer from "react-virtualized-auto-sizer";
import { Button, Col, Container, Form, Row, Modal } from "react-bootstrap";
import React, { FunctionComponent, useMemo } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import classNames from "classnames";
import { DownloadModal } from "./DownloadModal";
import Spinner from "react-spinkit";
import { CSVFormulate } from "../lib/CSVExport";
import { AgGridReact } from "ag-grid-react";
import { useState } from "react";
import styles from "./records.module.scss";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import "ag-grid-enterprise";
import { ColDef, IServerSideGetRowsParams } from "ag-grid-community";
import { useHookGeneric } from "../shared/types";
import { SamplesList } from "./SamplesList";
import { SampleMetadata, SampleMetadataWhere } from "../generated/graphql";
import { debug } from "console";

export interface IRecordsListProps {
  lazyRecordsQuery: typeof useHookGeneric;
  nodeName: string;
  totalCountNodeName: string;
  pageRoute: string;
  idFieldName: string;
  colDefs: ColDef[];
  samplesEditorTitle: string | undefined;
  conditionBuilder: (val: string) => Record<string, any>[];
  sampleQueryParamValue: string | undefined;
  sampleQueryParamFieldName: string;
}

const RecordsList: FunctionComponent<IRecordsListProps> = ({
  lazyRecordsQuery,
  nodeName,
  totalCountNodeName,
  pageRoute,
  idFieldName,
  colDefs,
  conditionBuilder,
  samplesEditorTitle,
  sampleQueryParamValue,
  sampleQueryParamFieldName,
}) => {
  const [val, setVal] = useState("");
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [showClosingWarning, setShowClosingWarning] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const navigate = useNavigate();
  const urlParams = useParams();

  // not we aren't using initial fetch
  const [initialFetch, { loading, error, data, fetchMore, refetch }] =
    lazyRecordsQuery({
      variables: {
        options: { limit: 20, offset: 0 },
      },
    });

  const datasource = useMemo(() => {
    return {
      // called by the grid when more rows are required
      getRows: (params: IServerSideGetRowsParams) => {
        const fetchInput = {
          where: {
            OR: conditionBuilder(val),
          },
          //   requestsConnectionWhere2: {
          //     OR: conditionBuilder(val),
          //   },
          options: {
            offset: params.request.startRow,
            limit: params.request.endRow,
            sort: params.request.sortModel.map((sortModel) => {
              return { [sortModel.colId]: sortModel.sort?.toUpperCase() };
            }),
          },
        };

        // if this is NOT first call, use refetch
        // (which is analogous in this case to the original fetch
        const thisFetch =
          params.request.startRow! === 0
            ? refetch(fetchInput)
            : fetchMore({
                variables: fetchInput,
              });

        return thisFetch.then((d: any) => {
          params.success({
            rowData: d.data[nodeName],
            rowCount: d.data?.[totalCountNodeName]?.totalCount,
          });
        });
      },
    };
  }, [val]);

  if (loading)
    return (
      <div className={"centralSpinner"}>
        <Spinner fadeIn={"none"} color={"lightblue"} name="ball-grid-pulse" />
      </div>
    );

  if (error) return <p>Error :(</p>;

  console.log(data);
  const remoteCount = data?.[totalCountNodeName]?.totalCount;
  const pageTitle = nodeName.charAt(0).toUpperCase() + nodeName.slice(1);
  const pageLink = `/${pageRoute}`;

  const handleClose = () => {
    if (unsavedChanges) {
      setShowClosingWarning(true);
    } else {
      navigate(pageLink);
    }
  };

  return (
    <Container fluid>
      {showDownloadModal && (
        <DownloadModal
          loader={() => {
            return fetchMore({
              variables: {
                where: {
                  OR: conditionBuilder(val),
                },
                options: {
                  offset: 0,
                  limit: undefined,
                },
              },
            }).then(({ data }: any) => {
              return CSVFormulate(data[nodeName], colDefs);
            });
          }}
          onComplete={() => setShowDownloadModal(false)}
          exportFileName={`${nodeName}.tsv`}
        />
      )}

      {showClosingWarning && (
        <Modal
          show={true}
          centered
          onHide={() => setShowClosingWarning(false)}
          className={styles.overlay}
        >
          <Modal.Header closeButton>
            <Modal.Title id="contained-modal-title-vcenter">
              Are you sure?
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              You have unsaved changes. Are you sure you want to exit this view?
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              className={"btn btn-secondary"}
              onClick={() => setShowClosingWarning(false)}
            >
              Cancel
            </Button>
            <Button
              className={"btn btn-danger"}
              onClick={() => {
                setShowClosingWarning(false);
                setUnsavedChanges(false);
                navigate("/requests");
              }}
            >
              Continue Exiting
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {urlParams[idFieldName] && (
        <AutoSizer>
          {({ height, width }) => (
            <Modal show={true} dialogClassName="modal-90w" onHide={handleClose}>
              <Modal.Header closeButton>
                <Modal.Title>{samplesEditorTitle || ""}</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <div style={{ height: 600 }}>
                  <SamplesList
                    height={height * 11}
                    searchVariables={
                      {
                        [idFieldName]: urlParams[idFieldName],
                      } as SampleMetadataWhere
                    }
                    setUnsavedChanges={setUnsavedChanges}
                    exportFileName={`${idFieldName}_${urlParams[idFieldName]}.tsv`}
                  />
                </div>
              </Modal.Body>
            </Modal>
          )}
        </AutoSizer>
      )}

      <Row
        className={classNames(
          "d-flex justify-content-between align-items-center",
          "tableControlsRow"
        )}
      >
        <Col></Col>
        <Col className={"text-end"}>
          <Form.Control
            className={"d-inline-block"}
            style={{ width: "300px" }}
            type="search"
            placeholder={"Search " + pageTitle}
            aria-label="Search"
            defaultValue={val}
            onInput={(event) => {
              const value = event.currentTarget.value;

              if (typingTimeout) {
                clearTimeout(typingTimeout);
              }

              const to = setTimeout(() => {
                setVal(value);
              }, 500);
              setTypingTimeout(to);
            }}
          />
        </Col>

        <Col className={"text-start"}>
          {remoteCount} matching {nodeName}
        </Col>

        <Col className={"text-end"}>
          <Button
            onClick={() => {
              setShowDownloadModal(true);
            }}
            size={"sm"}
          >
            Generate Report
          </Button>
        </Col>
      </Row>
      <AutoSizer>
        {({ width }) => (
          <div
            className="ag-theme-alpine"
            style={{ height: 540, width: width }}
          >
            <AgGridReact
              rowModelType={"serverSide"}
              columnDefs={colDefs}
              serverSideDatasource={datasource}
              serverSideInfiniteScroll={true}
              cacheBlockSize={20}
              debug={false}
              context={{
                navigateFunction: navigate,
              }}
            />
          </div>
        )}
      </AutoSizer>
    </Container>
  );
};

export default RecordsList;
