import {
  PatientWhere,
  PatientsListQuery,
  useGetPatientIdsTripletsLazyQuery,
  usePatientsListLazyQuery,
} from "../../generated/graphql";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import RecordsList from "../../components/RecordsList";
import { useParams } from "react-router-dom";
import { Col, Form } from "react-bootstrap";
import { AlertModal } from "../../components/AlertModal";
import { Tooltip } from "@material-ui/core";
import InfoIcon from "@material-ui/icons/InfoOutlined";
import { parseUserSearchVal } from "../../utils/parseSearchQueries";
import {
  PatientsListColumns,
  SampleMetadataDetailsColumns,
} from "../../shared/helpers";
import { getUserEmail } from "../../utils/getUserEmail";
import { openLoginPopup } from "../../utils/openLoginPopup";

// Mirror the field types in the CRDB, where CMO_ID is stored without the "C-" prefix
export type PatientIdsTriplet = {
  CMO_ID: string;
  PT_MRN: string;
  DMP_ID: string | null;
};

function patientFilterWhereVariables(
  parsedSearchVals: string[]
): PatientWhere[] {
  return parsedSearchVals.flatMap((searchVal) => [
    {
      patientAliasesIsAlias_SOME: {
        value_MATCHES: `(?i).*${searchVal}.*`,
      },
    },
    {
      hasSampleSamples_SOME: {
        hasMetadataSampleMetadata_SOME: {
          cmoSampleName_MATCHES: `(?i).*${searchVal}.*`,
        },
      },
    },
  ]);
}

function addCDashToCMOId(cmoId: string): string {
  return cmoId.length === 6 ? `C-${cmoId}` : cmoId;
}

const PHI_WARNING = {
  title: "Warning",
  content:
    "The information contained in this transmission from Memorial Sloan-Kettering Cancer Center is privileged, confidential and protected health information (PHI) and it is protected from disclosure under applicable law, including the Health Insurance Portability and Accountability Act of 1996, as amended (HIPAA). This transmission is intended for the sole use of approved individuals with permission and training to access this information and PHI. You are notified that your access to this transmission is logged. If you have received this transmission in error, please immediately delete this information and any attachments from any computer.",
};

const UNAUTHORIZED_WARNING = {
  title: "Access unauthorized",
  content:
    "You are not authorized to access PHI data. If you would like to request access, please reach out to the administrator.",
};

const NO_PHI_SEARCH_RESULTS = {
  title: "No PHI results found",
  content:
    "No PHI results were found for your search. No patient IDs in your search exist in either the SMILE or CRDB databases.",
};

interface IPatientsPageProps {
  userEmail: string | null;
  setUserEmail: Dispatch<SetStateAction<string | null>>;
}

export default function PatientsPage({
  userEmail,
  setUserEmail,
}: IPatientsPageProps) {
  const params = useParams();

  const [userSearchVal, setUserSearchVal] = useState<string>("");
  const [parsedSearchVals, setParsedSearchVals] = useState<string[]>([]);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [phiEnabled, setPhiEnabled] = useState(false);
  const [patientIdsTriplets, setPatientIdsTriplets] = useState<
    PatientIdsTriplet[]
  >([]);
  const [alertModal, setAlertModal] = useState<{
    show: boolean;
    title: string;
    content: string;
  }>({ show: false, title: "", content: "" });

  const [getPatientIdsTriplets] = useGetPatientIdsTripletsLazyQuery();

  async function fetchPatientIdsTriplets(
    patientIds: string[]
  ): Promise<string[]> {
    const { data, error } = await getPatientIdsTriplets({
      variables: {
        patientIds: patientIds,
      },
    });

    if (error) {
      if (error.message === "401") {
        openLoginPopup();
      }

      if (error.message === "403") {
        setAlertModal({
          show: true,
          ...UNAUTHORIZED_WARNING,
        });
      }

      return [];
    }

    const patientIdsTriplets = data?.patientIdsTriplets?.filter((triplet) =>
      Boolean(triplet)
    ) as PatientIdsTriplet[];

    if (patientIdsTriplets && patientIdsTriplets.length > 0) {
      setPatientIdsTriplets(patientIdsTriplets);

      return patientIdsTriplets.map((triplet) =>
        addCDashToCMOId(triplet?.CMO_ID as string)
      );
    } else {
      return [];
    }
  }

  async function handlePatientSearch() {
    let parsedSearchVals = parseUserSearchVal(userSearchVal);

    if (phiEnabled) {
      parsedSearchVals = parsedSearchVals.map((query) =>
        query.startsWith("C-") ? query.slice(2) : query
      );

      const customSearchVals = await fetchPatientIdsTriplets(parsedSearchVals);

      if (customSearchVals.length > 0) {
        setParsedSearchVals(customSearchVals);
      } else if (userEmail) {
        setAlertModal({
          show: true,
          ...NO_PHI_SEARCH_RESULTS,
        });

        setParsedSearchVals([]);
      }
    } else {
      setParsedSearchVals(parsedSearchVals);
    }
  }

  useEffect(() => {
    window.addEventListener("message", handleLogin);

    async function handleLogin(event: MessageEvent) {
      if (event.data !== "success") return;

      const userEmail = await getUserEmail();
      setUserEmail(userEmail);

      setAlertModal({
        show: true,
        ...PHI_WARNING,
      });

      handlePatientSearch();
    }

    return () => {
      window.removeEventListener("message", handleLogin);
    };
    // eslint-disable-next-line
  }, [phiEnabled]);

  let ActivePatientsListColumns = useMemo(() => {
    return PatientsListColumns.map((column) => {
      if (
        column.headerName === "Patient MRN" &&
        phiEnabled &&
        patientIdsTriplets.length > 0 &&
        userEmail
      ) {
        return {
          ...column,
          hide: false,
          valueGetter: ({
            data,
          }: {
            data: PatientsListQuery["patients"][number];
          }) => {
            const cmoId = data.cmoPatientId;

            const patientIdsTriplet = patientIdsTriplets.find(
              (triplet) => addCDashToCMOId(triplet.CMO_ID) === cmoId
            );

            if (patientIdsTriplet) {
              return patientIdsTriplet.PT_MRN;
            } else {
              return "";
            }
          },
        };
      } else {
        return column;
      }
    });
  }, [phiEnabled, patientIdsTriplets, userEmail]);

  const dataName = "patients";
  const sampleQueryParamFieldName = "patientId";
  const sampleQueryParamValue = params[sampleQueryParamFieldName];

  return (
    <>
      <RecordsList
        colDefs={ActivePatientsListColumns}
        dataName={dataName}
        lazyRecordsQuery={usePatientsListLazyQuery}
        queryFilterWhereVariables={patientFilterWhereVariables}
        userSearchVal={userSearchVal}
        setUserSearchVal={setUserSearchVal}
        parsedSearchVals={parsedSearchVals}
        setParsedSearchVals={setParsedSearchVals}
        handleSearch={handlePatientSearch}
        showDownloadModal={showDownloadModal}
        setShowDownloadModal={setShowDownloadModal}
        handleDownload={() => {
          if (phiEnabled) {
            setAlertModal({
              show: true,
              ...PHI_WARNING,
            });
          }
          setShowDownloadModal(true);
        }}
        samplesColDefs={SampleMetadataDetailsColumns}
        sampleContext={
          sampleQueryParamValue
            ? {
                fieldName: sampleQueryParamFieldName,
                values: [sampleQueryParamValue],
              }
            : undefined
        }
        setCustomSearchVals={setPatientIdsTriplets}
        customToolbarUI={
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
      />

      <AlertModal
        show={alertModal.show}
        onHide={() => {
          setAlertModal({ ...alertModal, show: false });
        }}
        title={alertModal.title}
        content={alertModal.content}
      />
    </>
  );
}
