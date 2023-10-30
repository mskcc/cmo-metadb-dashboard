import {
  PatientAliasWhere,
  SampleWhere,
  usePatientsListLazyQuery,
} from "../../generated/graphql";
import { useEffect, useRef, useState } from "react";
import { PatientsListColumns } from "../../shared/helpers";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import "ag-grid-enterprise";
import RecordsList from "../../components/RecordsList";
import { useParams } from "react-router-dom";
import PageHeader from "../../shared/components/PageHeader";
import { Col, Form } from "react-bootstrap";
import { AlertModal } from "../../components/AlertModal";
import { Tooltip } from "@material-ui/core";
import InfoIcon from "@material-ui/icons/InfoOutlined";

type PatientIdsTriplet = {
  dmpId: string;
  cmoId: string;
  ptMrn: string;
};

function patientAliasFilterWhereVariables(
  uniqueQueries: string[]
): PatientAliasWhere[] {
  if (uniqueQueries.length > 1) {
    return [
      { value_IN: uniqueQueries },
      { namespace_IN: uniqueQueries },
      {
        isAliasPatients_SOME: {
          hasSampleSamples_SOME: {
            hasMetadataSampleMetadata_SOME: {
              cmoSampleName_IN: uniqueQueries,
            },
          },
        },
      },
      {
        isAliasPatients_SOME: {
          hasSampleSamples_SOME: {
            hasMetadataSampleMetadata_SOME: {
              primaryId_IN: uniqueQueries,
            },
          },
        },
      },
    ];
  } else {
    return [
      { value_CONTAINS: uniqueQueries[0] },
      { namespace_CONTAINS: uniqueQueries[0] },
      {
        isAliasPatients_SOME: {
          hasSampleSamples_SOME: {
            hasMetadataSampleMetadata_SOME: {
              cmoSampleName_CONTAINS: uniqueQueries[0],
            },
          },
        },
      },
      {
        isAliasPatients_SOME: {
          hasSampleSamples_SOME: {
            hasMetadataSampleMetadata_SOME: {
              primaryId_CONTAINS: uniqueQueries[0],
            },
          },
        },
      },
    ];
  }
}

function addCDashToCMOId(cmoId: string): string {
  return cmoId.length === 6 ? `C-${cmoId}` : cmoId;
}

export default function PatientsPage({ setUserEmail }: { setUserEmail: any }) {
  const params = useParams();
  const childRef = useRef<any>(null);

  const [phiEnabled, setPhiEnabled] = useState(false);
  const [patientIdsTriplets, setPatientIdsTriplets] = useState<
    PatientIdsTriplet[]
  >([]);
  const [patientsListColumns, setPatientsListColumns] =
    useState(PatientsListColumns);
  const [popupOpen, setPopupOpen] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  useEffect(() => {
    function handleLogin(event: any) {
      if (event.origin !== "http://localhost:4001") return;
      setUserEmail(event.data);
      setPopupOpen(false);
      childRef.current.handleSearch();
    }

    if (popupOpen) {
      window.addEventListener("message", handleLogin);
      return () => {
        window.removeEventListener("message", handleLogin);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupOpen]);

  useEffect(() => {
    if (phiEnabled && patientIdsTriplets.length > 0) {
      const colsWithMRNs = PatientsListColumns.map((column) => {
        if (column.headerName === "Patient MRN") {
          return {
            ...column,
            hide: false,
            valueGetter: (params: any) => {
              const cmoId = params.data.value;
              const patientIdsTriplet = patientIdsTriplets.find(
                (triplet) => addCDashToCMOId(triplet.cmoId) === cmoId
              );
              if (patientIdsTriplet) {
                return patientIdsTriplet.ptMrn;
              } else {
                return "";
              }
            },
          };
        } else {
          return column;
        }
      });
      setPatientsListColumns(colsWithMRNs);
    } else {
      setPatientsListColumns(PatientsListColumns);
    }
  }, [phiEnabled, patientIdsTriplets]);

  async function fetchPatientIdsTriplets(
    patientMrns: string[]
  ): Promise<string[]> {
    try {
      const response = await fetch("http://localhost:4001/mrn-search", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patientMrns),
      });

      if (response.status === 403) {
        setShowAlertModal(true);
        return [];
      }

      if (response.status === 401) {
        setPopupOpen(true);

        const width = 800;
        const height = 800;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        window.open(
          "http://localhost:4001/login",
          "_blank",
          `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`
        );
        return [];
      }

      const data: PatientIdsTriplet[] = await response.json();
      setPatientIdsTriplets(data);
      return data.map((d) => addCDashToCMOId(d.cmoId));
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  const pageRoute = "/patients";
  const sampleQueryParamFieldName = "cmoPatientId";

  return (
    <>
      <PageHeader pageTitle={"patients"} pageRoute={pageRoute} />

      <RecordsList
        lazyRecordsQuery={usePatientsListLazyQuery}
        nodeName="patientAliases"
        totalCountNodeName="patientAliasesConnection"
        pageRoute={pageRoute}
        searchTerm="patients"
        colDefs={patientsListColumns}
        conditionBuilder={patientAliasFilterWhereVariables}
        sampleQueryParamFieldName={sampleQueryParamFieldName}
        sampleQueryParamValue={params[sampleQueryParamFieldName]}
        searchVariables={
          {
            OR: [
              {
                patientsHasSampleConnection_SOME: {
                  node: {
                    patientAliasesIsAlias_SOME: {
                      value: params[sampleQueryParamFieldName],
                    },
                  },
                },
              },
            ],
          } as SampleWhere
        }
        customFilterUI={
          <>
            <Col md="auto" className="mt-1">
              <div className="vr"></div>
            </Col>

            <Col md="auto" className="mt-1">
              <Form>
                <Form.Check
                  type="switch"
                  id="custom-switch"
                  label="PHI-enabled"
                  checked={phiEnabled}
                  onChange={(e) => {
                    setPhiEnabled(e.target.checked);
                  }}
                />
              </Form>
            </Col>

            <Col md="auto" style={{ marginLeft: -15 }}>
              <Tooltip
                title={
                  <span style={{ fontSize: 12 }}>
                    When enabled, you can search for patients by either their
                    MRN, CMO Patient ID, or DMP Patient ID. The results will
                    include an additional column with the patient's MRN.
                  </span>
                }
              >
                <InfoIcon style={{ fontSize: 18, color: "grey" }} />
              </Tooltip>
            </Col>
          </>
        }
        customFilterState={phiEnabled}
        setCustomFilterVals={setPatientIdsTriplets}
        customFilterFunc={fetchPatientIdsTriplets}
        ref={childRef}
      />

      <AlertModal
        show={showAlertModal}
        onHide={() => {
          setShowAlertModal(false);
        }}
        title={"Access unauthorized"}
        content={
          "You are not authorized to access PHI data. If you would like to request access, please reach out to the administrator."
        }
      />
    </>
  );
}
