import { OpenSearch } from "./openSearch"
import * as k8s from "@pulumi/kubernetes";
import { types } from "@pulumi/kubernetes"
const consoleEnvVars: types.input.core.v1.EnvVar[] = []
const apiEnvVars: types.input.core.v1.EnvVar[] = []


// const os = new OpenSearch("opensearc", {
//     namespace: 
// }, {})

// apiEnvVars.concat(os.envVars)