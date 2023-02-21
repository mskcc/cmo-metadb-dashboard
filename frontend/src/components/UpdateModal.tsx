import { useState, FunctionComponent, useEffect } from "react";
import { Button } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { AgGridReact } from "ag-grid-react";
import "./UpdateModal.css";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { CellChange } from "../pages/requests/helpers";

export const UpdateModal: FunctionComponent<{
  changes: CellChange[];
  onHide: () => void;
}> = ({ changes, onHide }) => {
  const [rowData, setRowData] = useState(changes);
  const [columnDefs] = useState([
    { field: "primaryId" },
    { field: "field" },
    { field: "oldValue" },
    { field: "newValue" },
  ]);

  useEffect(() => {
    setRowData(changes);
  }, [changes]);

  return (
    <Modal
      show={true}
      size={"lg"}
      centered
      onHide={onHide}
      className={"modal-overlay"}
    >
      <Modal.Header closeButton>
        <Modal.Title id="contained-modal-title-vcenter">
          Are you sure?
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p>Are you sure you want to submit the following changes?</p>
        <div className="ag-theme-alpine" style={{ height: 350 }}>
          <AgGridReact rowData={rowData} columnDefs={columnDefs}></AgGridReact>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button className={"btn btn-secondary"} onClick={onHide}>
          Cancel
        </Button>
        <Button className={"btn btn-success"} onClick={onHide}>
          Submit Updates
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
