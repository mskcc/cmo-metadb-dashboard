import React, { FunctionComponent, useState } from "react";
import { Col, Container, Form, Row, Button } from "react-bootstrap";
import classNames from "classnames";

export const PatientsPage: FunctionComponent = () => {
  return <Patients />;
};

const Patients: FunctionComponent = () => {
  const [val, setVal] = useState("");
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  return (
    <Container fluid>
      <Row className="pagetitle">
        <Col>
          <nav>
            <ol className="breadcrumb">
              <li className="breadcrumb-item">
                <a href="/">Home</a>
              </li>
              <li className="breadcrumb-item active">Patients</li>
            </ol>
          </nav>
          <h1>Patients</h1>
        </Col>
      </Row>

      <Row
        className={classNames(
          "d-flex justify-content-between align-items-center",
          "tableControlsRow"
        )}
      >
        <Col className={"text-end"}>
          <Form.Control
            className={"d-inline-block"}
            style={{ width: "300px" }}
            type="search"
            placeholder="Search by CMO Patient ID"
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
          <Button onClick={() => {}}>Search</Button>
        </Col>
      </Row>
    </Container>
  );
};
