import ReactDOM from "react-dom";
import "./index.scss";
import reportWebVitals from "./reportWebVitals";
import { ApolloClient, InMemoryCache, ApolloProvider } from "@apollo/client";
import { BrowserRouter } from "react-router-dom";
import { offsetLimitPagination } from "@apollo/client/utilities";
import App from "./App";

const cache = new InMemoryCache({
  /* @ts-ignore */
  typePolicies: {
    Query: {
      fields: {
        requests: offsetLimitPagination(),
      },
    },
    Sample: {
      keyFields: ["smileSampleId"],
    },
    SampleMetadata: {
      keyFields: ["primaryId"],
    },
  },
});

const client = new ApolloClient({
  uri:
    process.env.REACT_APP_GRAPHQL_CLIENT_URI === undefined
      ? "http://localhost:4000/graphql"
      : process.env.REACT_APP_GRAPHQL_CLIENT_URI,
  cache,
});

ReactDOM.render(
  <BrowserRouter>
    <ApolloProvider client={client}>
      <App />
    </ApolloProvider>
  </BrowserRouter>,
  document.getElementById("root") as HTMLElement
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
