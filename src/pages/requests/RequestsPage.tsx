import "./requests.scss";
import { useRequestsListQuery } from "../../generated/graphql";
import { makeAutoObservable } from "mobx";
import {
  InfiniteLoader,
  Table,
  Column,
  AutoSizer,
  IndexRange,
  Index
} from "react-virtualized";
import { Button, Col, Container, Form, Row, Modal } from "react-bootstrap";
import "react-virtualized/styles.css";
import React, { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import classNames from "classnames";
import { buildRequestTableColumns, StaticTableColumns } from "./helpers";
import { RequestSummary } from "./RequestSummary";
import { DownloadModal } from "../../components/DownloadModal";
import Spinner from "react-spinkit";
import { CSVFormulate } from "../../lib/CSVExport";

function createStore() {
  return makeAutoObservable({
    filter: "",
    selectedRequest: "",
    showRequestDetails: false
  });
}

const store = createStore();

export const RequestsPage: React.FunctionComponent = props => {
  return <Requests />;
};

export default RequestsPage;

const Requests = () => {
  const [val, setVal] = useState("");
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<any>(null);
  const [prom, setProm] = useState<any>(Promise.resolve());
  const navigate = useNavigate();
  const params = useParams();

  const RequestTableColumns = buildRequestTableColumns(navigate);

  const { loading, error, data, refetch, fetchMore } = useRequestsListQuery({
    variables: {
      where: {
        OR: requestFilterWhereVariables(store.filter)
      },
      requestsConnectionWhere2: {
        OR: requestFilterWhereVariables(store.filter)
      },
      options: { limit: 20, offset: 0 }
    }
  });

  if (loading)
    return (
      <div className={"centralSpinner"}>
        <Spinner fadeIn={"none"} color={"lightblue"} name="ball-grid-pulse" />
      </div>
    );

  if (error) return <p>Error :(</p>;

  // returns variables to filter requests by in where clauses
  function requestFilterWhereVariables(value: string) {
    return [
      { igoProjectId_CONTAINS: value },
      { igoRequestId_CONTAINS: value },
      { genePanel_CONTAINS: value },
      { dataAnalystEmail_CONTAINS: value },
      { dataAnalystName_CONTAINS: value },
      { investigatorEmail_CONTAINS: value },
      { investigatorName_CONTAINS: value },
      { labHeadEmail_CONTAINS: value },
      { libraryType_CONTAINS: value },
      { labHeadName_CONTAINS: value },
      { namespace_CONTAINS: value },
      { piEmail_CONTAINS: value },
      { otherContactEmails_CONTAINS: value },
      { projectManagerName_CONTAINS: value },
      { qcAccessEmails_CONTAINS: value }
    ];
  }

  function loadMoreRows(
    { startIndex, stopIndex }: IndexRange,
    fetchMore: (props: any) => Promise<any>
  ) {
    return fetchMore({
      variables: {
        options: {
          offset: startIndex,
          limit: stopIndex
        }
      }
    });
  }

  function loadAllRows(fetchMore: any, filter: string) {
    return () => {
      return fetchMore({
        variables: {
          where: {
            OR: requestFilterWhereVariables(filter)
          },
          options: {
            offset: 0,
            limit: undefined
          }
        }
      });
    };
  }

  function isRowLoaded({ index }: Index) {
    return index < data!.requests.length;
  }

  function rowGetter({ index }: Index) {
    if (!data!.requests[index]) {
      return "";
    }
    return data!.requests[index];
  }

  const title = params.requestId
    ? `Viewing Request ${params.requestId}`
    : "Requests";

  const remoteCount = data!.requestsConnection.totalCount;

  return (
    <Container fluid>
      {showDownloadModal && (
        <DownloadModal
          loader={() => {
            return fetchMore({
              variables: {
                where: {
                  OR: requestFilterWhereVariables(val)
                },
                options: {
                  offset: 0,
                  limit: undefined
                }
              }
            }).then(({ data }) => {
              return CSVFormulate(data.requests, StaticTableColumns);
            });
          }}
          onComplete={() => setShowDownloadModal(false)}
          exportFilename={"requests.tsv"}
        />
      )}

      <Row className="pagetitle">
        <Col>
          <nav>
            <ol className="breadcrumb">
              <li className="breadcrumb-item">
                <a href="/">Home</a>
              </li>
              <li className="breadcrumb-item active">
                <NavLink to={"/requests"}>Requests</NavLink>
              </li>
              {params.requestId && (
                <li className="breadcrumb-item active">{params.requestId}</li>
              )}
            </ol>
          </nav>
          <h1>{title}</h1>
        </Col>
      </Row>

      {params.requestId && (
        <Modal
          show={true}
          dialogClassName="modal-90w"
          onHide={() => navigate("/requests")}
        >
          <Modal.Header closeButton>
            <Modal.Title>Viewing {params.requestId}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div>
              <RequestSummary params={params} />
            </div>
          </Modal.Body>
        </Modal>
      )}

      <Row
        className={classNames(
          "d-flex justify-content-between align-items-center"
        )}
      >
        <Col></Col>
        <Col className={"text-end"}>
          <Form.Control
            className={"d-inline-block"}
            style={{ width: "300px" }}
            type="search"
            placeholder="Search Requests"
            aria-label="Search"
            value={val}
            onInput={event => {
              const value = event.currentTarget.value;

              if (value !== null) {
                setVal(value);
              }

              if (typingTimeout) {
                clearTimeout(typingTimeout);
              }

              prom.then(() => {
                const to = setTimeout(() => {
                  const rf = refetch({
                    where: {
                      OR: requestFilterWhereVariables(value)
                    },
                    requestsConnectionWhere2: {
                      OR: requestFilterWhereVariables(value)
                    },
                    options: { limit: 20, offset: 0 }
                  });
                  setProm(rf);
                }, 500);
                setTypingTimeout(to);
              });
            }}
          />
        </Col>

        <Col className={"text-start"}>{remoteCount} matching requests</Col>

        <Col className={"text-end"}>
          <Button
            onClick={() => {
              setShowDownloadModal(true);
            }}
          >
            Generate Report
          </Button>
        </Col>
      </Row>

      <Row>
        <InfiniteLoader
          isRowLoaded={isRowLoaded}
          loadMoreRows={params => {
            return loadMoreRows(params, fetchMore);
          }}
          rowCount={remoteCount}
        >
          {({ onRowsRendered, registerChild }) => (
            <AutoSizer>
              {({ width }) => (
                <Table
                  className="table"
                  ref={registerChild}
                  width={width}
                  height={540}
                  headerHeight={60}
                  rowHeight={40}
                  rowCount={remoteCount}
                  onRowsRendered={onRowsRendered}
                  rowGetter={rowGetter}
                  onRowClick={info => {
                    store.selectedRequest = info.rowData.igoRequestId;
                    store.showRequestDetails = true;
                  }}
                  onRowDoubleClick={info => {
                    store.showRequestDetails = false;
                  }}
                >
                  {RequestTableColumns.map(col => {
                    return (
                      <Column
                        headerRenderer={col.headerRender}
                        label={col.label}
                        dataKey={`${col.dataKey}`}
                        cellRenderer={col.cellRenderer}
                        width={col.width || 100}
                      />
                    );
                  })}
                </Table>
              )}
            </AutoSizer>
          )}
        </InfiniteLoader>
      </Row>
    </Container>
  );
};
