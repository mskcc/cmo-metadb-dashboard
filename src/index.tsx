import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import RequestView from "./pages/requestView/RequestViewPage";
import RequestSummary from "./pages/requestView/RequestSummary";
import reportWebVitals from "./reportWebVitals";
import { ApolloClient, InMemoryCache, ApolloProvider } from "@apollo/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const client = new ApolloClient({
  uri: "http://localhost:4000/graphql",
  cache: new InMemoryCache()
});

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <BrowserRouter>
    <ApolloProvider client={client}>
      <Routes>
        <Route path="/" element={<App />}>
          <Route path="/requests" element={<RequestView />}>
            <Route path=":igoRequestId" element={<RequestSummary />} />
          </Route>
        </Route>
      </Routes>
    </ApolloProvider>
  </BrowserRouter>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
