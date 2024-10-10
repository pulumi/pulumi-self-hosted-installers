import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";
import { RdsDatabase } from "./rds-db";

// Deploy RDS Aurora DB
const rds = new RdsDatabase("rds-aurora-db", {
    privateSubnetIds: config.privateSubnetIds,
    securityGroupId : config.nodeSecurityGroupId,
    replicas: config.dbReplicas,
    instanceType: config.dbInstanceType,
});
const db = rds.db;

// Export the DB connection information.
interface DbConn {
    host: pulumi.Output<string>;
    port: pulumi.Output<string>;
    username: pulumi.Output<string>;
    password: pulumi.Output<string>;
}
export const dbConn: DbConn = {
    host: db.endpoint,
    port: db.port.apply(port => port.toString()),
    username: db.masterUsername,
    password: rds.password, // db.masterPassword can possibly be undefined. Use rds.password instead.
};
